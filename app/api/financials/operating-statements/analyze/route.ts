import { NextResponse } from "next/server";
import { getMapping } from "@/lib/financials/operating-statements/mappingStore";
import { latestGl, getTransactions, saveNote, getNotesBundle } from "@/lib/financials/operating-statements/statementStore";
import { summaryForPeriod } from "@/lib/financials/operating-statements/glParser";
import { computeStatement } from "@/lib/financials/operating-statements/compute";
import { resolvePropertyBudget, makeBudgetLookup, budgetDetailForMask } from "@/lib/financials/operating-statements/budgetCrosswalk";
import { accountMatchesMask } from "@/lib/financials/operating-statements/mask";
import { buildTenantLookup } from "@/lib/financials/operating-statements/tenants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const r0 = (v: number) => Math.round(v);
const r2 = (v: number) => Math.round(v * 100) / 100;
function varPct(v: number | null, b: number | null): number | null {
  if (v == null || b == null || Math.abs(b) < 0.5) return null;
  return (v / Math.abs(b)) * 100;
}
function hot(v: number | null, b: number | null, dollar: number, pct: number): "fav" | "unf" | null {
  if (v == null || b == null) return null;
  const vp = varPct(v, b);
  if (!(Math.abs(v) > dollar || (vp != null && Math.abs(vp) > pct))) return null;
  return v >= 0 ? "fav" : "unf";
}

// POST — analyze a property's flagged lines and auto-fill each line's note with
// an explanation. Gathers per-line budget detail + GL transactions and asks
// Claude for a concise, accounting-savvy note per line, then saves them.
export async function POST(req: Request) {
  let body: { key?: string; year?: number; period?: number; dollar?: number; pct?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  const { key, year } = body;
  const dollar = body.dollar ?? 5000;
  const pct = body.pct ?? 10;
  if (!key || !year) return NextResponse.json({ error: "key and year are required" }, { status: 400 });

  const mapping = await getMapping(key);
  const stored = await latestGl(key, year);
  if (!mapping || !stored) return NextResponse.json({ error: "No statement to analyze." }, { status: 404 });

  const period = Math.min(Math.max(1, body.period || stored.maxPeriodInFile), stored.maxPeriodInFile);
  const gl = summaryForPeriod(stored.monthly, period);
  const budget = await resolvePropertyBudget(mapping.propertyCode, year);
  const budgetLookup = budget ? makeBudgetLookup(budget, period) : undefined;
  const statement = computeStatement({ mapping, propertyName: mapping.entityName, year, period, gl, budgetLookup });
  const txByAccount = await getTransactions(stored.id);

  // Tenant-name lookup so notes can name tenants instead of GL/unit codes.
  const tenantFor = await buildTenantLookup();

  // Preserve manual notes: don't analyze (or overwrite) a line the user has
  // already written/edited a note for. Auto-explain only fills empty lines and
  // refreshes its own prior AI notes.
  const { notes: existingNotes, sources: existingSources } = await getNotesBundle(key, year);
  const hasManualNote = (lk: string) => existingSources[lk] === "user" && !!(existingNotes[lk] || "").trim();

  const flagged: Record<string, unknown>[] = [];
  for (const sec of statement.sections) {
    const sign = sec.role === "revenue" || sec.role === "reimbursement" ? -1 : 1;
    for (const l of sec.lines) {
      const cls = hot(l.ytdVariance, l.ytdBudget, dollar, pct) ?? hot(l.periodVariance, l.periodBudget, dollar, pct);
      if (!cls) continue;
      const lineKey = `${sec.name}::${l.label}`;
      if (hasManualNote(lineKey)) continue; // keep the user's manual note
      const bd = budget ? budgetDetailForMask(budget, l.mask, period) : [];
      const accts = Object.keys(txByAccount).filter((a) => accountMatchesMask(l.mask, a));
      const txs: { date: string | null; description: string; amount: number }[] = [];
      for (const a of accts) for (const t of txByAccount[a]) if (t.month <= period) txs.push({ date: t.date, description: t.description, amount: t.amount * sign });
      txs.sort((x, y) => Math.abs(y.amount) - Math.abs(x.amount));
      // Per-tenant contributors to this line (only where we can name the tenant).
      const tenants = gl
        .filter((g) => accountMatchesMask(l.mask, g.account))
        .map((g) => ({ name: tenantFor(g.account), ytd: r0(g.ytdActual * sign) }))
        .filter((c): c is { name: string; ytd: number } => !!c.name && c.ytd !== 0)
        .sort((a, b) => Math.abs(b.ytd) - Math.abs(a.ytd))
        .slice(0, 10);
      flagged.push({
        lineKey, section: sec.name, line: l.label, classification: cls === "unf" ? "unfavorable" : "favorable",
        ytdActual: r0(l.ytdActual), ytdBudget: l.ytdBudget == null ? null : r0(l.ytdBudget), ytdVariance: l.ytdVariance == null ? null : r0(l.ytdVariance),
        budgetedFor: bd.map((b) => ({ label: b.label, ytd: r0(b.ytd) })),
        ...(tenants.length ? { tenants } : {}),
        transactionCount: txs.length,
        topTransactions: txs.slice(0, 8).map((t) => ({ date: t.date, description: t.description.slice(0, 80), amount: r2(t.amount) })),
      });
    }
  }

  if (!flagged.length) return NextResponse.json({ notes: {}, message: "No flagged lines to analyze." });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI analysis isn't configured (ANTHROPIC_API_KEY not set)." }, { status: 503 });

  const prompt =
    `You are a commercial real estate accountant reviewing ${statement.propertyCode} ${statement.propertyName}'s operating statement vs budget, YTD through period ${period}, year ${year}. ` +
    `For each flagged line, write ONE concise note (max ~35 words) that explains the variance by pointing to the SPECIFIC item(s) driving it, then the action to verify.\n\n` +
    `HARD RULES:\n` +
    `1. Do NOT restate the line's actual total, budget total, or variance — they are already shown in the table beside the note. A note that opens with "Two PECO bills totaling $912 vs. $660 budget" or "$5,054 vs budgeted $3,056" is WRONG and unusable. Never begin with the line totals.\n` +
    `2. LEAD with the concrete driver from the data: the specific GL transaction(s) (name the vendor and what it was) from "topTransactions", the specific budget sub-line that was or wasn't funded from "budgetedFor", or the specific tenant from "tenants". Identify WHICH item caused it, not that a variance exists.\n` +
    `3. You MAY cite a single transaction's amount when it pinpoints the cause (e.g. "a one-time $848 charge from ABC Paving"), but NEVER the line or budget totals.\n` +
    `4. When a line includes a "tenants" list, attribute the variance to those tenant NAME(S). NEVER cite a raw GL or unit code (e.g. "1100-12330", "unit 34") — use the tenant's name; codes mean nothing to the reader.\n` +
    `5. End with what to verify. No generic filler, no hedging boilerplate.\n\n` +
    `GOOD example: "Extra Q1 visit from Green Scapes appears one-time — budget assumed the standard monthly contract. Confirm whether the Jan 14 invoice is storm cleanup or a permanent rate increase."\n` +
    `GOOD example: "New lease for Acme Corp not reflected in the budget model. Verify the lease abstract and that billed base rent matches the executed step-up schedule."\n` +
    `BAD example (never do this): "Three rent charges total $5,054 vs. budgeted $3,056. Verify…"\n\n` +
    `Amounts are dollars; a "favorable" variance is good (revenue over / expense under budget). ` +
    `Return ONLY a JSON object mapping each line's exact "lineKey" to its note string.\n\n` +
    `FLAGGED LINES:\n${JSON.stringify(flagged, null, 1)}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 2000, messages: [{ role: "user", content: prompt }] }),
    });
    if (!res.ok) return NextResponse.json({ error: `Analysis failed (${res.status}).` }, { status: 502 });
    const j = await res.json();
    const text: string = (j?.content ?? []).filter((b: { type?: string }) => b?.type === "text").map((b: { text?: string }) => b.text ?? "").join("");
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return NextResponse.json({ error: "Couldn't parse the analysis." }, { status: 502 });
    const notes = JSON.parse(match[0]) as Record<string, string>;

    const saved: Record<string, string> = {};
    for (const f of flagged) {
      const lk = f.lineKey as string;
      const note = notes[lk];
      if (typeof note === "string" && note.trim()) {
        await saveNote(key, year, lk, note.trim(), "ai");
        saved[lk] = note.trim();
      }
    }
    return NextResponse.json({ notes: saved, analyzed: flagged.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Analysis failed" }, { status: 500 });
  }
}

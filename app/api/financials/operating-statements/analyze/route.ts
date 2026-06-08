import { NextResponse } from "next/server";
import { getMapping } from "@/lib/financials/operating-statements/mappingStore";
import { latestGl, getTransactions, saveNote } from "@/lib/financials/operating-statements/statementStore";
import { summaryForPeriod } from "@/lib/financials/operating-statements/glParser";
import { computeStatement } from "@/lib/financials/operating-statements/compute";
import { resolvePropertyBudget, makeBudgetLookup, budgetDetailForMask } from "@/lib/financials/operating-statements/budgetCrosswalk";
import { accountMatchesMask } from "@/lib/financials/operating-statements/mask";

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

  const flagged: Record<string, unknown>[] = [];
  for (const sec of statement.sections) {
    const sign = sec.role === "revenue" || sec.role === "reimbursement" ? -1 : 1;
    for (const l of sec.lines) {
      const cls = hot(l.ytdVariance, l.ytdBudget, dollar, pct) ?? hot(l.periodVariance, l.periodBudget, dollar, pct);
      if (!cls) continue;
      const lineKey = `${sec.name}::${l.label}`;
      const bd = budget ? budgetDetailForMask(budget, l.mask, period) : [];
      const accts = Object.keys(txByAccount).filter((a) => accountMatchesMask(l.mask, a));
      const txs: { date: string | null; description: string; amount: number }[] = [];
      for (const a of accts) for (const t of txByAccount[a]) if (t.month <= period) txs.push({ date: t.date, description: t.description, amount: t.amount * sign });
      txs.sort((x, y) => Math.abs(y.amount) - Math.abs(x.amount));
      flagged.push({
        lineKey, section: sec.name, line: l.label, classification: cls === "unf" ? "unfavorable" : "favorable",
        ytdActual: r0(l.ytdActual), ytdBudget: l.ytdBudget == null ? null : r0(l.ytdBudget), ytdVariance: l.ytdVariance == null ? null : r0(l.ytdVariance),
        budgetedFor: bd.map((b) => ({ label: b.label, ytd: r0(b.ytd) })),
        transactionCount: txs.length,
        topTransactions: txs.slice(0, 6).map((t) => ({ date: t.date, description: t.description.slice(0, 80), amount: r2(t.amount) })),
      });
    }
  }

  if (!flagged.length) return NextResponse.json({ notes: {}, message: "No flagged lines to analyze." });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI analysis isn't configured (ANTHROPIC_API_KEY not set)." }, { status: 503 });

  const prompt =
    `You are a commercial real estate accountant reviewing ${statement.propertyCode} ${statement.propertyName}'s operating statement vs budget, YTD through period ${period}, year ${year}. ` +
    `For each flagged line below, write one concise note (max ~40 words) giving the MOST LIKELY reason for the variance and what to verify — reference the budgeted line label(s) and specific transaction(s) when relevant (timing, reclassification/mis-coding, seasonal, one-time, missing accrual, etc.). Be concrete and useful; no generic filler. ` +
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

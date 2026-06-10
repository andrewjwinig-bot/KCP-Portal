import { NextResponse } from "next/server";
import { getMapping } from "@/lib/financials/operating-statements/mappingStore";
import { assembledGl, getTransactions, saveNote, getNotesBundle } from "@/lib/financials/operating-statements/statementStore";
import { summaryForPeriod } from "@/lib/financials/operating-statements/glParser";
import { computeStatement } from "@/lib/financials/operating-statements/compute";
import { resolvePropertyBudget, makeBudgetLookup, budgetDetailForMask } from "@/lib/financials/operating-statements/budgetCrosswalk";
import { accountMatchesMask } from "@/lib/financials/operating-statements/mask";
import { buildTenantLookup } from "@/lib/financials/operating-statements/tenants";
import { trendFlags } from "@/lib/financials/operating-statements/trends";
import { lineMonthly, lineTxnCounts } from "@/lib/financials/operating-statements/lineSeries";

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const r0 = (v: number) => Math.round(v);
const r2 = (v: number) => Math.round(v * 100) / 100;
function varPct(v: number | null, b: number | null): number | null {
  if (v == null || b == null || Math.abs(b) < 0.5) return null;
  return (v / Math.abs(b)) * 100;
}
function hot(v: number | null, b: number | null, dollar: number, pct: number, min: number): "fav" | "unf" | null {
  if (v == null || b == null) return null;
  if (Math.abs(v) < min) return null; // ignore trivially small variances
  const vp = varPct(v, b);
  if (!(Math.abs(v) > dollar || (vp != null && Math.abs(vp) > pct))) return null;
  return v >= 0 ? "fav" : "unf";
}

// POST — analyze a property's flagged lines and auto-fill each line's note with
// an explanation. Gathers per-line budget detail + GL transactions and asks
// Claude for a concise, accounting-savvy note per line, then saves them.
export async function POST(req: Request) {
  let body: { key?: string; year?: number; period?: number; dollar?: number; pct?: number; min?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  const { key, year } = body;
  const dollar = body.dollar ?? 5000;
  const pct = body.pct ?? 10;
  const min = body.min ?? 500;
  if (!key || !year) return NextResponse.json({ error: "key and year are required" }, { status: 400 });

  const mapping = await getMapping(key);
  const stored = await assembledGl(key, year);
  if (!mapping || !stored) return NextResponse.json({ error: "No statement to analyze." }, { status: 404 });

  const period = Math.min(Math.max(1, body.period || stored.maxPeriodInFile), stored.maxPeriodInFile);
  const gl = summaryForPeriod(stored.monthly, period);
  const budget = await resolvePropertyBudget(mapping.propertyCode, year);
  const budgetLookup = budget ? makeBudgetLookup(budget, period) : undefined;
  const statement = computeStatement({ mapping, propertyName: mapping.entityName, year, period, gl, budgetLookup });
  const txByAccount = await getTransactions(stored.id);
  const storedPY = await assembledGl(key, year - 1); // prior year, for same-month-last-year context

  // Tenant-name lookup so notes can name tenants instead of GL/unit codes.
  const tenantFor = await buildTenantLookup();

  // Preserve manual notes: don't analyze (or overwrite) a line the user has
  // already written/edited a note for. Auto-explain only fills empty lines and
  // refreshes its own prior AI notes.
  const { notes: existingNotes, sources: existingSources } = await getNotesBundle(key, year, period);
  const hasManualNote = (lk: string) => existingSources[lk] === "user" && !!(existingNotes[lk] || "").trim();

  const flagged: Record<string, unknown>[] = [];
  for (const sec of statement.sections) {
    const sign = sec.role === "revenue" || sec.role === "reimbursement" ? -1 : 1;
    for (const l of sec.lines) {
      const lineKey = `${sec.name}::${l.label}`;
      if (hasManualNote(lineKey)) continue; // keep the user's manual note

      const cls = hot(l.ytdVariance, l.ytdBudget, dollar, pct, min) ?? hot(l.periodVariance, l.periodBudget, dollar, pct, min);
      const amounts = lineMonthly(stored.monthly, l.mask, sign, period);
      const counts = lineTxnCounts(txByAccount, l.mask, period);
      const pyAmounts = storedPY ? lineMonthly(storedPY.monthly, l.mask, sign, 12) : [];
      const pySameMonth = pyAmounts.length >= period ? pyAmounts[period - 1] : null;
      const trend = trendFlags(amounts, counts, amounts[period - 1] ?? null, pySameMonth);
      // Surface a line if it's off budget OR shows a month-over-month / YoY signal.
      if (!cls && trend.length === 0) continue;

      const flagReasons = [
        ...(cls ? [cls === "unf" ? "unfavorable vs budget" : "favorable vs budget"] : []),
        ...trend,
      ];
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
        lineKey, section: sec.name, line: l.label,
        classification: cls ? (cls === "unf" ? "unfavorable" : "favorable") : "trend",
        flagReasons,
        ytdActual: r0(l.ytdActual), ytdBudget: l.ytdBudget == null ? null : r0(l.ytdBudget), ytdVariance: l.ytdVariance == null ? null : r0(l.ytdVariance),
        monthlyTrend: amounts,
        monthlyTxnCount: counts,
        ...(storedPY ? { priorYear: { sameMonth: pySameMonth, ytd: pyAmounts.length ? r0(pyAmounts.slice(0, period).reduce((a, b) => a + b, 0)) : null, monthlyTrend: pyAmounts.slice(0, period) } } : {}),
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

  const through = MONTHS_LONG[period - 1];
  const trendMonths = MONTHS_SHORT.slice(0, period).join(", ");
  const prompt =
    `You are a commercial real estate accountant reviewing ${statement.propertyCode} ${statement.propertyName}'s operating statement for ${through} ${year} (YTD through ${through}). ` +
    `Your goal is to SPOT POSSIBLE MISTAKES and things that look OFF — not merely restate budget variance. For each flagged line write ONE concise note (max ~35 words): the specific thing worth investigating, then the action to verify.\n\n` +
    `EACH LINE INCLUDES:\n` +
    `• monthlyTrend / monthlyTxnCount — this year's amount and number of transactions for each month so far, in order (${trendMonths}).\n` +
    `• priorYear (when present) — the same line LAST year: this same month's amount ("sameMonth"), the prior-year YTD, and its month-by-month trend.\n` +
    `• flagReasons — why it surfaced (budget variance and/or a trend/inconsistency signal).\n` +
    `• topTransactions / budgetedFor / tenants — the underlying detail.\n\n` +
    `THINGS TO CALL OUT (be specific — name the vendor, tenant, and month):\n` +
    `• A line that jumped or dropped vs its recent months or vs the same month last year — and the likely cause.\n` +
    `• A recurring item with a different transaction count than usual — e.g. a utility that posts twice most months but once here (a missed bill) or three times (a possible double-payment).\n` +
    `• A one-time / unusual charge, a missing expected payment, or a likely posting/coding error.\n\n` +
    `HARD RULES:\n` +
    `1. NEVER restate the line's actual, budget, or variance totals — they're shown beside the note. Don't open with totals.\n` +
    `2. LEAD with the concrete item: a specific transaction (vendor + what it was) from topTransactions, a specific budget sub-line from budgetedFor, a specific tenant from tenants, or the specific month-over-month / year-over-year change.\n` +
    `3. You MAY cite one transaction's amount when it pinpoints the cause (e.g. "a one-time $848 charge from ABC Paving"); never the line/budget totals.\n` +
    `4. Use tenant NAMES, never raw GL/unit codes (e.g. "1100-12330").\n` +
    `5. End with what to verify. No generic filler or hedging.\n\n` +
    `GOOD: "Only one PECO payment posted this month vs two in prior months — a utility bill may be unposted. Confirm the second meter was paid."\n` +
    `GOOD: "Insurance is ~30% above the same month last year after the renewal. Verify the new premium and that it isn't double-booked with escrow."\n` +
    `BAD (never): "Electric is $785 vs $660 budget. Verify…"\n\n` +
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
        await saveNote(key, year, period, lk, note.trim(), "ai");
        saved[lk] = note.trim();
      }
    }
    return NextResponse.json({ notes: saved, analyzed: flagged.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Analysis failed" }, { status: 500 });
  }
}

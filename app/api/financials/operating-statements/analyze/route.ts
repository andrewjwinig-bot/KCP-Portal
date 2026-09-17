import { NextResponse } from "next/server";
import { getMapping } from "@/lib/financials/operating-statements/mappingStore";
import { assembledGl, assembledTransactions, saveNote, getNotesBundle } from "@/lib/financials/operating-statements/statementStore";
import { summaryForPeriod } from "@/lib/financials/operating-statements/glParser";
import { computeStatement } from "@/lib/financials/operating-statements/compute";
import { resolvePropertyBudget, makeBudgetLookup, budgetDetailForMask } from "@/lib/financials/operating-statements/budgetCrosswalk";
import { accountMatchesMask } from "@/lib/financials/operating-statements/mask";
import { buildTenantLookup } from "@/lib/financials/operating-statements/tenants";
import { trendFlags } from "@/lib/financials/operating-statements/trends";
import { seasonalTrendFlags, FLAG_MIN_DOLLARS } from "@/lib/financials/operating-statements/flagRules";
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
  let body: { key?: string; year?: number; period?: number; dollar?: number; pct?: number; min?: number; force?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  const { key, year } = body;
  const force = body.force === true; // re-explain lines that already have an AI note
  const dollar = body.dollar ?? 5000;
  const pct = body.pct ?? 10;
  // One floor across the whole feature — the "?" and the note agree on what
  // counts as too small to chase.
  const min = body.min ?? FLAG_MIN_DOLLARS;
  if (!key || !year) return NextResponse.json({ error: "key and year are required" }, { status: 400 });

  const mapping = await getMapping(key);
  const stored = await assembledGl(key, year);
  if (!mapping || !stored) return NextResponse.json({ error: "No statement to analyze." }, { status: 404 });

  const period = Math.min(Math.max(1, body.period || stored.maxPeriodInFile), stored.maxPeriodInFile);
  const gl = summaryForPeriod(stored.monthly, period);
  const budget = await resolvePropertyBudget(mapping.propertyCode, year);
  const budgetLookup = budget ? makeBudgetLookup(budget, period) : undefined;
  const statement = computeStatement({ mapping, propertyName: mapping.entityName, year, period, gl, budgetLookup });
  const txByAccount = await assembledTransactions(key, year);
  const storedPY = await assembledGl(key, year - 1); // prior year, for same-month-last-year context

  // Tenant-name lookup so notes can name tenants instead of GL/unit codes.
  const tenantFor = await buildTenantLookup();

  // Preserve manual notes: don't analyze (or overwrite) a line the user has
  // already written/edited a note for. Auto-explain only fills empty lines and
  // refreshes its own prior AI notes.
  const { notes: existingNotes, sources: existingSources } = await getNotesBundle(key, year, period);
  const hasManualNote = (lk: string) => existingSources[lk] === "user" && !!(existingNotes[lk] || "").trim();
  // Skip lines already auto-explained (an AI note on file) unless force=true, so
  // re-runs and re-imports don't re-spend tokens on months already done.
  const hasAiNote = (lk: string) => existingSources[lk] === "ai" && !!(existingNotes[lk] || "").trim();

  const flagged: Record<string, unknown>[] = [];
  let skippedExplained = 0;
  for (const sec of statement.sections) {
    const sign = sec.role === "revenue" || sec.role === "reimbursement" ? -1 : 1;
    for (const l of sec.lines) {
      const lineKey = `${sec.name}::${l.label}`;
      if (hasManualNote(lineKey)) continue; // keep the user's manual note
      if (!force && hasAiNote(lineKey)) { skippedExplained++; continue; } // already auto-explained

      const cls = hot(l.ytdVariance, l.ytdBudget, dollar, pct, min) ?? hot(l.periodVariance, l.periodBudget, dollar, pct, min);
      const amounts = lineMonthly(stored.monthly, l.mask, sign, period);
      const counts = lineTxnCounts(txByAccount, l.mask, period);
      const pyAmounts = storedPY ? lineMonthly(storedPY.monthly, l.mask, sign, 12) : [];
      const pySameMonth = pyAmounts.length >= period ? pyAmounts[period - 1] : null;
      // The SAME rules the "?" uses — seasonal/lumpy adjustments and the
      // variance floor — so auto-explain writes a note for exactly the lines
      // that carry a mark. Before this it ran on the raw trend signal, so it
      // would spend a note on a line sitting $38 off budget that the statement
      // had already decided was not worth anyone's time.
      const trend = seasonalTrendFlags(
        sec.role, l, period, l.periodActual,
        trendFlags(amounts, counts, amounts[period - 1] ?? null, pySameMonth),
        l.periodVariance,
      );
      // Surface a line if it's off budget OR shows a month-over-month / YoY signal.
      if (!cls && trend.length === 0) continue;

      const flagReasons = [
        ...(cls ? [cls === "unf" ? "unfavorable vs budget" : "favorable vs budget"] : []),
        ...trend,
      ];
      const bd = budget ? budgetDetailForMask(budget, l.mask, period) : [];
      const accts = Object.keys(txByAccount).filter((a) => accountMatchesMask(l.mask, a));
      // The ACCOUNT each charge actually posted to, not just the line it rolls
      // into — a coding call ("this belongs in repairs, or in a capital
      // account") cannot be made without knowing where it currently sits.
      const txs: { date: string | null; description: string; amount: number; account: string; month: number }[] = [];
      for (const a of accts) for (const t of txByAccount[a]) if (t.month <= period) txs.push({ date: t.date, description: t.description, amount: t.amount * sign, account: a, month: t.month });
      txs.sort((x, y) => Math.abs(y.amount) - Math.abs(x.amount));
      // A single transaction is self-evidently the cause — no note adds value,
      // unless the line was surfaced for a trend reason (e.g. a missing 2nd bill).
      if (trend.length === 0 && txs.length === 1) continue;
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
        accountsOnThisLine: accts,
        transactionCount: txs.length,
        // This month's charges FIRST — the note is about this month — then the
        // largest YTD ones for context.
        topTransactions: [
          ...txs.filter((t) => t.month === period).slice(0, 12),
          ...txs.filter((t) => t.month !== period).slice(0, 6),
        ].map((t) => ({ month: MONTHS_SHORT[t.month - 1], date: t.date, account: t.account, description: t.description.slice(0, 110), amount: r2(t.amount) })),
      });
    }
  }

  if (!flagged.length) return NextResponse.json({ notes: {}, skippedExplained, message: skippedExplained ? `All ${skippedExplained} flagged line(s) already explained.` : "No flagged lines to analyze." });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI analysis isn't configured (ANTHROPIC_API_KEY not set)." }, { status: 503 });

  const through = MONTHS_LONG[period - 1];
  const trendMonths = MONTHS_SHORT.slice(0, period).join(", ");
  const prompt =
    `You are a commercial real estate accountant reviewing ${statement.propertyCode} ${statement.propertyName}'s operating statement for ${through} ${year} (YTD through ${through}). ` +
    `Your goal is to SPOT POSSIBLE MISTAKES and REACH A CONCLUSION about them — not to restate budget variance and not to describe what you see. A note that only says a charge exists is worthless: the charge is already on the statement. Say what it IS, what is probably wrong with it, and what to do.\n\n` +
    `LENGTH: as short as the finding allows. A routine line needs ~20 words. A single large charge that needs a coding or capitalization call may take up to ~45 — take the words only when the extra words carry a conclusion. Never pad.\n\n` +
    `EACH LINE INCLUDES:\n` +
    `• monthlyTrend / monthlyTxnCount — this year's amount and number of transactions for each month so far, in order (${trendMonths}).\n` +
    `• priorYear (when present) — the same line LAST year: this same month's amount ("sameMonth"), the prior-year YTD, and its month-by-month trend.\n` +
    `• flagReasons — why it surfaced (budget variance and/or a trend/inconsistency signal).\n` +
    `• topTransactions — this month's charges first, each with the GL ACCOUNT it actually posted to, the vendor/description, the date and the amount.\n` +
    `• accountsOnThisLine — every GL account rolling into this line, so you can tell whether a charge sits on the right one.\n` +
    `• budgetedFor / tenants — what the budget expected, and who the money relates to.\n\n` +
    `THE ANALYSIS TO ACTUALLY DO, in order:\n` +
    `1. FIND THE CHARGE. Which single transaction (or which two) accounts for the move? Name the vendor, the date and the amount.\n` +
    `2. DECIDE WHAT IT IS, from the vendor and the description. Repaving, roof, HVAC or unit replacement, parking-lot resurfacing, structural work, a build-out — these have a multi-year life and read as CAPITAL, not operating expense. Patching, cleaning, striping, a service call, a part — these are genuinely repairs.\n` +
    `3. SAY WHICH OF THESE IT LOOKS LIKE, and why:\n` +
    `   (a) CAPITAL sitting on an operating line — say it should probably be capitalized and depreciated, and that it will distort NOI and the CAM pool if it stays.\n` +
    `   (b) WRONG GL ACCOUNT — it belongs on a different account than the one in "account". Name the better fit from accountsOnThisLine or describe it.\n` +
    `   (c) WRONG PROPERTY — the vendor or description points somewhere else in the portfolio.\n` +
    `   (d) A MISSED or DOUBLED bill — the transaction count broke its pattern; say which and name the vendor.\n` +
    `   (e) A GENUINE unbudgeted one-off — say so plainly, and that the budget line was set too low or the work was unplanned.\n` +
    `4. SAY WHAT TO DO. One action: reclassify, capitalize, move to <property>, chase the missing invoice, confirm with the vendor, or raise next year's budget.\n\n` +
    `WHEN IT IS A CAM-RECOVERABLE LINE, say whether the treatment changes what tenants get billed — a capital item left in a reimbursable operating line overstates the CAM pool.\n\n` +
    `HARD RULES:\n` +
    `1. NEVER restate the line's actual, budget, or variance totals — they're shown beside the note. Don't open with totals.\n` +
    `2. LEAD with the concrete item: the specific transaction, vendor and amount.\n` +
    `3. Cite a transaction's own amount freely (that is the point); never the line/budget totals.\n` +
    `4. Use tenant NAMES, never raw unit codes (e.g. "1100-12330"). A GL ACCOUNT number is fine when the point is where a charge sits.\n` +
    `5. Commit. "May be capital" is fine; "could be various things, please review" is not. If the description genuinely does not say, name what you would look at to find out.\n` +
    `6. No filler, no hedging, no restating the flag reason back.\n\n` +
    `GOOD: "$21,750 to ABC Paving on 7/14 for lot resurfacing — that is a capital item, not maintenance. Capitalize and depreciate it; left here it overstates the CAM pool tenants are billed on."\n` +
    `GOOD: "Only one PECO payment posted this month vs two in prior months — a utility bill may be unposted. Confirm the second meter was paid."\n` +
    `GOOD: "Insurance is ~30% above the same month last year after the renewal. Verify the new premium and that it isn't double-booked with escrow."\n` +
    `GOOD: "$4,100 to Sherwin-Williams coded to Landscaping — reads as a paint/build-out charge. Move it to Building Maintenance or the tenant's TI account."\n` +
    `BAD (never): "Electric is $785 vs $660 budget. Verify…"\n` +
    `BAD (never): "There is a large charge on this line. Review the detail."\n\n` +
    `Amounts are dollars; a "favorable" variance is good (revenue over / expense under budget). ` +
    `Return ONLY a JSON object mapping each line's exact "lineKey" to its note string.\n\n` +
    `FLAGGED LINES:\n${JSON.stringify(flagged, null, 1)}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      // Opus, because the job is a JUDGEMENT — is this charge capital, is it on
      // the wrong account — not a summary. The volume it runs over is small by
      // construction (only lines carrying a "?", which the variance floor keeps
      // scarce), so the better model is affordable here in a way it would not be
      // over every line of every statement.
      body: JSON.stringify({ model: "claude-opus-5", max_tokens: 6000, messages: [{ role: "user", content: prompt }] }),
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

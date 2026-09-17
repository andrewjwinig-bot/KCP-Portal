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

/**
 * How big a PRIOR-MONTH charge has to be before it earns a mention on THIS
 * month's note.
 *
 * The rule is materiality, not recency. Two real notes set the boundary:
 *
 *   NOT WORTH IT — "March's $745.39 PECO charge is on the wrong GL." True, and
 *   sending someone to look at July for it wastes the trip.
 *
 *   WORTH IT — "HDL Servicing $121,000 on 1/27, plus $9,050 (Feb) and $13,920
 *   (Mar) — HDL is the redevelopment GC billing to capital accounts all year.
 *   This is construction, not maintenance: capitalize it. Left here it grossly
 *   inflates tenant CAM." Whenever that happened, you want to know now.
 *
 * Measured on the LARGEST SINGLE prior charge rather than their total, because
 * a total catches every ordinary recurring line by June — a $5,000/month
 * contract is $30,000 by then and entirely unremarkable. One enormous invoice
 * is the thing that stands out.
 */
const PRIOR_MONTH_MIN_DOLLARS = 10_000;

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

      // THIS MONTH FIRST. It used to read YTD first, so a line surfaced on a
      // year-to-date variance and the note then described whatever charge was
      // biggest across the year — in July, often a March one. The note sits
      // beside a July figure; it has to be about July.
      const periodCls = hot(l.periodVariance, l.periodBudget, dollar, pct, min);
      const ytdCls = hot(l.ytdVariance, l.ytdBudget, dollar, pct, min);
      const cls = periodCls ?? ytdCls;
      // When only the YEAR is off, the note must say so rather than presenting
      // a year-to-date finding as this month's news.
      const ytdOnly = !periodCls && !!ytdCls;
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
        ...(cls ? [`${cls === "unf" ? "unfavorable" : "favorable"} vs budget${ytdOnly ? " (year-to-date only — this month is on budget)" : ""}`] : []),
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
      const thisMonths = txs.filter((t) => t.month === period);
      const priors = txs.filter((t) => t.month !== period);
      // One enormous earlier invoice earns its mention; an ordinary one does not.
      const priorIsMaterial = priors.some((t) => Math.abs(t.amount) >= PRIOR_MONTH_MIN_DOLLARS);
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
        scope: ytdOnly ? "year-to-date" : "this month",
        transactionCountYtd: txs.length,
        // SEPARATE LISTS, deliberately — one merged list is how a July note
        // ended up about March's $745 electricity bill.
        thisMonthsCharges: thisMonths.slice(0, 12)
          .map((t) => ({ date: t.date, account: t.account, description: t.description.slice(0, 110), amount: r2(t.amount) })),
        // Prior months split by whether they are big enough to be worth pulling
        // attention off this month. The key NAME carries the rule, so the model
        // cannot mistake one list for the other.
        ...(priorIsMaterial
          ? { priorMonthsWorthMentioning: priors.slice(0, 8).map((t) => ({ month: MONTHS_SHORT[t.month - 1], date: t.date, account: t.account, description: t.description.slice(0, 110), amount: r2(t.amount) })) }
          : { priorMonthsForContextOnly: priors.slice(0, 6).map((t) => ({ month: MONTHS_SHORT[t.month - 1], account: t.account, description: t.description.slice(0, 80), amount: r2(t.amount) })) }),
      });
    }
  }

  if (!flagged.length) return NextResponse.json({ notes: {}, skippedExplained, message: skippedExplained ? `All ${skippedExplained} flagged line(s) already explained.` : "No flagged lines to analyze." });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI analysis isn't configured (ANTHROPIC_API_KEY not set)." }, { status: 503 });

  // WHERE ELSE A CHARGE COULD LIVE.
  //
  // "The $68.90 Termite Proofing charges are miscoded here" is half a finding:
  // it says a charge is wrong and not where it belongs, which leaves the reader
  // to go hunting. It could not do better, because the only accounts it ever
  // saw were the ones on the line it was looking at. This is the property's
  // whole operating chart — account, name, and the line it rolls into — so a
  // note can say "move it to 6350-0000 Pest Control" and name why.
  const acctNames = stored.names ?? {};
  const accountDirectory: { account: string; name: string; line: string }[] = [];
  for (const sec of statement.sections) {
    for (const l of sec.lines) {
      for (const a of l.accounts ?? []) {
        accountDirectory.push({ account: a, name: acctNames[a] ?? "", line: `${sec.name} › ${l.label}` });
      }
    }
  }

  const through = MONTHS_LONG[period - 1];
  const trendMonths = MONTHS_SHORT.slice(0, period).join(", ");
  const prompt =
    `You are a commercial real estate accountant reviewing ${statement.propertyCode} ${statement.propertyName}'s operating statement for ${through} ${year} (YTD through ${through}). ` +
    `Your goal is to SPOT POSSIBLE MISTAKES and REACH A CONCLUSION about them — not to restate budget variance and not to describe what you see. A note that only says a charge exists is worthless: the charge is already on the statement. Say what it IS, what is probably wrong with it, and what to do.\n\n` +
    `LENGTH IS PROPORTIONAL TO WHAT THERE IS TO DO, not to what you noticed:\n` +
    `  • Something to FIX — recode, capitalize, chase a missing invoice, a likely double-pay → up to ~45 words: the charge, the call, the action.\n` +
    `  • NOTHING to fix — it genuinely cost more than planned → ONE SHORT LINE, about twelve words. "Thirteen snow invoices Jan–Mar; a heavy winter, genuinely over." Then STOP. Do not append a cross-check you have no evidence for, and do not advise re-budgeting — they set the budget and they know it was low.\n` +
    `  • Only raise a possible DOUBLE-PAY when the evidence is there: the same vendor and the same amount twice, or a count that broke its own pattern. Two different amounts from one vendor in one season is a busy month, not a re-bill; saying "confirm X isn't a re-bill of Y" on a hunch sends someone to check something you already had the data to rule out.\n\n` +
    `EACH LINE INCLUDES:\n` +
    `• monthlyTrend / monthlyTxnCount — this year's amount and number of transactions for each month so far, in order (${trendMonths}).\n` +
    `• priorYear (when present) — the same line LAST year: this same month's amount ("sameMonth"), the prior-year YTD, and its month-by-month trend.\n` +
    `• flagReasons — why it surfaced (budget variance and/or a trend/inconsistency signal).\n` +
    `• thisMonthsCharges — what posted in ${through}, each with the GL ACCOUNT it actually posted to, the vendor/description, the date and the amount. YOUR FINDING COMES FROM HERE.\n` +
    `• priorMonthsForContextOnly — earlier months, provided ONLY so you can tell whether this month's amount is normal for the line. NEVER report one of these as the finding.\n` +
    `• scope — "this month" or "year-to-date". See the rule below.\n` +
    `• accountsOnThisLine — every GL account rolling into this line, so you can tell whether a charge sits on the right one.\n` +
    `• accountDirectory (at the end of this prompt, shared by every line) — the property's whole operating chart: account, name, and the line it rolls into. THIS IS WHERE A MIS-CODED CHARGE SHOULD BE SENT.\n` +
    `• budgetedFor / tenants — what the budget expected, and who the money relates to.\n\n` +
    `THE NOTE IS ABOUT ${through.toUpperCase()}. It sits beside ${through}'s figure, so it has to be about ${through}. Lead with a charge that posted in ${through}. A charge from an earlier month is NEVER the finding — you may mention one only as a comparison ("roughly double the March bill"), never as the thing to look into.\n` +
    `TWO EXCEPTIONS, both about MATERIALITY rather than recency:\n` +
    `  (a) A line may carry "priorMonthsWorthMentioning" — earlier charges big enough to be worth knowing about whenever they happened. When it does, report them: a $121,000 January invoice sitting on a maintenance line matters in July. A line carrying "priorMonthsForContextOnly" instead has nothing earlier worth the trip, and those charges are comparison material only.\n` +
    `  (b) When "scope" is "year-to-date", ${through} itself is on budget and only the YEAR is off. Begin the note with "Year to date:" so it reads as a different kind of statement, and say what is driving the year rather than pretending something happened this month.\n\n` +
    `THE ANALYSIS TO ACTUALLY DO, in order:\n` +
    `1. FIND THE CHARGE, in ${through}. Which single transaction (or which two) accounts for the move? Name the vendor, the date and the amount.\n` +
    `2. DECIDE WHAT IT IS, from the vendor and the description. Repaving, roof, HVAC or unit replacement, parking-lot resurfacing, structural work, a build-out — these have a multi-year life and read as CAPITAL, not operating expense. Patching, cleaning, striping, a service call, a part — these are genuinely repairs.\n` +
    `3. SAY WHICH OF THESE IT LOOKS LIKE, and why:\n` +
    `   (a) CAPITAL sitting on an operating line — say it should probably be capitalized and depreciated, and that it will distort NOI and the CAM pool if it stays.\n` +
    `   (b) WRONG GL ACCOUNT — it belongs on a different account than the one in "account". **NAME THE DESTINATION.** Pick a real account from accountDirectory (number AND name) and say why that is its home — "the other Termite Proofing charges post there", "that is the pest-control account". NEVER write that something "is miscoded" and stop: a finding with no destination leaves the reader hunting, which is the work the note was supposed to do. If nothing in the directory fits, say what KIND of account it belongs in and that the property has none.\n` +
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
    `GOOD: "$4,100 to Sherwin-Williams coded to Landscaping — reads as a paint/build-out charge. Move it to 6300-0000 Building Maintenance, where the other interior work posts."\n` +
    `GOOD (a prior month that earns its place): "HDL Servicing $121,000 on 1/27, plus $9,050 (Feb) and $13,920 (Mar) — HDL is the redevelopment GC billing to capital accounts 1430/1440 all year. This is construction, not maintenance: capitalize it, along with Robison Roofing's $4,400/$3,850 roof work. Left here it grossly inflates tenant CAM."\n` +
    `GOOD (two findings, both landed): "Associated Paving $21,750 on 7/6 and $6,600 on 7/16 — lot resurfacing, a multi-year capital item. Capitalize and depreciate; left on a recoverable line it overstates the CAM pool. The $68.90 Termite Proofing charges belong on 6350-0000 Pest Control, where the rest of them post."\n` +
    `BAD (never): "Electric is $785 vs $660 budget. Verify…"\n` +
    `BAD (never): "There is a large charge on this line. Review the detail."\n` +
    `BAD (too long for what it says): "Thirteen About Time Snow invoices Jan–Mar, seven in March alone, against a season budgeted near $10.8K. Genuine heavy-winter overrun, but confirm the 3/12 $8,700 isn't a re-bill of the 2/16 $9,355, then set a realistic snow budget." — the answer is "it snowed a lot", the re-bill is a guess, and the budget advice is unasked-for. "Thirteen snow invoices Jan–Mar; a heavy winter, genuinely over." says it.\n` +
    `BAD (never, in a ${through} note): "March's $745.39 PECO charge is on the wrong GL." — a few hundred dollars in a month you are not looking at. Sending someone to ${through} for it wastes the trip.\n` +
    `BAD (never): "…and the Termite Proofing charges are miscoded here." — miscoded to WHERE, and why? Name the account or leave it out.\n` +
    `GOOD (year-to-date scope): "Year to date: three unbudgeted tree removals (Feb, Apr, Jun) put the line 80% over. ${through} itself is on budget — raise next year's provision."\n\n` +
    `Amounts are dollars; a "favorable" variance is good (revenue over / expense under budget). ` +
    `Return ONLY a JSON object mapping each line's exact "lineKey" to its note string.\n\n` +
    `FLAGGED LINES:\n${JSON.stringify(flagged, null, 1)}\n\n` +
    `ACCOUNT DIRECTORY for ${statement.propertyCode} — every operating account on this property, for naming where a mis-coded charge belongs:\n${JSON.stringify(accountDirectory.slice(0, 400))}`;

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

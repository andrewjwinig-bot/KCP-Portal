// Reading a line's history so next year's number is argued, not assumed.
//
// "3% over last year" is not a forecast, it is a default — and applied to
// every line it is wrong in both directions at once: a contract that escalates
// 2% gets padded, and a line that has run 40% over budget three years running
// gets another 3%. The point of holding five years of budget AND actual is to
// say which kind of line this is and what the evidence supports.
//
// Nothing here is clever. It is the arithmetic a person would do with the
// table in front of them, done every time instead of for the lines someone
// happened to look at.

import type { LineHistory, LineYear } from "./lineHistory";

export type LineShape =
  /** Steady year to year — a contract. Budget last year plus escalation. */
  | "steady"
  /** Trending in one direction across the years — extend the trend. */
  | "trending"
  /** Lumpy; it happens when it happens. Budget the average, not last year. */
  | "lumpy"
  /** Not enough complete years to say anything. */
  | "unknown";

export type LineInsight = {
  shape: LineShape;
  /** Compound annual change across complete years, as a %. Null when < 2 years. */
  trendPct: number | null;
  /** Mean (actual − budget) ÷ mean budget, as a %. Positive = we under-budget. */
  budgetBiasPct: number | null;
  /** Spread of the actuals — coefficient of variation, as a %. */
  volatilityPct: number | null;
  /** A year whose actual is far off the others, which would drag any average. */
  outlier: { year: number; actual: number; timesMedian: number } | null;
  /** The months this line actually posts in — so the spread follows its shape. */
  activeMonths: number[];
  /** What to budget, and WHY. Null when the history cannot support a number. */
  suggestion: { amount: number; basis: string } | null;
  /** Plain-language findings, most useful first. Never padding. */
  notes: string[];
};

const r0 = (n: number) => Math.round(n);
const pct = (n: number) => Math.round(n * 10) / 10;
const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Complete years only — a part-year total compared to full ones is a trap. */
const completeYears = (h: LineHistory): LineYear[] =>
  h.years.filter((y) => y.actual != null && y.monthsCovered >= 12);

export function lineInsight(h: LineHistory): LineInsight {
  const complete = completeYears(h);
  const actuals = complete.map((y) => y.actual as number);
  const notes: string[] = [];

  if (complete.length < 2) {
    return {
      shape: "unknown", trendPct: null, budgetBiasPct: null, volatilityPct: null,
      outlier: null, activeMonths: [], suggestion: null,
      notes: complete.length === 1
        ? ["Only one complete year of history — not enough to read a trend."]
        : ["No complete year of history for this line yet."],
    };
  }

  // ── Outlier: a year several times the median of the others ───────────────
  // A repaving year inside a maintenance line will otherwise set the average
  // for every year after it.
  let outlier: LineInsight["outlier"] = null;
  for (const y of complete) {
    const others = complete.filter((o) => o.year !== y.year).map((o) => o.actual as number);
    const med = median(others.map(Math.abs));
    const v = Math.abs(y.actual as number);
    if (med > 0 && v >= med * 2.5 && v - med > 5000) {
      if (!outlier || v > Math.abs(outlier.actual)) {
        outlier = { year: y.year, actual: y.actual as number, timesMedian: Math.round((v / med) * 10) / 10 };
      }
    }
  }

  // ── Trend across the complete years ──────────────────────────────────────
  const first = actuals[0];
  const last = actuals[actuals.length - 1];
  const spanYears = complete[complete.length - 1].year - complete[0].year;
  const trendPct = first > 0 && spanYears > 0
    ? pct((Math.pow(Math.abs(last) / Math.abs(first), 1 / spanYears) - 1) * 100)
    : null;

  // ── Volatility ───────────────────────────────────────────────────────────
  const mean = actuals.reduce((s, n) => s + n, 0) / actuals.length;
  const sd = Math.sqrt(actuals.reduce((s, n) => s + (n - mean) ** 2, 0) / actuals.length);
  const volatilityPct = Math.abs(mean) > 0 ? pct((sd / Math.abs(mean)) * 100) : null;

  // ── Have we been budgeting it well? ──────────────────────────────────────
  const budgeted = complete.filter((y) => y.budget != null && Math.abs(y.budget as number) > 0);
  let budgetBiasPct: number | null = null;
  if (budgeted.length >= 2) {
    const meanBudget = budgeted.reduce((s, y) => s + (y.budget as number), 0) / budgeted.length;
    const meanVar = budgeted.reduce((s, y) => s + ((y.actual as number) - (y.budget as number)), 0) / budgeted.length;
    if (Math.abs(meanBudget) > 0) budgetBiasPct = pct((meanVar / Math.abs(meanBudget)) * 100);
  }

  // ── Which months it posts in ─────────────────────────────────────────────
  const monthTotals = Array(12).fill(0) as number[];
  for (const y of complete) for (let m = 0; m < 12; m++) monthTotals[m] += y.months?.[m] ?? 0;
  const yearTotal = monthTotals.reduce((s, n) => s + n, 0);
  const activeMonths = yearTotal !== 0
    ? monthTotals.map((v, i) => ({ v, i })).filter((x) => Math.abs(x.v) >= Math.abs(yearTotal) * 0.02).map((x) => x.i + 1)
    : [];

  // ── Shape, which decides what to budget ──────────────────────────────────
  const vol = volatilityPct ?? 0;
  let shape: LineShape;
  if (vol >= 40) shape = "lumpy";
  else if (trendPct != null && Math.abs(trendPct) >= 4 && vol < 25) shape = "trending";
  else shape = "steady";

  // ── The number, and the reason for it ────────────────────────────────────
  let suggestion: LineInsight["suggestion"] = null;
  if (shape === "lumpy") {
    // Last year is the worst anchor for a line that jumps; the average across
    // the years is what it has actually cost to run.
    const base = outlier
      ? complete.filter((y) => y.year !== outlier!.year).map((y) => y.actual as number)
      : actuals;
    const avg = base.reduce((s, n) => s + n, 0) / base.length;
    suggestion = {
      amount: r0(avg),
      basis: outlier
        ? `${base.length}-year average excluding ${outlier.year}`
        : `${base.length}-year average`,
    };
  } else if (shape === "trending" && trendPct != null) {
    suggestion = { amount: r0(last * (1 + trendPct / 100)), basis: `last year extended at its own ${trendPct > 0 ? "+" : ""}${trendPct}% trend` };
  } else {
    suggestion = { amount: r0(last), basis: "last year, which this line has held close to" };
  }

  // ── Notes: only what changes a decision ──────────────────────────────────
  if (outlier) {
    notes.push(`${outlier.year} ran ${outlier.timesMedian}× the other years — check it is a one-off before it sets the average.`);
  }
  if (budgetBiasPct != null && Math.abs(budgetBiasPct) >= 10) {
    notes.push(budgetBiasPct > 0
      ? `Budgeted low ${budgeted.length} years running — actuals came in ${budgetBiasPct}% over on average.`
      : `Budgeted high ${budgeted.length} years running — actuals came in ${Math.abs(budgetBiasPct)}% under on average.`);
  }
  if (shape === "lumpy") {
    notes.push(`Swings ${vol}% year to year — an as-needed line. The average is a better anchor than last year.`);
  } else if (shape === "trending" && trendPct != null) {
    notes.push(`Rising ${trendPct}% a year across ${spanYears + 1} years, steadily enough to extend.`);
  }
  if (activeMonths.length > 0 && activeMonths.length <= 6) {
    notes.push(`Posts in ${activeMonths.length} months of the year — spread it over those, not evenly.`);
  }

  return { shape, trendPct, budgetBiasPct, volatilityPct, outlier, activeMonths, suggestion, notes };
}

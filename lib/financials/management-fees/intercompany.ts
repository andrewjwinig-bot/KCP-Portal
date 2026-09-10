// The management-fee intercompany tie-out: what the buildings EXPENSED against
// what LIK Management (2010) BOOKED as revenue, month by month.
//
// These are two sides of one transaction. Every dollar a building posts to 6610
// is a dollar LIK earns on 4510, so the two columns should be the same number.
// Nothing in the accounting made them agree, though, because they are produced
// in completely different ways:
//
//   6610 — each building posts its own fee as part of its monthly close.
//   4510 — someone hand-keys two journal entries at 2010 ("NILLC" and "Other").
//
// A hand-keyed accrual against automatic postings drifts by construction. In
// 2026 the two sides netted to within $4,423 over seven months while individual
// months were off by five figures in both directions, and February carried no
// journal entry at all — the buildings expensed $59,868 and 2010 booked nothing,
// with March then carrying roughly two months. Nobody could see any of that,
// because the portal compared only the BUDGETS.
//
// So this compares the actuals, and — more usefully — states the entry that
// SHOULD be posted, which is the figure that makes the manual step mechanical
// instead of a guess.
//
// NO PROPERTY PAYS AN OUTSIDE MANAGEMENT FEE (confirmed by the owner). Every
// dollar of 6610 anywhere in the portfolio is payable to LIK 2010, so there is
// no structural reason for a gap: the two columns must be equal, and any
// variance is an error of timing or amount. That is what makes this a tie-out
// rather than a comparison of two loosely related figures.
//
// The one thing that CAN make this report a false gap is its own input — a
// fee-paying building whose GL is not loaded contributes nothing to the
// buildings column while 2010 booked its fee. `missingGl` carries those so the
// card can say the comparison is incomplete instead of blaming the ledger.

/** A month with an entry this small is treated as no entry at all. */
const POSTED_FLOOR = 1;

export type TieStatus =
  /** The two sides agree within tolerance. */
  | "ties"
  /** Buildings expensed a fee; 2010 booked nothing. A missed journal entry. */
  | "not-posted"
  /** Both posted, but not the same number. */
  | "off"
  /** Neither side has posted this month yet. */
  | "pending";

export type IntercompanyMonth = {
  /** 1–12. */
  month: number;
  /** Σ account 6610 across every fee-paying building. */
  buildingsFee: number;
  /** Account 4510 at 2010, revenue-positive. */
  likRevenue: number;
  /** likRevenue − buildingsFee. Negative = LIK under-booked. */
  variance: number;
  status: TieStatus;
};

export type IntercompanyTieOut = {
  months: IntercompanyMonth[];
  /** Months compared — through the last month BOTH sides could have posted. */
  through: number;
  buildingsYtd: number;
  likYtd: number;
  /** likYtd − buildingsYtd. */
  varianceYtd: number;
  /** Months where the buildings billed and 2010 booked nothing. */
  missed: number[];
  /** Months where both posted but disagree. */
  disagreeing: number[];
  /** True when every compared month ties. */
  clean: boolean;
  /** The largest single-month absolute variance, for the headline. */
  worstMonth: IntercompanyMonth | null;
  /**
   * Fee-paying buildings with no GL loaded for the year. Their fees are absent
   * from the buildings column, so a variance cannot be trusted while this is
   * non-empty — the gap may be this report's, not the ledger's.
   */
  missingGl: string[];
};

/**
 * Compare the two sides.
 *
 * `through` is the last month to judge: a month neither side has posted is
 * "pending", not a discrepancy, and a building that is a month behind must not
 * make LIK look like it over-booked.
 */
export function intercompanyTieOut(
  buildingsMonthly: number[],
  likMonthly: number[],
  through: number,
  opts: { tolerance?: number; missingGl?: string[] } = {},
): IntercompanyTieOut {
  const tolerance = opts.tolerance ?? 1;
  const months: IntercompanyMonth[] = [];
  for (let m = 1; m <= 12; m++) {
    const buildingsFee = Math.round(buildingsMonthly[m - 1] ?? 0);
    const likRevenue = Math.round(likMonthly[m - 1] ?? 0);
    const variance = likRevenue - buildingsFee;

    let status: TieStatus;
    if (m > through) status = "pending";
    else if (Math.abs(buildingsFee) < POSTED_FLOOR && Math.abs(likRevenue) < POSTED_FLOOR) status = "pending";
    else if (Math.abs(likRevenue) < POSTED_FLOOR) status = "not-posted";
    else if (Math.abs(variance) <= tolerance) status = "ties";
    else status = "off";

    months.push({ month: m, buildingsFee, likRevenue, variance, status });
  }

  const judged = months.filter((x) => x.status !== "pending");
  const buildingsYtd = judged.reduce((s, x) => s + x.buildingsFee, 0);
  const likYtd = judged.reduce((s, x) => s + x.likRevenue, 0);
  const missed = judged.filter((x) => x.status === "not-posted").map((x) => x.month);
  const disagreeing = judged.filter((x) => x.status === "off").map((x) => x.month);
  const worstMonth = judged.length
    ? judged.reduce((w, x) => (Math.abs(x.variance) > Math.abs(w.variance) ? x : w))
    : null;

  return {
    months,
    through,
    buildingsYtd,
    likYtd,
    varianceYtd: likYtd - buildingsYtd,
    missed,
    disagreeing,
    clean: missed.length === 0 && disagreeing.length === 0 && judged.length > 0,
    missingGl: opts.missingGl ?? [],
    // A month everything ties in has a zero variance, so "worst" is only worth
    // showing when there IS one.
    worstMonth: worstMonth && Math.abs(worstMonth.variance) > tolerance ? worstMonth : null,
  };
}

/**
 * The entry that SHOULD be posted at 2010 for a month — the fees the buildings
 * actually expensed, split the way the entries are actually booked.
 *
 * This is the point of the whole feature. Measuring the drift is worth
 * something; removing the guess that causes it is worth more. The split follows
 * the two journal entries already in use: the Neshaminy Interplex LLC buildings
 * on one, everything else on the other.
 */
export type SuggestedEntry = {
  month: number;
  /** Per-group totals, in the order the entries are keyed. */
  lines: { label: string; codes: string[]; amount: number }[];
  total: number;
  /** What 2010 currently has on 4510 for the month. */
  posted: number;
  /** total − posted: what a correcting entry would be. Zero when it ties. */
  adjustment: number;
};

export function suggestedEntry(
  buildings: { code: string; group: string; feeMonthly: number[] }[],
  likMonthly: number[],
  month: number,
  nillcCodes: readonly string[],
): SuggestedEntry {
  const inNillc = new Set(nillcCodes.map((c) => c.toUpperCase()));
  const pick = (want: boolean) =>
    buildings.filter((b) => inNillc.has(b.code.toUpperCase()) === want);
  const totalFor = (rows: typeof buildings) =>
    Math.round(rows.reduce((s, b) => s + (b.feeMonthly[month - 1] ?? 0), 0));

  const nillc = pick(true);
  const other = pick(false);
  const lines = [
    { label: "Management Fees - NILLC", codes: nillc.map((b) => b.code), amount: totalFor(nillc) },
    { label: "Mgmt Fees - Other", codes: other.map((b) => b.code), amount: totalFor(other) },
  ].filter((l) => l.codes.length > 0);

  const total = lines.reduce((s, l) => s + l.amount, 0);
  const posted = Math.round(likMonthly[month - 1] ?? 0);
  return { month, lines, total, posted, adjustment: total - posted };
}

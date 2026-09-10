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

// ── Narrowing the search ──────────────────────────────────────────────────────
//
// "Which buildings tie and which don't" cannot be answered directly: 2010 does
// not book per building. It posts TWO journal entries a month, so there is no
// building-level counterpart to compare against and no amount of code invents
// one. What can be done is narrow the search from both ends.
//
//   1. Tie each of the two ENTRIES to the buildings it covers. A variance then
//      belongs to the NILLC side (7 buildings) or the Other side (13), which
//      halves the search and often more.
//   2. Find months where a BUILDING posted no fee at all while it posts one
//      every other month. That is a per-building finding, and it is the shape a
//      missing fee actually takes.
//
// Together they answer the real question — where do I look — without pretending
// to a per-building tie-out the ledger cannot support.

export type FeeGroupKey = "nillc" | "other";

export const FEE_GROUP_LABEL: Record<FeeGroupKey, string> = {
  nillc: "Management Fees - NILLC",
  other: "Mgmt Fees - Other",
};

/** Which entry a 2010 journal line belongs to. The entries are identified by
 *  their own description, which is how they are keyed and how they read in the
 *  drill-down. Anything not naming NILLC is on the "Other" entry. */
export function feeGroupOfEntry(text: string): FeeGroupKey {
  return /\bni\s*llc\b|\bnillc\b/i.test(text ?? "") ? "nillc" : "other";
}

export type LikTxn = { month: number; description: string; vendor?: string; amount: number };

/**
 * 2010's 4510 postings split by entry, revenue-positive.
 *
 * Revenue is credit-normal, so the raw amounts are negative and are flipped
 * here to read against the buildings' positive expense column.
 */
export function likRevenueByGroup(txns: LikTxn[]): Record<FeeGroupKey, number[]> {
  const out: Record<FeeGroupKey, number[]> = { nillc: new Array(12).fill(0), other: new Array(12).fill(0) };
  for (const t of txns) {
    if (t.month < 1 || t.month > 12) continue;
    const g = feeGroupOfEntry(`${t.description ?? ""} ${t.vendor ?? ""}`);
    out[g][t.month - 1] += -(t.amount || 0);
  }
  return { nillc: out.nillc.map(Math.round), other: out.other.map(Math.round) };
}

export type GroupTie = {
  key: FeeGroupKey;
  label: string;
  /** The buildings whose fees this entry covers. */
  codes: string[];
  tie: IntercompanyTieOut;
};

/** Tie each entry to the buildings it covers. */
export function groupTieOuts(
  buildings: { code: string; feeMonthly: number[] }[],
  likByGroup: Record<FeeGroupKey, number[]>,
  through: number,
  nillcCodes: readonly string[],
  opts: { tolerance?: number } = {},
): GroupTie[] {
  const inNillc = new Set(nillcCodes.map((c) => c.toUpperCase()));
  const groupOfBuilding = (code: string): FeeGroupKey => (inNillc.has(code.toUpperCase()) ? "nillc" : "other");

  return (["nillc", "other"] as FeeGroupKey[]).map((key) => {
    const rows = buildings.filter((b) => groupOfBuilding(b.code) === key);
    const monthly = new Array(12).fill(0);
    for (const b of rows) for (let m = 0; m < 12; m++) monthly[m] += b.feeMonthly[m] ?? 0;
    return {
      key,
      label: FEE_GROUP_LABEL[key],
      codes: rows.map((b) => b.code),
      tie: intercompanyTieOut(monthly, likByGroup[key], through, opts),
    };
  }).filter((g) => g.codes.length > 0);
}

export type FlagKind =
  /** No fee posted in a month the building normally posts one. */
  | "no-fee"
  /** A negative fee — a reversal or prior-period correction sitting where a
   *  charge should be. Almost always worth reading. */
  | "negative"
  /** Wildly out of line with the building's own usual fee. */
  | "outlier";

export type BuildingFlag = {
  code: string;
  name: string;
  month: number;
  kind: FlagKind;
  /** What was actually posted. */
  amount: number;
  /** The building's usual monthly fee — the median of its posted months. */
  typical: number;
};

/** Ordered so the certain findings come before the suggestive one. */
const FLAG_RANK: Record<FlagKind, number> = { negative: 0, "no-fee": 1, outlier: 2 };

/**
 * Which buildings look wrong — answered from each building's OWN history, with
 * no reference to 2010.
 *
 * This is the question worth asking. "Which buildings tie to 2010" cannot be
 * answered (2010 books two lump entries, not per building), but "which
 * buildings' fees look wrong" can, and it is what someone actually wants when
 * they ask. A fee is a percentage of collections, so a building's own fee is
 * stable month to month; a month that breaks that pattern is where a keying
 * error is.
 *
 * Deliberately conservative — a false positive here costs someone a search
 * through a ledger for nothing, which is worse than a quiet month:
 *   · three posted months are required before any judgement;
 *   · only months INSIDE the building's own posting run count, so a building
 *     that started billing in April is not accused of missing January;
 *   · an outlier must be double or half the usual fee AND differ by a material
 *     amount, so a building with a $300 fee is not flagged over $150.
 */
export function buildingFlags(
  buildings: { code: string; name: string; feeMonthly: number[]; maxPosted: number }[],
  through: number,
  opts: { minMaterial?: number } = {},
): BuildingFlag[] {
  const minMaterial = opts.minMaterial ?? 500;
  const out: BuildingFlag[] = [];

  for (const b of buildings) {
    const upto = Math.min(through, b.maxPosted || 0);
    if (upto < 3) continue;
    const window = b.feeMonthly.slice(0, upto).map((v, i) => ({ v: Math.round(v), m: i + 1 }));
    const posted = window.filter((x) => Math.abs(x.v) >= POSTED_FLOOR);
    if (posted.length < 3) continue;

    const sorted = posted.map((x) => Math.abs(x.v)).sort((a, b2) => a - b2);
    const typical = sorted[Math.floor(sorted.length / 2)];
    const firstPosted = posted[0].m;

    for (const { v, m } of window) {
      if (v < 0) {
        out.push({ code: b.code, name: b.name, month: m, kind: "negative", amount: v, typical });
      } else if (Math.abs(v) < POSTED_FLOOR) {
        // A zero before the building's first fee is not a gap — it had not
        // started billing yet.
        if (m > firstPosted) out.push({ code: b.code, name: b.name, month: m, kind: "no-fee", amount: 0, typical });
      } else if (typical > 0 && (v > typical * 2 || v < typical / 2) && Math.abs(v - typical) >= minMaterial) {
        out.push({ code: b.code, name: b.name, month: m, kind: "outlier", amount: v, typical });
      }
    }
  }

  return out.sort(
    (a, b2) =>
      FLAG_RANK[a.kind] - FLAG_RANK[b2.kind] ||
      Math.abs(b2.amount - b2.typical) - Math.abs(a.amount - a.typical) ||
      a.code.localeCompare(b2.code),
  );
}

// Rent-roll check — contract rent (what a tenant should be billed) lined up
// against the rental income actually posted, suite by suite.
//
// WHAT THIS ANSWERS, AND WHAT IT DOES NOT.
// The GL's rental income line is what was BILLED, not what was collected: a
// charge posts whether or not the cheque arrives. So this reconciles BILLING —
// a lease that was never keyed, a suite still billed at last year's rate, a
// vacated tenant still being charged. Whether the money came IN is the open
// A/R question, which the Skyline statement import answers; `openAr` carries
// it alongside so both halves read on one row, but the variance column is a
// billing variance and is labelled as one.
//
// THE RENT ROLL IS A POINT-IN-TIME SNAPSHOT carrying today's rate. A single
// month compares exactly; a YTD window cannot know a rate that changed inside
// it, so those rows are marked `approximate` rather than being asserted. Rows
// whose lease starts or ends inside the window are `partial` — the real charge
// is prorated and a whole-month expectation would report a false shortfall.

/** A dollar of slack. Contract rent is exact, so anything beyond rounding is a
 *  real difference worth looking at. */
export const RENT_TOL = 1;

export type RentCheckUnit = {
  /** Canonical unit ref (Skyline's "-CU" suffix already stripped). */
  unitRef: string;
  tenant: string | null;
  isVacant: boolean;
  sqft: number | null;
  /** Monthly base rent as the rent roll reports it today. */
  baseRent: number;
  /** The rent roll's OPERATING EXPENSE month column — the suite's CAM charge. */
  opexMonth: number;
  /** The rent roll's REAL ESTATE TAX month column. */
  reTaxMonth: number;
  /** The rent roll's OTHER EXPENSE month column. */
  otherMonth: number;
  /** Lease term as "MM/DD/YYYY", the rent roll's own format. */
  leaseFrom: string | null;
  leaseTo: string | null;
};

export type RentCheckStatus =
  | "not-billed"   // owed a charge, nothing posted — the one that matters most
  | "short"        // billed less than contract rent
  | "over"         // billed more than contract rent
  | "unexpected"   // billed against a suite with no rent due (vacant / no lease)
  | "partial"      // lease starts or ends inside the window; a prorated charge
  | "ok"           // ties within a dollar
  | "idle";        // nothing due and nothing billed

export type RentCheckRow = {
  unitRef: string;
  /** The unit segment alone — "406" out of "9510-406". */
  suite: string;
  tenant: string | null;
  sqft: number | null;
  /** Contract rent over the window. */
  expected: number;
  /** Rental income posted to the suite over the window. */
  billed: number;
  /** billed − expected. Negative means under-billed. */
  variance: number;
  /** Open A/R from the latest statement import, when one covers this suite. */
  openAr: number | null;
  pastDue: number | null;
  status: RentCheckStatus;
  /** Why the expectation may not be exact. Empty means it is. */
  caveats: string[];
  /** Months of the window the lease covers. */
  monthsCovered: number;
  monthsInScope: number;
};

export type RentCheckResult = {
  rows: RentCheckRow[];
  totals: {
    expected: number;
    billed: number;
    variance: number;
    openAr: number | null;
    pastDue: number | null;
  };
  /** Rental income that could not be placed on a suite at all (a payer-named
   *  charge, a posting with no unit ref). Reported rather than hidden, because
   *  a billed column that quietly drops money reads as a shortfall. */
  unplacedBilled: number;
  counts: Record<RentCheckStatus, number>;
};

const round = (n: number) => Math.round(n * 100) / 100;

/** "MM/DD/YYYY" → "YYYY-MM-DD". Null for anything else (the rent roll stores
 *  the literal cell when it isn't a date). */
export function mdyToISO(s: string | null): string | null {
  if (!s) return null;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
  if (!m) return null;
  return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

const monthStart = (year: number, m: number) => `${year}-${String(m).padStart(2, "0")}-01`;
const monthEnd = (year: number, m: number) => {
  const d = new Date(Date.UTC(year, m, 0)); // day 0 of next month = last of this
  return `${year}-${String(m).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};

/** The suite alone — "9510-406" → "406". Multi-segment refs keep everything
 *  after the property code. */
export function suiteOf(unitRef: string): string {
  const i = unitRef.indexOf("-");
  return i < 0 ? unitRef : unitRef.slice(i + 1);
}

/**
 * WHICH rent-roll column a line is checked against.
 *
 * The rent roll bills four things per suite, in four columns — BASE RENT,
 * OPERATING EXPENSE (CAM), REAL ESTATE TAX and OTHER EXPENSE — and the
 * statement has a line for each. Checking every one of them against BASE RENT
 * is how 4500's Common Area read a $109,301 "billing variance" on a month that
 * ties to the dollar: the GL had billed $30,030 of CAM, the rent roll's CAM
 * column says $30,030, and the comparison was against $139,331 of base rent.
 *
 * The rent roll has NO insurance column, so an insurance line is checked
 * against OTHER EXPENSE, which is Skyline's catch-all and may carry more than
 * insurance. That is a real approximation and the table says so rather than
 * presenting the difference as a billing error.
 */
export type RentCheckBasis = "base" | "cam" | "ret" | "other";

export const BASIS_LABEL: Record<RentCheckBasis, string> = {
  base: "Rent roll", cam: "Rent roll · CAM", ret: "Rent roll · RE tax", other: "Rent roll · Other",
};

export const BASIS_SOURCE: Record<RentCheckBasis, string> = {
  base: "contract base rent for the suite",
  cam: "the suite's monthly CAM charge, from the rent roll's OPERATING EXPENSE column",
  ret: "the suite's monthly tax charge, from the rent roll's REAL ESTATE TAX column",
  other: "the rent roll's OTHER EXPENSE column",
};

const monthlyFor = (u: RentCheckUnit, basis: RentCheckBasis): number =>
  basis === "cam" ? (u.opexMonth || 0)
  : basis === "ret" ? (u.reTaxMonth || 0)
  : basis === "other" ? (u.otherMonth || 0)
  : (u.baseRent || 0);

const maskParts = (mask: string): string[] =>
  mask.split(",").map((m) => m.trim()).filter(Boolean);

/**
 * The rent-roll column a statement line should be checked against, or null
 * when there isn't one.
 *
 * NULL IS THE IMPORTANT ANSWER. Electric reimbursement, condo fees and
 * percentage rents are all billed per suite and none of them is a column on
 * the rent roll, so there is nothing to reconcile against — and before this
 * they were all silently compared to base rent. A line with no basis shows the
 * per-tenant GL summary instead, which claims nothing it cannot support.
 *
 * The LABEL is read first because the masks overlap: Electric is
 * `4710-*,4910-8503`, and 4910 is the Common Area family.
 */
export function basisForLine(label: string, mask: string): RentCheckBasis | null {
  if (/real\s*estate\s*tax/i.test(label)) return "ret";
  if (/insurance/i.test(label)) return "other";
  if (/common\s*area/i.test(label)) return "cam";
  if (/rental\s*income|base\s*rent/i.test(label)) return "base";
  const parts = maskParts(mask);
  if (!parts.length) return null;
  const all = (re: RegExp) => parts.every((p) => re.test(p));
  // 4910-8503 is the ELECTRIC sub-account, not CAM. Electric's mask is
  // normally `4710-*,4910-8503` and fails the all-4910 test anyway, but a
  // property mapped to 4910-8503 alone would otherwise resolve to CAM and be
  // checked against the wrong column — the exact bug this function exists to
  // stop. The CAM sub-accounts in use are -0000, -8501, -8502 and -8506.
  if (all(/^(4910|4901)/) && !parts.some((p) => /^4910-8503/.test(p))) return "cam";
  if (all(/^4920/)) return "ret";
  if (all(/^4930/)) return "other";
  if (all(/^4230/)) return "base";
  return null;
}

export type RentCheckInput = {
  year: number;
  /** 1–12, the statement period in view. */
  period: number;
  scope: "month" | "ytd";
  units: RentCheckUnit[];
  /** Canonical unit ref → rental income posted in the window. */
  billedByUnit: Record<string, number>;
  /** Canonical unit ref → open A/R from the latest statement import. */
  arByUnit?: Record<string, { totalDue: number; pastDue: number }>;
  /** Billed rental income that resolved to no suite. */
  unplacedBilled?: number;
  /** Which rent-roll column to expect. Defaults to base rent. */
  basis?: RentCheckBasis;
};

/** Rank worst-first: what needs doing before what merely needs reading. */
const STATUS_RANK: Record<RentCheckStatus, number> = {
  "not-billed": 0, short: 1, unexpected: 2, over: 3, partial: 4, ok: 5, idle: 6,
};

export function rentCheck(input: RentCheckInput): RentCheckResult {
  const { year, scope, units, billedByUnit, arByUnit } = input;
  const basis = input.basis ?? "base";
  const period = Math.min(12, Math.max(1, input.period));
  const months = scope === "month" ? [period] : Array.from({ length: period }, (_, i) => i + 1);

  const seen = new Set<string>();
  const rows: RentCheckRow[] = units.map((u) => {
    const from = mdyToISO(u.leaseFrom);
    const to = mdyToISO(u.leaseTo);
    let covered = 0;
    let partial = false;
    for (const m of months) {
      const start = monthStart(year, m);
      const end = monthEnd(year, m);
      if (from && from > end) continue;       // lease hasn't started
      if (to && to < start) continue;         // lease already ended
      covered += 1;
      if ((from && from > start) || (to && to < end)) partial = true;
    }
    // A vacant suite is owed nothing regardless of what dates the roll carries.
    const expected = round(u.isVacant ? 0 : monthlyFor(u, basis) * covered);
    const key = u.unitRef.toUpperCase();
    seen.add(key);
    const billed = round(billedByUnit[key] ?? 0);
    const variance = round(billed - expected);
    const ar = arByUnit?.[key] ?? null;

    const caveats: string[] = [];
    if (partial) caveats.push("Lease starts or ends inside this window — the real charge is prorated.");
    if (scope === "ytd" && expected > 0) caveats.push("Rent roll carries today's rate; a mid-year escalation isn't in it.");
    // Vacant space should carry no rent. When it does, the usual cause is a
    // lease signed since the rent roll was last imported — say so, because
    // "unexpected" on its own reads like a posting error when it often isn't.
    if (u.isVacant && billed > RENT_TOL) {
      caveats.push("The rent roll shows this suite vacant but rent is posting — most often a new lease signed since the roll was last imported. Re-import the rent roll, or check the charge is on the right suite.");
    }

    let status: RentCheckStatus;
    if (expected <= RENT_TOL && billed <= RENT_TOL) status = "idle";
    else if (expected <= RENT_TOL) status = "unexpected";
    else if (partial) status = "partial";
    else if (Math.abs(variance) <= RENT_TOL) status = "ok";
    else if (billed <= RENT_TOL) status = "not-billed";
    else status = variance < 0 ? "short" : "over";

    return {
      unitRef: u.unitRef, suite: suiteOf(u.unitRef), tenant: u.tenant, sqft: u.sqft,
      expected, billed, variance,
      openAr: ar ? round(ar.totalDue) : null,
      pastDue: ar ? round(ar.pastDue) : null,
      status, caveats, monthsCovered: covered, monthsInScope: months.length,
    };
  });

  // Rental income placed on a suite the rent roll doesn't carry — a former
  // tenant's suite, or a unit not yet imported. Surfaced as its own row so the
  // billed column still ties to the GL line.
  for (const [key, amt] of Object.entries(billedByUnit)) {
    if (seen.has(key) || Math.abs(amt) <= RENT_TOL) continue;
    const ar = arByUnit?.[key] ?? null;
    rows.push({
      unitRef: key, suite: suiteOf(key), tenant: null, sqft: null,
      expected: 0, billed: round(amt), variance: round(amt),
      openAr: ar ? round(ar.totalDue) : null,
      pastDue: ar ? round(ar.pastDue) : null,
      status: "unexpected",
      caveats: ["This suite isn't on the current rent roll — a prior tenant, or a unit not yet imported."],
      monthsCovered: 0, monthsInScope: months.length,
    });
  }

  rows.sort((a, b) =>
    STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
    Math.abs(b.variance) - Math.abs(a.variance) ||
    a.unitRef.localeCompare(b.unitRef));

  const counts = Object.fromEntries(Object.keys(STATUS_RANK).map((k) => [k, 0])) as Record<RentCheckStatus, number>;
  for (const r of rows) counts[r.status] += 1;

  const hasAr = !!arByUnit;
  const sum = (pick: (r: RentCheckRow) => number) => round(rows.reduce((s, r) => s + pick(r), 0));
  return {
    rows,
    totals: {
      expected: sum((r) => r.expected),
      billed: sum((r) => r.billed),
      variance: sum((r) => r.variance),
      openAr: hasAr ? sum((r) => r.openAr ?? 0) : null,
      pastDue: hasAr ? sum((r) => r.pastDue ?? 0) : null,
    },
    unplacedBilled: round(input.unplacedBilled ?? 0),
    counts,
  };
}

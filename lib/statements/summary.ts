// Derivations over a parsed tenant statement — the numbers the portal, the PDF
// and the admin roster all read from, so they can never disagree.

import {
  AGING_ORDER, CATEGORY_ORDER,
  type AgingBucket, type ChargeCategory, type StatementCharge, type TenantStatement,
} from "./types";

/** "YYYY-MM" → months since year 0, for calendar-month arithmetic. */
function monthIndex(period: string): number {
  const [y, m] = period.split("-").map(Number);
  return y * 12 + (m - 1);
}

/** Last calendar day of a "YYYY-MM" period, as YYYY-MM-DD. */
export function periodEndISO(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** "2026-09" → "September 2026". */
export function periodLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return `${new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: "long", timeZone: "UTC" })} ${y}`;
}

/** "2026-09-01" → "Sep 1, 2026". */
export function dateLabel(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return `${new Date(Date.UTC(y, m - 1, d)).toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}, ${y}`;
}

/**
 * Aging bucket for one charge, by calendar month against the statement period —
 * which is how a rent ledger actually ages: this month's charges are current,
 * last month's are 30 days out, and so on. Undated lines (the aggregate credit
 * row) count as current.
 */
export function agingOf(charge: StatementCharge, period: string): AgingBucket {
  if (!charge.dateISO) return "current";
  const back = monthIndex(period) - monthIndex(charge.dateISO.slice(0, 7));
  if (back <= 0) return "current";
  if (back === 1) return "d30";
  if (back === 2) return "d60";
  if (back === 3) return "d90";
  return "d90plus";
}

export type CategoryTotal = { category: ChargeCategory; amount: number; count: number };
export type AgingTotal = { bucket: AgingBucket; amount: number };

export type StatementSummary = {
  /** Everything open, net of credits — what the tenant owes today. */
  totalDue: number;
  /** Charges dated within the statement month. */
  currentCharges: number;
  /** Everything dated before the statement month, net of credits. */
  priorBalance: number;
  /** Credits on account, as a positive number. */
  credits: number;
  byCategory: CategoryTotal[];
  byAging: AgingTotal[];
  /** True when anything at all is past due (outside the current bucket). */
  pastDue: boolean;
  pastDueAmount: number;
  /** Oldest open charge date, or null. */
  oldestISO: string | null;
};

const round = (n: number) => Math.round(n * 100) / 100;

export function summarize(st: TenantStatement, period: string): StatementSummary {
  const catMap = new Map<ChargeCategory, CategoryTotal>();
  const ageMap = new Map<AgingBucket, number>();
  let currentCharges = 0, priorBalance = 0, credits = 0, oldest: string | null = null;

  for (const c of st.charges) {
    const cat = catMap.get(c.category) ?? { category: c.category, amount: 0, count: 0 };
    cat.amount += c.amount; cat.count += 1;
    catMap.set(c.category, cat);

    const bucket = agingOf(c, period);
    ageMap.set(bucket, (ageMap.get(bucket) ?? 0) + c.amount);

    if (bucket === "current") currentCharges += c.amount;
    else priorBalance += c.amount;
    if (c.amount < 0) credits += -c.amount;
    if (c.dateISO && (oldest === null || c.dateISO < oldest)) oldest = c.dateISO;
  }

  const byAging = AGING_ORDER
    .map((bucket) => ({ bucket, amount: round(ageMap.get(bucket) ?? 0) }))
    .filter((b) => Math.abs(b.amount) >= 0.005);
  const pastDueAmount = round(byAging.filter((b) => b.bucket !== "current").reduce((a, b) => a + b.amount, 0));

  return {
    totalDue: round(st.chargeTotal),
    currentCharges: round(currentCharges),
    priorBalance: round(priorBalance),
    credits: round(credits),
    byCategory: CATEGORY_ORDER
      .map((category) => catMap.get(category))
      .filter((c): c is CategoryTotal => !!c && Math.abs(c.amount) >= 0.005)
      .map((c) => ({ ...c, amount: round(c.amount) })),
    byAging,
    pastDue: pastDueAmount > 0.005,
    pastDueAmount,
    oldestISO: oldest,
  };
}

/**
 * Charges in the order Skyline's laser statement prints them, so the portal
 * statement, the PDF and the admin ledger can be read side by side with the
 * paper statement line for line.
 *
 * That order is the parse order — the report runs oldest charge first with the
 * aggregate "Open Credits" row last (true for every tenant in the exports we've
 * seen). Undated rows are still pinned to the end as a safety net, so a future
 * export that interleaves them can't scatter credits through the ledger.
 */
export function statementCharges(st: TenantStatement): StatementCharge[] {
  const dated = st.charges.filter((c) => c.dateISO);
  const undated = st.charges.filter((c) => !c.dateISO);
  return [...dated, ...undated];
}

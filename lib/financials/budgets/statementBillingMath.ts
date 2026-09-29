// Pure half of `statementBilling.ts` — a tenant's monthly charges, by kind,
// read off the dated lines of their monthly statement (the Skyline Statement
// report). Each line carries its date and a category from its description
// (`classifyCharge`), so a month's rent / CAM / INS / RET / U&O is simply the
// sum of that month's lines of each kind.

import type { StatementCharge } from "@/lib/statements/types";

export const STATEMENT_KINDS = ["rent", "cam", "ins", "ret", "uo"] as const;
export type StatementKind = (typeof STATEMENT_KINDS)[number];

const CATEGORY_KIND: Partial<Record<StatementCharge["category"], StatementKind>> = {
  rent: "rent", cam: "cam", insurance: "ins", ret: "ret", uando: "uo",
};

export type StatementBilling = {
  /** The statement month the figures are for ("YYYY-MM") — the newest month
   *  the tenant's lines carry a recurring charge in. */
  month?: string;
  /** Each kind's total in THAT month; absent = no line of that kind that month. */
  rent?: number; cam?: number; ins?: number; ret?: number; uo?: number;
};

/** The tenant's newest month of charges, by kind. Only CHARGES count: dated,
 *  owed (positive), and not a year-end reconciliation adjustment — a credit, a
 *  payment or a true-up is not what the tenant is billed a month. */
export function statementMonthlyBilling(charges: StatementCharge[]): StatementBilling {
  const byMonth = new Map<string, Partial<Record<StatementKind, number>>>();
  for (const c of charges) {
    const kind = CATEGORY_KIND[c.category];
    if (!kind || !c.dateISO || !(c.amount > 0) || c.reconYear != null) continue;
    const m = c.dateISO.slice(0, 7);
    const e = byMonth.get(m) ?? {};
    e[kind] = Math.round(((e[kind] ?? 0) + c.amount) * 100) / 100;
    byMonth.set(m, e);
  }
  if (!byMonth.size) return {};
  const month = [...byMonth.keys()].sort().pop()!;
  return { month, ...byMonth.get(month) };
}

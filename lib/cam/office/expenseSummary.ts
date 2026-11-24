// Final Expense Summary — the per-building, per-year reconciliation of the
// operating-expense pool itself, before it feeds the tenant CAM/RET calc.
//
// For each GL account: TB Detail is what the general ledger says, Excel Avid
// is the figure imported from Avid (entered/imported by staff), the variance
// is Avid − TB, and FINAL is the chosen amount (with a free-text
// description). FINAL is what the reconciliation actually uses as the
// current-year expense, and what gets recorded as the year's history.
//
// Seeded from the 4070 workbook's "Expenses & Occ" reconciliation block; the
// FINAL seeds equal the pool's 2025 values, so the tenant recon ties out
// until a FINAL is edited.

export type ExpenseSummaryRow = {
  account: string;
  label: string;
  /** General-ledger figure (TB Detail). */
  tbDetail: number;
  /** Imported Avid figure. */
  excelAvid: number;
  /** Chosen final expense — used by the CAM/RET calc + stored as history. */
  final: number;
  description: string;
};

/** Seed rows keyed by property → recon year. */
export const EXPENSE_SUMMARY_SEED: Record<string, Record<number, ExpenseSummaryRow[]>> = {
  "4070": {
    2025: [
      { account: "6130-8502", label: "Water / Sewer",        tbDetail: 18115.85, excelAvid: 18115.85, final: 18115.85, description: "" },
      { account: "6220-8502", label: "Building Maintenance",  tbDetail: 88462.04, excelAvid: 22953.79, final: 87896,    description: "" },
      { account: "6030-8502", label: "Maintenance Salaries",  tbDetail: 10608,    excelAvid: 5304,     final: 10608,    description: "" },
      { account: "6270-8502", label: "Trash Removal",         tbDetail: 25698.5,  excelAvid: 45.74,    final: 25698.5,  description: "" },
      { account: "6360-8502", label: "Parking Lot Maint.",    tbDetail: 8268.93,  excelAvid: 4879.42,  final: 8268.93,  description: "" },
      { account: "6350-8502", label: "Security",              tbDetail: 4716.86,  excelAvid: 2727.71,  final: 5856,     description: "" },
      { account: "6370-8502", label: "Snow Removal",          tbDetail: 12273.32, excelAvid: 7676,     final: 12273.32, description: "" },
      { account: "6380-8502", label: "Landscaping",           tbDetail: 28302.44, excelAvid: 4406.77,  final: 18482,    description: "" },
      { account: "6510-8502", label: "Insurance",             tbDetail: 34920.36, excelAvid: 0,        final: 34920.36, description: "" },
      { account: "6610-8502", label: "Management Fee",        tbDetail: 39678.16, excelAvid: 0,        final: 39678.16, description: "" },
      { account: "6990-8502", label: "Condo",                 tbDetail: 0,        excelAvid: 0,        final: 0,        description: "" },
      { account: "6250-8502", label: "Cleaning",              tbDetail: 76053.65, excelAvid: 7523.75,  final: 76053.65, description: "" },
      { account: "6120-8502", label: "Electric",              tbDetail: 134253.73, excelAvid: 0,       final: 134253.73, description: "" },
      { account: "6410-8502", label: "Real Estate Taxes",     tbDetail: 151204.465, excelAvid: 0,      final: 151204.465, description: "" },
    ],
  },
};

/** account → FINAL for the recon year, for the engine override. */
export function finalsFromSummary(rows: { account: string; final: number }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[r.account] = r.final;
  return out;
}

/** Derive the Final Expense Summary rows straight from the historic expense
 *  pool (the operating-expense history) for a given year — every operating-
 *  expense line plus RET, with TB Detail / Excel Avid / FINAL all equal to
 *  the booked figure. This is the basis when the history itself is the final
 *  (2025): nothing is adjusted, so there's no variance. The gross-up "-95"
 *  variants and separately-billed charges aren't recovered line items, so the
 *  schedule lists the raw operating accounts that drive the recon. */
export function summaryRowsFromPool(
  pool: { opexLines: { glAccount: string; label: string }[]; retAccount: string; values: Record<string, Record<string, number>> },
  year: number,
): ExpenseSummaryRow[] {
  const y = String(year);
  const rows: ExpenseSummaryRow[] = pool.opexLines.map((l) => {
    const v = pool.values[l.glAccount]?.[y] ?? 0;
    return { account: l.glAccount, label: l.label, tbDetail: v, excelAvid: v, final: v, description: "" };
  });
  const ret = pool.values[pool.retAccount]?.[y] ?? 0;
  rows.push({ account: pool.retAccount, label: "Real Estate Taxes", tbDetail: ret, excelAvid: ret, final: ret, description: "" });
  return rows;
}

/** Pool-derived summary with the same shape as mergeExpenseSummary (variance
 *  column), and stored overrides applied on top. With no overrides every
 *  column equals the booked figure and the variance is zero — the
 *  "history is final" case. */
export function mergeExpenseSummaryFromPool(
  pool: { opexLines: { glAccount: string; label: string }[]; retAccount: string; values: Record<string, Record<string, number>> },
  year: number,
  overrides: ExpenseOverrides,
): (ExpenseSummaryRow & { variance: number })[] {
  return summaryRowsFromPool(pool, year).map((row) => {
    const ov = overrides[row.account] ?? {};
    const excelAvid = ov.excelAvid ?? row.excelAvid;
    const final = ov.final ?? row.final;
    const description = ov.description ?? row.description;
    return { ...row, excelAvid, final, description, variance: excelAvid - row.tbDetail };
  });
}

export type ExpenseOverride = { excelAvid?: number; final?: number; description?: string };
export type ExpenseOverrides = Record<string, ExpenseOverride>;

/** Seed rows merged with stored overrides; variance recomputed (Avid − TB).
 *  Pure — no storage — so it's safe to unit-test. */
export function mergeExpenseSummary(
  property: string,
  year: number,
  overrides: ExpenseOverrides,
): (ExpenseSummaryRow & { variance: number })[] {
  const seed = EXPENSE_SUMMARY_SEED[property]?.[year] ?? [];
  return seed.map((row) => {
    const ov = overrides[row.account] ?? {};
    const excelAvid = ov.excelAvid ?? row.excelAvid;
    const final = ov.final ?? row.final;
    const description = ov.description ?? row.description;
    return { ...row, excelAvid, final, description, variance: excelAvid - row.tbDetail };
  });
}

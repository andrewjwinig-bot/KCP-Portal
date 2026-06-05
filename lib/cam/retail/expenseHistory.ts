// Multi-year retail operating-expense history (actuals), powering the trend
// columns shown to the right of FINAL on the retail Final Expense Summary.
//
// Code-level seed — the same pattern the office side uses (baseYearExpenses.ts).
// Keyed by property, then by the EXPENSE-POOL line label (so the recon's pool
// lines match directly), plus the Property Insurance ("ins") and Real Estate
// Taxes ("ret") pools. The recon page shows a MOVING window: the up-to-3 years
// immediately before the reconciliation year, so it advances on its own.

export type RetailExpenseHistory = {
  /** Pool line label → year (4-digit string) → annual actual $. */
  lines: Record<string, Record<string, number>>;
  /** Property insurance pool, year → $. */
  ins: Record<string, number>;
  /** Real-estate-tax pool, year → $. */
  ret: Record<string, number>;
};

export const RETAIL_EXPENSE_HISTORY: Record<string, RetailExpenseHistory> = {
  // Brookwood Shopping Center (2300). Labels match POOL_2300's camLines.
  "2300": {
    lines: {
      "Maintenance Salaries": { "2024": 22752, "2023": 17880 },
      "Electric (Common)": { "2024": 8078, "2023": 6426.54 },
      "Water / Sewer": { "2024": 0, "2023": 0 },
      "Building Maintenance": { "2024": 35350, "2023": 19484.44 },
      "Parking Lot Cleaning": { "2024": 34608, "2023": 32134.44 },
      "Trash Removal": { "2024": 1236 },
      "Security": { "2024": 14400, "2023": 0 },
      "Parking Lot Maintenance": { "2024": 31600, "2023": 62821.44 },
      "Snow Removal": { "2024": 44290, "2023": 1655 },
      "Landscaping": { "2024": 33339, "2023": 11255.02 },
      "Liability Insurance": { "2024": 39479 },
    },
    ins: { "2024": 9488 },
    ret: { "2024": 147961.59 },
  },
};

/** The up-to-`n` most recent years strictly before `reconYear` that carry any
 *  history for this property, newest first. Moving window. */
export function retailHistoryYears(property: string, reconYear: number, n = 3): number[] {
  const h = RETAIL_EXPENSE_HISTORY[property];
  if (!h) return [];
  const set = new Set<number>();
  const collect = (m: Record<string, number>) => {
    for (const y of Object.keys(m)) {
      const yy = Number(y);
      if (Number.isFinite(yy) && yy < reconYear) set.add(yy);
    }
  };
  for (const m of Object.values(h.lines)) collect(m);
  collect(h.ins);
  collect(h.ret);
  return [...set].sort((a, b) => b - a).slice(0, n);
}

const pick = (m: Record<string, number> | undefined, years: number[]): (number | null)[] =>
  years.map((y) => (m && m[String(y)] != null ? m[String(y)] : null));

export function retailLineHistory(property: string, label: string, years: number[]): (number | null)[] {
  return pick(RETAIL_EXPENSE_HISTORY[property]?.lines[label], years);
}
export function retailInsHistory(property: string, years: number[]): (number | null)[] {
  return pick(RETAIL_EXPENSE_HISTORY[property]?.ins, years);
}
export function retailRetHistory(property: string, years: number[]): (number | null)[] {
  return pick(RETAIL_EXPENSE_HISTORY[property]?.ret, years);
}

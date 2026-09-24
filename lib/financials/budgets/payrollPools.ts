// PAYROLL ENTERED ONCE, ALLOCATED ACROSS THE BOOK. Maintenance Salaries
// (6030-8502) and Salaries & Wages / Marketing Salaries (6010-8501) are not
// budgeted property by property: the owner's workbook takes each as ONE total
// ("From 2026 Payroll Budget") and allocates it across the shopping centres by
// each property's share — 2300 carries 20.75% of Maintenance Salaries, 9510
// 0% of Salaries & Wages. So the draft does the same: one total per block,
// typed once for the book, and every property's line is its share of it.
//
// The shares come from last year's budget of record (the workbook's
// Allocated Expenses tab, parsed onto each line as `allocations`), so they
// match the workbook exactly. Until a total is entered the block carries last
// year's +3%. Later this links to the LIK Payroll book (`lik-payroll` already
// `feeds` these books); for now the total is typed.
//
// Pure: the caller loads the prior budget and the stored totals.

import type { PropertyBudget, BudgetLine } from "./types";

export type PoolBlock = {
  /** `gl|label` — two blocks share 6010-8501 (Salaries & Wages, Marketing Salaries). */
  key: string;
  label: string;
  gl: string;
  /** Last year's portfolio total for the block. */
  priorTotal: number;
  /** Each property's share, 0–100. */
  shares: Record<string, number>;
  note?: string;
};
export type PoolEntry = { annual: number; by?: string; at?: string };
export type PoolEntries = Record<string, PoolEntry>;

export const POOL_GROWTH = 1.03;
const PAYROLL = /payroll/i;

const walk = (l: BudgetLine, f: (l: BudgetLine) => void) => { f(l); (l.subLines ?? []).forEach((s) => walk(s, f)); };

/** The payroll blocks allocated across a book, read off last year's budget. */
export function payrollBlocks(prior: PropertyBudget[]): PoolBlock[] {
  const out = new Map<string, PoolBlock>();
  for (const p of prior) for (const s of p.sections) for (const line of s.lines) walk(line, (l) => {
    for (const a of l.allocations ?? []) {
      if (!a.glAccount || !PAYROLL.test(a.sourceNote ?? "")) continue;
      // The workbook spells one block "Slaries & Wages"; read it as meant, so
      // a corrected workbook keeps the same key.
      const label = a.blockLabel.trim().replace(/\bSlaries\b/i, "Salaries");
      const key = `${a.glAccount}|${label}`;
      if (out.has(key)) continue;
      const shares: Record<string, number> = {};
      for (const r of a.rows ?? []) shares[String(r.propertyCode).toUpperCase()] = r.sharePct;
      out.set(key, { key, label, gl: a.glAccount, priorTotal: Math.round(a.portfolioTotal), shares, note: a.sourceNote });
    }
  });
  return [...out.values()].sort((a, b) => a.gl.localeCompare(b.gl) || a.label.localeCompare(b.label));
}

/** The block's total for the budget year: what was entered, else last year +3%. */
export function poolAnnual(block: PoolBlock, entry?: PoolEntry | null): { annual: number; entered: boolean } {
  if (entry && Number.isFinite(entry.annual)) return { annual: Math.round(entry.annual), entered: true };
  return { annual: Math.round(block.priorTotal * POOL_GROWTH), entered: false };
}

/** One property's share of a block, month by month — even, whole dollars that
 *  add back to its annual exactly. Null when the property takes no share. */
export function allocatePool(block: PoolBlock, annual: number, propertyCode: string): number[] | null {
  const share = block.shares[propertyCode.toUpperCase()];
  if (share == null) return null;
  const total = Math.round((annual * share) / 100);
  const base = Math.trunc(total / 12);
  let left = total - base * 12;
  return Array.from({ length: 12 }, () => { if (left > 0) { left--; return base + 1; } if (left < 0) { left++; return base - 1; } return base; });
}

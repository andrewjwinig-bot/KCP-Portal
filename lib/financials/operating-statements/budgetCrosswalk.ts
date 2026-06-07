// Budget cross-walk for operating statements.
//
// Lines each statement line up to the portal Operating Budget using the SAME
// account masks that map the GL. For a statement line, we sum the budget lines
// whose GL account matches the line's mask — so the statement's Budget column
// ties to the Budgets page automatically, with no second mapping to maintain.
//
// Period/YTD/Annual:
//   periodBudget = Σ matching budget lines' month[period-1]
//   ytdBudget    = Σ matching budget lines' months[0..period-1]
//   annualBudget = Σ matching budget lines' total
//
// Budget months are stored in display orientation (revenue positive, expense
// positive) — the same orientation the statement actuals use after the GL
// sign-flip — so variances line up without further sign handling.

import "server-only";
import { listBudgets } from "@/lib/financials/budgets/storage";
import type { BudgetLine } from "@/lib/financials/budgets/types";
import { accountMatchesMask } from "./mask";
import type { LineBudget } from "./types";

/** Flattened budget line keyed by GL account. */
type FlatBudgetLine = { glAccount: string; months: number[]; total: number };

/** Recursively flatten a budget line + its sub-lines into account-keyed rows
 *  (skipping subtotal rows with no GL account). */
function flatten(line: BudgetLine, out: FlatBudgetLine[]): void {
  if (line.glAccount && !line.isSubtotal) {
    out.push({ glAccount: line.glAccount, months: line.months ?? [], total: line.total ?? 0 });
  }
  for (const sub of line.subLines ?? []) flatten(sub, out);
}

export type ResolvedBudget = {
  /** The budget year actually used (may differ from the requested year when we
   *  fall back to the nearest available budget). */
  budgetYear: number;
  /** True when budgetYear ≠ the requested statement year. */
  fallback: boolean;
  lines: FlatBudgetLine[];
};

/** Find the property's budget for `year`; if none, fall back to the nearest
 *  available budget year for that property (newest). Returns null if the
 *  property has no budget in any loaded workbook. */
export async function resolvePropertyBudget(
  propertyCode: string,
  year: number
): Promise<ResolvedBudget | null> {
  const workbooks = await listBudgets();
  // Candidate (year, lines) for this property across every workbook.
  const byYear = new Map<number, FlatBudgetLine[]>();
  for (const wb of workbooks) {
    const prop = wb.properties.find((p) => p.propertyCode === propertyCode);
    if (!prop) continue;
    const flat: FlatBudgetLine[] = [];
    for (const sec of prop.sections) for (const line of sec.lines) flatten(line, flat);
    if (flat.length) {
      const existing = byYear.get(wb.year) ?? [];
      byYear.set(wb.year, existing.concat(flat));
    }
  }
  if (!byYear.size) return null;

  if (byYear.has(year)) return { budgetYear: year, fallback: false, lines: byYear.get(year)! };
  // Nearest available year (prefer the most recent).
  const best = [...byYear.keys()].sort((a, b) => b - a)[0];
  return { budgetYear: best, fallback: true, lines: byYear.get(best)! };
}

/** Build the compute's budgetLookup from resolved budget lines. Matches a
 *  statement line's mask against budget GL accounts and aggregates. */
export function makeBudgetLookup(
  budget: ResolvedBudget,
  period: number
): (sectionName: string, lineLabel: string, mask: string) => LineBudget | null {
  return (_section, _label, mask) => {
    const matched = budget.lines.filter((l) => accountMatchesMask(mask, l.glAccount));
    if (!matched.length) return { periodBudget: 0, ytdBudget: 0, annualBudget: 0 };
    let periodBudget = 0, ytdBudget = 0, annualBudget = 0;
    for (const l of matched) {
      periodBudget += l.months[period - 1] ?? 0;
      ytdBudget += l.months.slice(0, period).reduce((a, n) => a + (n ?? 0), 0);
      annualBudget += l.total;
    }
    return { periodBudget, ytdBudget, annualBudget };
  };
}

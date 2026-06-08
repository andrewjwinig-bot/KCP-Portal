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
import type { BudgetLine, RentDetail } from "@/lib/financials/budgets/types";
import { accountMatchesMask } from "./mask";
import type { LineBudget } from "./types";

/** Flattened budget line keyed by GL account. */
type FlatBudgetLine = { glAccount: string; label: string; months: number[]; total: number };

/** The per-tenant rent roster carried on the budget's "Total Rental and Other"
 *  subtotal (when the workbook has it). Found by walking the tree. */
function findRentDetail(lines: BudgetLine[]): RentDetail | undefined {
  for (const l of lines) {
    if (l.rentDetail && l.rentDetail.entries.length) return l.rentDetail;
    const sub = l.subLines ? findRentDetail(l.subLines) : undefined;
    if (sub) return sub;
  }
  return undefined;
}

/** Recursively flatten a budget line + its sub-lines into account-keyed rows
 *  (skipping subtotal rows with no GL account). */
function flatten(line: BudgetLine, out: FlatBudgetLine[]): void {
  if (line.glAccount && !line.isSubtotal) {
    out.push({ glAccount: line.glAccount, label: line.label ?? "", months: line.months ?? [], total: line.total ?? 0 });
  }
  for (const sub of line.subLines ?? []) flatten(sub, out);
}

/** Budget lines behind a statement line's budget cell. Walks the budget TREE
 *  (not the flattened list) so a line's descriptive sub-rows show through: when
 *  a matched line has sub-lines (e.g. Building Maintenance → "Misc Expenses"),
 *  the breakdown rows are returned instead of the parent, so you see exactly
 *  what the budgeted amount was for. */
export function budgetDetailForMask(budget: ResolvedBudget, mask: string, period: number) {
  const rows: { label: string; glAccount: string; month: number; ytd: number; annual: number }[] = [];
  const toRow = (l: BudgetLine, parentAccount: string) => ({
    label: l.label || parentAccount || l.glAccount || "(unlabeled)",
    glAccount: l.glAccount || parentAccount || "",
    month: l.months?.[period - 1] ?? 0,
    ytd: (l.months ?? []).slice(0, period).reduce((a, n) => a + (n ?? 0), 0),
    annual: l.total ?? 0,
  });
  const walk = (l: BudgetLine, parentMatched: boolean, parentAccount: string) => {
    const selfMatch = !!l.glAccount && accountMatchesMask(mask, l.glAccount);
    const inScope = parentMatched || selfMatch;
    const acct = l.glAccount || parentAccount;
    const subs = (l.subLines ?? []).filter((s) => !s.isSubtotal);
    if (subs.length) {
      // Descend; once a parent matches, its whole sub-tree is in scope.
      for (const s of subs) walk(s, inScope, acct);
    } else if (inScope) {
      rows.push(toRow(l, parentAccount));
    }
  };
  for (const l of budget.tree) walk(l, false, "");
  return rows.filter((r) => r.month !== 0 || r.ytd !== 0 || r.annual !== 0);
}

export type ResolvedBudget = {
  /** The budget year actually used (may differ from the requested year when we
   *  fall back to the nearest available budget). */
  budgetYear: number;
  /** True when budgetYear ≠ the requested statement year. */
  fallback: boolean;
  /** Flattened account-keyed lines (for the budget-column lookup). */
  lines: FlatBudgetLine[];
  /** Structured section lines with sub-lines intact (for the detail drill-down). */
  tree: BudgetLine[];
  /** Per-tenant rent roster from the workbook (when present), surfaced on the
   *  rental-income line's budget drill-down. */
  rentDetail?: RentDetail;
  /** GL accounts of the base-rent lines the roster ties to (so the drill-down
   *  knows which statement line should show the roster). */
  rentAccounts: string[];
};

/** Find the property's budget for `year`; if none, fall back to the nearest
 *  available budget year for that property (newest). Returns null if the
 *  property has no budget in any loaded workbook. */
export async function resolvePropertyBudget(
  propertyCode: string,
  year: number
): Promise<ResolvedBudget | null> {
  const workbooks = await listBudgets();
  // Candidate (year → flat lines + structured tree) for this property.
  const byYear = new Map<number, FlatBudgetLine[]>();
  const byYearTree = new Map<number, BudgetLine[]>();
  for (const wb of workbooks) {
    const prop = wb.properties.find((p) => p.propertyCode === propertyCode);
    if (!prop) continue;
    const flat: FlatBudgetLine[] = [];
    const tree: BudgetLine[] = [];
    for (const sec of prop.sections) for (const line of sec.lines) { flatten(line, flat); tree.push(line); }
    if (flat.length) {
      byYear.set(wb.year, (byYear.get(wb.year) ?? []).concat(flat));
      byYearTree.set(wb.year, (byYearTree.get(wb.year) ?? []).concat(tree));
    }
  }
  if (!byYear.size) return null;

  const build = (budgetYear: number, fallback: boolean): ResolvedBudget => {
    const lines = byYear.get(budgetYear)!;
    const tree = byYearTree.get(budgetYear)!;
    // Base-rent accounts the roster ties to (the "Rental Income" lines).
    const rentAccounts = [...new Set(lines.filter((l) => /rental income/i.test(l.label)).map((l) => l.glAccount))];
    return { budgetYear, fallback, lines, tree, rentDetail: findRentDetail(tree), rentAccounts };
  };

  if (byYear.has(year)) return build(year, false);
  // Nearest available year (prefer the most recent).
  const best = [...byYear.keys()].sort((a, b) => b - a)[0];
  return build(best, true);
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

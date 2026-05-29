// Total-recompute for a live budget property after an inline-edit.
// Walks the property bottom-up: line totals → parent rollups (when the
// parent has sub-lines, its months are the element-wise sum) → in-
// section subtotal rows → cross-section rollups (TOTAL REVENUES /
// TOTAL OPERATING EXPENSES / NOI / CASH FLOW BEFORE & AFTER DEBT
// SERVICE). Imported budgets are read-only so this only runs in
// response to PATCH /api/financials/budgets/[id]/line.

import type { BudgetLine, BudgetSection, PropertyBudget } from "./types";

const MONTHS = 12;
const sumMonths = (ms: number[]) => ms.reduce((s, m) => s + m, 0);
const zeroMonths = () => Array(MONTHS).fill(0);
const addInto = (acc: number[], src: number[]) => acc.map((v, i) => v + (src[i] ?? 0));

function recomputeLine(line: BudgetLine): void {
  if (line.subLines && line.subLines.length > 0) {
    let summed = zeroMonths();
    for (const s of line.subLines) {
      recomputeLine(s);
      summed = addInto(summed, s.months);
    }
    line.months = summed;
  }
  line.total = sumMonths(line.months);
}

function sectionMonthlyTotal(section: BudgetSection): number[] {
  let summed = zeroMonths();
  for (const line of section.lines) {
    if (line.isSubtotal) continue;
    summed = addInto(summed, line.months);
  }
  return summed;
}

function findSection(property: PropertyBudget, ...names: RegExp[]): BudgetSection | undefined {
  return property.sections.find((s) => names.some((re) => re.test(s.name.trim())));
}

function recomputeRollups(property: PropertyBudget): void {
  const rev      = findSection(property, /^revenues?$/i);
  const reimb    = findSection(property, /^reimbursements?$/i);
  const reimbExp = findSection(property, /^reimbursable\s+expenses?$/i);
  const nonReimb = findSection(property, /^non-reimbursable\s+expenses?$/i);
  const ops      = findSection(property, /^operating\s+expenses?$/i, /^operation\s+expenses?$/i);
  const capital  = findSection(property, /^capital/i);
  const debt     = findSection(property, /^debt\s+service/i);

  const revMonths      = rev      ? sectionMonthlyTotal(rev)      : zeroMonths();
  const reimbMonths    = reimb    ? sectionMonthlyTotal(reimb)    : zeroMonths();
  const reimbExpMonths = reimbExp ? sectionMonthlyTotal(reimbExp) : zeroMonths();
  const nonReimbMonths = nonReimb ? sectionMonthlyTotal(nonReimb) : zeroMonths();
  const opsMonths      = ops      ? sectionMonthlyTotal(ops)      : zeroMonths();
  const capitalMonths  = capital  ? sectionMonthlyTotal(capital)  : zeroMonths();
  const debtMonths     = debt     ? sectionMonthlyTotal(debt)     : zeroMonths();

  const totalRev   = addInto(revMonths, reimbMonths);
  const totalOpEx  = addInto(addInto(reimbExpMonths, nonReimbMonths), opsMonths);
  const noi        = totalRev.map((v, i) => v - totalOpEx[i]);
  const cfBefore   = noi.map((v, i) => v - capitalMonths[i]);
  const cfAfter    = cfBefore.map((v, i) => v - debtMonths[i]);

  const set = (name: string, months: number[]) => {
    const r = property.rollups.find((r) => r.name === name);
    if (r) {
      r.months = months;
      r.total = sumMonths(months);
    }
  };
  set("TOTAL REVENUES", totalRev);
  set("TOTAL OPERATING EXPENSES", totalOpEx);
  set("NET OPERATING INCOME", noi);
  set("CASH FLOW BEFORE DEBT SERVICE", cfBefore);
  set("CASH FLOW AFTER DEBT SERVICE", cfAfter);
}

/** Mutates the property in place: line totals → parent-with-sub-lines
 *  → in-section subtotal rows → cross-section rollups. Call this
 *  after applying any monthly-value edit so every derived figure
 *  ties out before saving. */
export function recomputeProperty(property: PropertyBudget): void {
  for (const section of property.sections) {
    for (const line of section.lines) recomputeLine(line);
  }
  for (const section of property.sections) {
    const subtotal = section.lines.find((l) => l.isSubtotal);
    if (!subtotal) continue;
    subtotal.months = sectionMonthlyTotal(section);
    subtotal.total = sumMonths(subtotal.months);
  }
  recomputeRollups(property);
}

/** Resolves a line by its (section, parent?, label) path inside a
 *  property. Returns the resolved BudgetLine reference (mutating it
 *  edits the workbook) or null when the path doesn't match. */
export function findLineByPath(
  property: PropertyBudget,
  sectionName: string,
  parentLineLabel: string | null,
  lineLabel: string,
): BudgetLine | null {
  const section = property.sections.find((s) => s.name.trim() === sectionName.trim());
  if (!section) return null;
  if (parentLineLabel) {
    const parent = section.lines.find((l) => !l.isSubtotal && l.label.trim() === parentLineLabel.trim());
    if (!parent?.subLines) return null;
    return parent.subLines.find((l) => l.label.trim() === lineLabel.trim()) ?? null;
  }
  return section.lines.find((l) => !l.isSubtotal && l.label.trim() === lineLabel.trim()) ?? null;
}

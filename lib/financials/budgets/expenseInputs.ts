// The Expenses step of budget season — the figures people KEY, and how they
// become a budget line.
//
// Every other expense line in the draft is this year's forecast grown by one
// percent. Three are not, because each has an owner who knows better than a
// percent:
//
//   • REAL ESTATE TAXES (Drew) — default: this year's taxes + 3%, posted in the
//     same months they post today. Drew overrides where a property was
//     reassessed or an appeal landed — the annual, or the bills month by month.
//   • INSURANCE (Drew) — the renewal premium, keyed as an annual figure and
//     spread the way insurance posts today (monthly, or lumped in the renewal
//     month), or keyed month by month. Until keyed it grows like any other line.
//   • BUILDING MAINTENANCE (Greg) — twelve months, keyed on his own page with
//     last year's budget and actual beside the cells.
//
// Pure: no storage, so the draft, the inputs page and the tests all run the
// same arithmetic.

import type { SectionRole } from "@/lib/financials/operating-statements/types";
import { EXPENSE_ROLES } from "@/lib/financials/operating-statements/types";

export type ExpenseInputKind = "ret" | "insurance" | "building-maintenance";

export const EXPENSE_INPUT_KINDS: ExpenseInputKind[] = ["ret", "insurance", "building-maintenance"];

export const EXPENSE_INPUT_LABEL: Record<ExpenseInputKind, string> = {
  ret: "Real estate taxes",
  insurance: "Insurance",
  "building-maintenance": "Building maintenance",
};

/** The default growth on real estate taxes before Drew overrides it. */
export const RET_DEFAULT_GROWTH_PCT = 3;

/** One keyed figure: twelve MONTHS (taken as typed) or an ANNUAL (taxes and
 *  insurance spread by this year's pattern, maintenance evenly). */
export type ExpenseInput = {
  annual?: number;
  months?: number[];
  note?: string;
  by?: string;
  at?: string;
};

/** Everything keyed for one property's budget. */
export type PropertyExpenseInputs = Partial<Record<ExpenseInputKind, ExpenseInput>>;

const EXPENSE_ROLE_SET = new Set<SectionRole>(EXPENSE_ROLES);

/**
 * Which keyed figure (if any) a statement line takes.
 *
 * EXPENSE sections only: a revenue section carries lines named "Real Estate
 * Taxes" and "Insurance" too — the tenants' RECOVERIES of those costs — and
 * keying the premium must not touch them.
 */
export function expenseInputKindOf(role: SectionRole, label: string): ExpenseInputKind | null {
  if (!EXPENSE_ROLE_SET.has(role)) return null;
  if (/real\s*estate\s*tax/i.test(label)) return "ret";
  if (/insurance/i.test(label)) return "insurance";
  if (/^\s*(building|bldg\.?)\s*maint/i.test(label)) return "building-maintenance";
  return null;
}

const r0 = (n: number) => Math.round(n);
const sum = (a: number[]) => a.reduce((s, n) => s + (n || 0), 0);

/**
 * Spread an annual figure across twelve months in the SAME PROPORTIONS as a
 * pattern — this year's postings. A premium paid in one March lump stays one
 * March lump; one billed monthly stays monthly. With no usable pattern (nothing
 * posted, or it nets to zero) it spreads evenly. Whole dollars, and the months
 * always add back to the annual exactly.
 */
export function spreadLike(annual: number, pattern: number[]): number[] {
  const p = Array.from({ length: 12 }, (_, i) => Math.max(0, pattern[i] ?? 0));
  const total = sum(p);
  const shares = total > 0 ? p.map((v) => v / total) : new Array(12).fill(1 / 12);
  // Largest remainder: floor every month, then hand the leftover dollars out
  // one at a time to the months that lost the most to rounding — so an even
  // spread stays even to the dollar instead of one month absorbing the drift.
  const target = r0(annual);
  const raw = shares.map((s) => target * s);
  const months = raw.map((v) => Math.floor(v));
  let left = target - sum(months);
  const order = raw.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; left > 0 && k < order.length; k++, left--) months[order[k].i] += 1;
  return months;
}

/** The ways a total can be laid across the year on the Budget Inputs table. */
export type SpreadShape = "like-basis" | "even" | "quarterly" | "semiannual" | `month-${number}`;

/** The twelve-month pattern for a shape — fed to `spreadLike`, so every shape
 *  adds back to the total to the dollar. */
export function spreadPattern(shape: SpreadShape, basis: number[]): number[] {
  const at = (ms: number[]) => Array.from({ length: 12 }, (_, i) => (ms.includes(i) ? 1 : 0));
  if (shape === "like-basis") return basis;
  if (shape === "quarterly") return at([0, 3, 6, 9]);
  if (shape === "semiannual") return at([0, 6]);
  const m = /^month-(\d+)$/.exec(shape);
  if (m) return at([Math.min(11, Math.max(0, Number(m[1])))]);
  return new Array(12).fill(1);
}

export function grow(months: number[], pct: number): number[] {
  const f = 1 + (pct || 0) / 100;
  return Array.from({ length: 12 }, (_, i) => r0((months[i] || 0) * f));
}

/** The figure a kind defaults to before anyone keys it. */
export function defaultMonths(kind: ExpenseInputKind, basis: number[], growthPct: number): number[] {
  return grow(basis, kind === "ret" ? RET_DEFAULT_GROWTH_PCT : growthPct);
}

export type ResolvedExpense = { months: number[]; entered: boolean };

/**
 * The months one KIND lands on, for a property: the keyed figure if there is
 * one, otherwise the default. `basis` is this year's forecast for the kind
 * (every matching line summed).
 */
export function resolveKind(kind: ExpenseInputKind, basis: number[], growthPct: number, input?: ExpenseInput | null): ResolvedExpense {
  if (input) {
    // Twelve typed months are taken as typed, whatever the kind — a tax bill
    // keyed as May and November lands in May and November.
    if (input.months?.length === 12) {
      return { months: input.months.map((v) => r0(v || 0)), entered: true };
    }
    if (input.annual != null && Number.isFinite(input.annual)) {
      return { months: spreadLike(input.annual, kind === "building-maintenance" ? new Array(12).fill(1) : basis), entered: true };
    }
  }
  return { months: defaultMonths(kind, basis, growthPct), entered: false };
}

/**
 * Split one kind's months across the lines that carry it, in proportion to
 * each line's share of this year's total. Almost always a single line; a
 * property with two ("Insurance" in two sections) keeps its split, and the
 * lines still sum to the keyed figure. Evenly when nothing posted anywhere.
 */
export function splitAcrossLines(kindMonths: number[], lineBases: number[][]): number[][] {
  if (lineBases.length <= 1) return [kindMonths.slice()];
  const totals = lineBases.map((b) => Math.max(0, sum(b)));
  const all = sum(totals);
  const shares = all > 0 ? totals.map((t) => t / all) : totals.map(() => 1 / lineBases.length);
  const out = lineBases.map(() => new Array(12).fill(0));
  for (let m = 0; m < 12; m++) {
    let used = 0;
    for (let k = 0; k < lineBases.length; k++) {
      const v = k === lineBases.length - 1 ? (kindMonths[m] || 0) - used : r0((kindMonths[m] || 0) * shares[k]);
      out[k][m] = v;
      used += v;
    }
  }
  return out;
}

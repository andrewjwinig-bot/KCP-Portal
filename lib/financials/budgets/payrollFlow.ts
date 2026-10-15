// THE PAYROLL BUDGET FLOWS INTO EVERY PROPERTY'S BUDGET (owner: "2010 budget
// need work since theres no salary allocation but we do allocate Drew Alison
// and Randy … that needs to accurately flow through"; "worth doing a check that
// all payroll allocations flow correctly to their respective properties").
//
// The 2010 LIK Payroll Budget already works every employee's gross down to the
// building (`allocatePayroll`). This turns that into what each property's draft
// carries, by GL account:
//   - a fund building (SC / NI LLC / JV III): its office share → Salaries &
//     Wages 6010-8501, its marketing share → 6010-8501 too, its maintenance
//     share → Maintenance Salaries 6030-8502 — the accounts the workbook's
//     payroll blocks always used;
//   - LIK Management (2010): everything allocated to LIK Operating + Other →
//     8000-9900 "Payroll & Benefits", the account the 2026 LIK budget carries
//     it on (inside the statement's LIK Management Clearing line);
//   - Interstate (0800), Office Works (4900), Butler & Main (9000): office /
//     maintenance → 6010-8501 / 6030-8502;
//   - Eastwick: no property code, so nowhere to land — reported, not dropped.
//
// Pure: the draft and the payroll page's flow check both read it.

import type { PayrollAllocation } from "./payrollBudget";
import type { PoolBlock, PoolEntries } from "./payrollPools";

export type PayrollTarget = {
  /** Property code, or null where the entity has none (Eastwick). */
  code: string | null;
  name: string;
  gl: string;
  /** The block the dollars belong to — "Salaries & Wages", "Maintenance Salaries"… */
  label: string;
  annual: number;
};

export const LIK_PAYROLL_GL = "8000-9900";
const OFFICE_GL = "6010-8501";
const MAINT_GL = "6030-8502";

const MISC_KEYS: Record<string, ("likOperating" | "likOther" | "interstate" | "middletown" | "owDirect" | "owIndirect" | "eastwick" | "butlerMain")[]> = {
  "2010": ["likOperating", "likOther"],
  "0800": ["interstate", "middletown"],
  "4900": ["owDirect", "owIndirect"],
  "9000": ["butlerMain"],
  eastwick: ["eastwick"],
};

/** Every dollar of the payroll budget, by the property and GL account it lands on. */
export function payrollTargets(a: PayrollAllocation): PayrollTarget[] {
  const out: PayrollTarget[] = [];
  for (const f of a.funds) {
    for (const r of f.rows) {
      if (r.office) out.push({ code: r.code, name: f.label, gl: OFFICE_GL, label: "Salaries & Wages", annual: r.office });
      if (r.marketing) out.push({ code: r.code, name: f.label, gl: OFFICE_GL, label: "Marketing Salaries", annual: r.marketing });
      if (r.maintenance) out.push({ code: r.code, name: f.label, gl: MAINT_GL, label: "Maintenance Salaries", annual: r.maintenance });
    }
  }
  for (const m of a.misc) {
    const keys = MISC_KEYS[m.key] ?? [];
    const office = keys.reduce((s, k) => s + (a.byEntity[k]?.office || 0), 0);
    const maint = keys.reduce((s, k) => s + (a.byEntity[k]?.maintenance || 0), 0);
    if (m.code === "2010") {
      // LIK carries its payroll as one Payroll & Benefits figure.
      if (office + maint) out.push({ code: "2010", name: m.label, gl: LIK_PAYROLL_GL, label: "Payroll & Benefits", annual: office + maint });
      continue;
    }
    if (office) out.push({ code: m.code, name: m.label, gl: OFFICE_GL, label: "Salaries & Wages", annual: office });
    if (maint) out.push({ code: m.code, name: m.label, gl: MAINT_GL, label: "Maintenance Salaries", annual: maint });
  }
  return out;
}

/** The targets as pool blocks the draft already knows how to lay onto a
 *  property's lines (`applyPools`): one block per GL + label, each property's
 *  share its dollars over the block's total, and the total "entered". */
export function payrollBudgetBlocks(targets: PayrollTarget[], year: number): { blocks: PoolBlock[]; entries: PoolEntries } {
  const by = new Map<string, { gl: string; label: string; rows: Map<string, number> }>();
  for (const t of targets) {
    if (!t.code) continue;
    const key = `pb:${t.gl}|${t.label}`;
    const b = by.get(key) ?? { gl: t.gl, label: t.label, rows: new Map<string, number>() };
    b.rows.set(t.code.toUpperCase(), (b.rows.get(t.code.toUpperCase()) ?? 0) + t.annual);
    by.set(key, b);
  }
  const blocks: PoolBlock[] = [];
  const entries: PoolEntries = {};
  for (const [key, b] of by) {
    const total = [...b.rows.values()].reduce((s, v) => s + v, 0);
    if (!(total > 0)) continue;
    const shares: Record<string, number> = {};
    for (const [code, v] of b.rows) shares[code] = (v / total) * 100;
    blocks.push({ key, label: b.label, gl: b.gl, priorTotal: Math.round(total), shares, note: `From the ${year} Payroll Budget` });
    entries[key] = { annual: total };
  }
  return { blocks: blocks.sort((x, y) => x.gl.localeCompare(y.gl) || x.label.localeCompare(y.label)), entries };
}

// ─── The check: does every allocation land on a budget line? ───────────────
type MappingLike = { sections: { role: string; lines: { label: string; mask: string }[] }[] } | null;

export type PayrollFlowRow = PayrollTarget & {
  /** The budget line the dollars land on — null when they land nowhere. */
  line: string | null;
  /** Why they land nowhere: no property code, no budget, or no line takes the account. */
  problem?: "no-code" | "not-budgeted" | "no-line";
};

/**
 * Every allocation, beside the line of its property's budget it lands on — the
 * SAME rule the draft applies (`applyPools`: the first operating expense line
 * whose mask takes the account). A row that lands nowhere says why, so money
 * never leaves the payroll budget without reaching a property.
 */
export function payrollFlowCheck(
  targets: PayrollTarget[],
  mappingOf: (code: string) => MappingLike,
  isBudgeted: (code: string) => boolean,
  matches: (mask: string, account: string) => boolean,
  expenseRoles: Set<string>,
): PayrollFlowRow[] {
  return targets.map((t) => {
    if (!t.code) return { ...t, line: null, problem: "no-code" as const };
    if (!isBudgeted(t.code)) return { ...t, line: null, problem: "not-budgeted" as const };
    const m = mappingOf(t.code);
    for (const sec of m?.sections ?? []) {
      if (!expenseRoles.has(sec.role)) continue;
      const l = sec.lines.find((x) => x.mask && matches(x.mask, t.gl));
      if (l) return { ...t, line: l.label };
    }
    return { ...t, line: null, problem: "no-line" as const };
  });
}

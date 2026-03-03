import { AllocationEmployee, AllocationTable, PayrollParseResult, PropertyInvoice } from "../types";

function sum(obj: Record<string, number>): number {
  return Object.values(obj).reduce((a, b) => a + (b || 0), 0);
}
function normSplits(splits: Record<string, number>): Record<string, number> {
  const t = sum(splits);
  if (!t) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(splits)) out[k] = v / t;
  return out;
}

const GROUPS = ["JV III", "NI LLC", "SC"] as const;

export function buildInvoices(payroll: PayrollParseResult, alloc: AllocationTable): PropertyInvoice[] {
  // Map employee id/name to allocation row
  const empAllocById = new Map<string, AllocationEmployee>();
  const empAllocByName = new Map<string, AllocationEmployee>();
  for (const e of alloc.employees) {
    const allocId = String(e.employeeId ?? e.id ?? "").trim();
    if (allocId) empAllocById.set(allocId, e);
    empAllocByName.set(String(e.name).toLowerCase().trim(), e);
  }

  // Accumulate per property
  type Acc = { salaryREC: number; salaryNR: number; overtime: number; holREC: number; holNR: number; er401k: number; };
  const byProp: Record<string, Acc> = {};

  function add(prop: string, field: keyof Acc, amount: number) {
    if (!amount) return;
    if (!byProp[prop]) byProp[prop] = { salaryREC: 0, salaryNR: 0, overtime: 0, holREC: 0, holNR: 0, er401k: 0 };
    byProp[prop][field] += amount;
  }

  for (const emp of payroll.employees) {
    const empId = String(emp.employeeId ?? "").trim();
    const a =
      (empId ? empAllocById.get(empId) : undefined) ??
      empAllocByName.get(String(emp.name).toLowerCase().trim()) ??
      // Partial name match fallback (handles "Last, First" vs "First Last" differences)
      alloc.employees.find((ae) => {
        const pn = String(emp.name ?? "").toLowerCase();
        const an = String(ae.name ?? "").toLowerCase();
        return pn && an && (pn.includes(an) || an.includes(pn));
      });
    if (!a) continue;

    // Base top allocations include direct properties + groups + marketing
    const top = a.top || {};

    // 1) direct property allocations (keys that match propertyMeta labels)
    for (const [key, pct] of Object.entries(top)) {
      // Ignore groups and marketing here; handle below
      if (GROUPS.includes(key as any) || key.toLowerCase().includes("marketing")) continue;
      const propLabel = key;
      const salaryField = a.recoverable ? "salaryREC" : "salaryNR";
      add(propLabel, salaryField, emp.salaryAmt * pct);
      add(propLabel, "overtime", emp.overtimeAmt * pct);
      const holField = a.recoverable ? "holREC" : "holNR";
      add(propLabel, holField, emp.holAmt * pct);
      add(propLabel, "er401k", emp.er401kAmt * pct);
    }

    // 2) group allocations -> flow through PRS tables depending on recoverability
    for (const group of GROUPS) {
      const pct = top[group] || 0;
      if (!pct) continue;
      const prs = a.recoverable ? alloc.prs.salaryREC : alloc.prs.salaryNR;
      const splits = normSplits(prs[group] || {});
      for (const [prop, sp] of Object.entries(splits)) {
        const salaryField = a.recoverable ? "salaryREC" : "salaryNR";
        const holField = a.recoverable ? "holREC" : "holNR";
        add(prop, salaryField, emp.salaryAmt * pct * sp);
        add(prop, "overtime", emp.overtimeAmt * pct * sp);
        add(prop, holField, emp.holAmt * pct * sp);
        add(prop, "er401k", emp.er401kAmt * pct * sp);
      }
    }

    // 3) marketing special: marketing -> groups (per-employee marketingToGroups), then to properties using Salary NR PRS
    const mktPct = Object.entries(top).find(([k]) => k.toLowerCase().includes("marketing"))?.[1] || 0;
    if (mktPct) {
      const m2g = normSplits(a.marketingToGroups || {});
      for (const [group, gp] of Object.entries(m2g)) {
        const prsNR = alloc.prs.salaryNR;
        const splits = normSplits(prsNR[group] || {});
        for (const [prop, sp] of Object.entries(splits)) {
          // marketing always uses Salary NR PRS and allocates salary as NR
          add(prop, "salaryNR", emp.salaryAmt * mktPct * gp * sp);
          add(prop, "overtime", emp.overtimeAmt * mktPct * gp * sp);
          add(prop, "holNR", emp.holAmt * mktPct * gp * sp);
          add(prop, "er401k", emp.er401kAmt * mktPct * gp * sp);
        }
      }
    }
  }

  const invoices: PropertyInvoice[] = [];
  for (const [propLabel, acc] of Object.entries(byProp)) {
    const meta = alloc.propertyMeta[propLabel] || { label: propLabel, code: undefined };
    const lines: PropertyInvoice["lines"] = [];
    const pushLine = (description: string, accCode: string, amount: number) => {
      if (!amount || Math.abs(amount) < 0.005) return;
      lines.push({ description, accCode, amount: Math.round(amount * 100) / 100 });
    };

    pushLine("Salary REC", "6030-8502", acc.salaryREC);
    pushLine("Salary NR", "6010-8501", acc.salaryNR);
    pushLine("Overtime", "6030-8502", acc.overtime);
    pushLine("HOL REC", "6010-8501", acc.holREC);
    pushLine("HOL NR", "6030-8502", acc.holNR);
    pushLine("401K ER", "6010-8501", acc.er401k);

    const total = lines.reduce((s, l) => s + l.amount, 0);

    invoices.push({
      propertyKey: meta.code || meta.label,
      propertyLabel: meta.label,
      propertyCode: meta.code,
      payDate: payroll.payDate,
      lines,
      salaryREC: acc.salaryREC,
      salaryNR: acc.salaryNR,
      overtime: acc.overtime,
      holREC: acc.holREC,
      holNR: acc.holNR,
      er401k: acc.er401k,
      total,
    });
  }

  // stable order
  invoices.sort((a, b) => (a.propertyCode || a.propertyLabel).localeCompare(b.propertyCode || b.propertyLabel));
  return invoices;
}

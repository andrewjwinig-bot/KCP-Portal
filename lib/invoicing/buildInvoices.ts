import { AllocationEmployee, AllocationTable, PayrollParseResult, PropertyInvoice } from "../types";

/** Normalize ADP "LAST, FIRST" → "first last" for name matching. */
function normalizePayrollName(name: string): string {
  const m = name.match(/^([^,]+),\s*(.+)$/);
  return m ? `${m[2].trim()} ${m[1].trim()}`.toLowerCase() : name.toLowerCase();
}

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
  type Acc = {
    salaryREC: number; salaryNR: number; overtime: number;
    holREC: number; holNR: number; er401k: number;
    other: number; taxesEr: number;
  };
  const byProp: Record<string, Acc> = {};

  // Drilldown: prop -> field -> per-employee rows (with optional category for sub-type detail)
  type DrillRow = { employee: string; baseAmount: number; allocPct: number; amount: number; category?: string };
  const byPropDrill: Record<string, Record<string, DrillRow[]>> = {};

  function add(prop: string, field: keyof Acc, amount: number) {
    if (!amount) return;
    if (!byProp[prop]) byProp[prop] = { salaryREC: 0, salaryNR: 0, overtime: 0, holREC: 0, holNR: 0, er401k: 0, other: 0, taxesEr: 0 };
    byProp[prop][field] += amount;
  }

  function addDrill(prop: string, field: string, employee: string, baseAmount: number, allocPct: number, amount: number, category?: string) {
    const rounded = Math.round(amount * 100) / 100;
    if (!rounded || Math.abs(rounded) < 0.005) return;
    if (!byPropDrill[prop]) byPropDrill[prop] = {};
    if (!byPropDrill[prop][field]) byPropDrill[prop][field] = [];
    byPropDrill[prop][field].push({ employee, baseAmount, allocPct, amount: rounded, category });
  }

  for (const emp of payroll.employees) {
    const empId = String(emp.employeeId ?? "").trim();
    const a =
      (empId ? empAllocById.get(empId) : undefined) ??
      empAllocByName.get(String(emp.name).toLowerCase().trim()) ??
      // Partial name match fallback — normalizes "LAST, FIRST" → "first last" before comparing
      alloc.employees.find((ae) => {
        const pn = normalizePayrollName(String(emp.name ?? ""));
        const an = String(ae.name ?? "").toLowerCase();
        return pn && an && (pn.includes(an) || an.includes(pn));
      });
    if (!a) continue;

    const top = a.top || {};
    const salaryField = a.recoverable ? "salaryREC" : "salaryNR";
    const holField = a.recoverable ? "holREC" : "holNR";

    // Helper: allocate all pay fields for a given property key and effective percentage
    function allocateToProperty(key: string, pct: number) {
      add(key, salaryField, emp.salaryAmt * pct);
      addDrill(key, salaryField, emp.name, emp.salaryAmt, pct, emp.salaryAmt * pct);
      add(key, "overtime", emp.overtimeAmt * pct);
      addDrill(key, "overtime", emp.name, emp.overtimeAmt, pct, emp.overtimeAmt * pct);
      add(key, holField, emp.holAmt * pct);
      addDrill(key, holField, emp.name, emp.holAmt, pct, emp.holAmt * pct);
      add(key, "er401k", emp.er401kAmt * pct);
      addDrill(key, "er401k", emp.name, emp.er401kAmt, pct, emp.er401kAmt * pct);
      // Other (Bonus + Auto Allowance): one drilldown row per category
      if (emp.otherAmt) {
        add(key, "other", emp.otherAmt * pct);
        for (const ob of (emp.otherBreakdown ?? [])) {
          if (ob.amount) addDrill(key, "other", emp.name, ob.amount, pct, ob.amount * pct, ob.label);
        }
        if (!emp.otherBreakdown?.length) {
          addDrill(key, "other", emp.name, emp.otherAmt, pct, emp.otherAmt * pct);
        }
      }
      // Taxes (ER): one drilldown row per tax type
      if (emp.taxesErAmt) {
        add(key, "taxesEr", emp.taxesErAmt * pct);
        for (const tb of (emp.taxesErBreakdown ?? [])) {
          if (tb.amount) addDrill(key, "taxesEr", emp.name, tb.amount, pct, tb.amount * pct, tb.label);
        }
        if (!emp.taxesErBreakdown?.length) {
          addDrill(key, "taxesEr", emp.name, emp.taxesErAmt, pct, emp.taxesErAmt * pct);
        }
      }
    }

    // 1) direct property allocations
    for (const [key, pct] of Object.entries(top)) {
      if (GROUPS.includes(key as any) || key.toLowerCase().includes("marketing")) continue;
      allocateToProperty(key, pct);
    }

    // 2) group allocations -> flow through PRS tables depending on recoverability
    for (const group of GROUPS) {
      const pct = top[group] || 0;
      if (!pct) continue;
      const prs = a.recoverable ? alloc.prs.salaryREC : alloc.prs.salaryNR;
      const splits = normSplits(prs[group] || {});
      for (const [prop, sp] of Object.entries(splits)) {
        allocateToProperty(prop, pct * sp);
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
          const effectivePct = mktPct * gp * sp;
          add(prop, "salaryNR", emp.salaryAmt * effectivePct);
          addDrill(prop, "salaryNR", emp.name, emp.salaryAmt, effectivePct, emp.salaryAmt * effectivePct);
          add(prop, "overtime", emp.overtimeAmt * effectivePct);
          addDrill(prop, "overtime", emp.name, emp.overtimeAmt, effectivePct, emp.overtimeAmt * effectivePct);
          add(prop, "holNR", emp.holAmt * effectivePct);
          addDrill(prop, "holNR", emp.name, emp.holAmt, effectivePct, emp.holAmt * effectivePct);
          add(prop, "er401k", emp.er401kAmt * effectivePct);
          addDrill(prop, "er401k", emp.name, emp.er401kAmt, effectivePct, emp.er401kAmt * effectivePct);
          if (emp.otherAmt) {
            add(prop, "other", emp.otherAmt * effectivePct);
            for (const ob of (emp.otherBreakdown ?? [])) {
              if (ob.amount) addDrill(prop, "other", emp.name, ob.amount, effectivePct, ob.amount * effectivePct, ob.label);
            }
          }
          if (emp.taxesErAmt) {
            add(prop, "taxesEr", emp.taxesErAmt * effectivePct);
            for (const tb of (emp.taxesErBreakdown ?? [])) {
              if (tb.amount) addDrill(prop, "taxesEr", emp.name, tb.amount, effectivePct, tb.amount * effectivePct, tb.label);
            }
          }
        }
      }
    }
  }

  // Build a money-format helper for footnotes
  const moneyFmt = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD" });

  // For each property, collect Commission exclusion footnotes (UI only — not shown in PDFs)
  const footnotesByProp: Record<string, string[]> = {};
  for (const emp of payroll.employees) {
    if (!emp.exclusions?.length) continue;
    for (const [prop, fieldDrills] of Object.entries(byPropDrill)) {
      const empNames = new Set(Object.values(fieldDrills).flatMap((rows) => rows.map((r) => r.employee)));
      if (!empNames.has(emp.name)) continue;
      if (!footnotesByProp[prop]) footnotesByProp[prop] = [];
      for (const exc of emp.exclusions) {
        const note = `Salary does not include ${moneyFmt(exc.amount)} in ${exc.label} paid to ${emp.name} during this period.`;
        if (!footnotesByProp[prop].includes(note)) footnotesByProp[prop].push(note);
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
    pushLine("Other Pay", "6010-8501", acc.other);
    pushLine("Taxes (ER)", "6030-8502", acc.taxesEr);

    const total = lines.reduce((s, l) => s + l.amount, 0);

    // Build "total" drilldown by summing each employee's contributions across all fields
    const drill: Record<string, DrillRow[]> = byPropDrill[propLabel] || {};
    const empTotals = new Map<string, number>();
    for (const rows of Object.values(drill)) {
      for (const row of rows) {
        empTotals.set(row.employee, (empTotals.get(row.employee) ?? 0) + row.amount);
      }
    }
    if (empTotals.size > 0) {
      drill["total"] = Array.from(empTotals.entries()).map(([employee, amount]) => ({
        employee, baseAmount: 0, allocPct: 0, amount,
      }));
    }

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
      other: acc.other,
      taxesEr: acc.taxesEr,
      total,
      drilldown: drill,
      footnotes: footnotesByProp[propLabel]?.length ? footnotesByProp[propLabel] : undefined,
    });
  }

  // stable order
  invoices.sort((a, b) => (a.propertyCode || a.propertyLabel).localeCompare(b.propertyCode || b.propertyLabel));
  return invoices;
}

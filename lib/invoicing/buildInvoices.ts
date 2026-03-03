import { AllocationTable, PayrollParseResult, PropertyInvoice, Contribution, InvoiceLineKey } from "../types";

function cleanPayrollName(raw: string) {
  return (raw || "")
    .replace(/\s*Default\s*-\s*#\d+\s*$/i, "")
    .replace(/[,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function norm(s: string) {
  return cleanPayrollName(s).toLowerCase();
}

/**
 * Canonical "last|first" key using letters only.
 * Examples:
 *  - "ANDREW WINIG  Default - #10" -> "winig|andrew"
 *  - "Charles Loiseau Default - #33" -> "loiseau|charles"
 */
function keyFromName(raw: string): string {
  const cleaned = cleanPayrollName(raw);
  const parts = cleaned.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  if (parts.length < 2) return "";
  const first = parts[0];
  const last = parts[parts.length - 1];
  return `${last}|${first}`;
}

function normalizeKey(k: string) {
  const parts = (k || "").toLowerCase().split(/[^a-z]+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]}|${parts[1]}`;
  return (k || "").toLowerCase().trim();
}

function pickPct(raw: number): number {
  if (!isFinite(raw) || raw <= 0) return 0;
  return raw > 1.5 ? raw / 100 : raw;
}

export function buildInvoices(payroll: PayrollParseResult, allocation: AllocationTable): PropertyInvoice[] {
  const invByKey = new Map<string, PropertyInvoice>();
  for (const p of allocation.properties ?? []) {
    invByKey.set(p.key, {
      propertyKey: p.key,
      propertyLabel: p.label,
      propertyName: p.name,
      salaryREC: 0,
      salaryNR: 0,
      overtime: 0,
      holREC: 0,
      holNR: 0,
      er401k: 0,
      total: 0,
      breakdown: {},
    });
  }

  const byEmployeeKey = new Map<string, { recoverable: boolean; allocations: Record<string, number>; name: string }>();
  const byNormName = new Map<string, { recoverable: boolean; allocations: Record<string, number>; name: string }>();

  for (const ae of allocation.employees ?? []) {
    const entry = { recoverable: !!ae.recoverable, allocations: ae.allocations ?? {}, name: ae.name };
    if (ae.employeeKey) byEmployeeKey.set(normalizeKey(ae.employeeKey), entry);
    byNormName.set(norm(ae.name), entry);
  }

  function findAlloc(empName: string) {
    // 1) employeeKey match (preferred)
    const k = normalizeKey(keyFromName(empName));
    const byKey = byEmployeeKey.get(k);
    if (byKey) return byKey;

    // 2) exact normalized name match
    const byName = byNormName.get(norm(empName));
    if (byName) return byName;

    // 3) keyword fallback if unique
    const cleaned = norm(empName);
    const toks = cleaned.split(" ").filter(Boolean);
    const first = toks[0];
    const last = toks[toks.length - 1];
    const candidates = (allocation.employees ?? []).filter((x) => {
      const n = norm(x.name);
      return (first && n.includes(first)) || (last && n.includes(last));
    });
    if (candidates.length === 1) {
      const ae = candidates[0] as any;
      return { recoverable: !!ae.recoverable, allocations: ae.allocations ?? {}, name: ae.name };
    }

    return null;
  }

  function add(propKey: string, line: InvoiceLineKey, amount: number, employee: string, allocPct?: number, baseAmount?: number) {
    if (!amount || Math.abs(amount) < 0.00001) return;
    const inv = invByKey.get(propKey);
    if (!inv) return;

    (inv as any)[line] = ((inv as any)[line] ?? 0) + amount;

    if (!inv.breakdown) inv.breakdown = {};
    if (!inv.breakdown[line]) inv.breakdown[line] = [];
    (inv.breakdown[line] as Contribution[]).push({ employee, amount, allocPct, baseAmount });

    if (line !== "total") inv.total += amount;
  }

  for (const emp of payroll.employees ?? []) {
    const alloc = findAlloc(emp.name);
    if (!alloc) continue;

    const isRec = !!alloc.recoverable;

    for (const [propKey, raw] of Object.entries(alloc.allocations ?? {})) {
      const pct = pickPct(raw as any);
      if (!pct) continue;

      const baseSalary = emp.salaryAmt ?? 0;
      const baseOT = emp.overtimeAmt ?? 0;
      const baseHol = emp.holAmt ?? 0;
      const baseEr = emp.er401k ?? 0;

      const salaryLine: InvoiceLineKey = isRec ? "salaryREC" : "salaryNR";
      const holLine: InvoiceLineKey = isRec ? "holREC" : "holNR";

      add(propKey, salaryLine, baseSalary * pct, emp.name, pct, baseSalary);
      add(propKey, "overtime", baseOT * pct, emp.name, pct, baseOT);
      add(propKey, holLine, baseHol * pct, emp.name, pct, baseHol);
      add(propKey, "er401k", baseEr * pct, emp.name, pct, baseEr);

      const totalAllocated = (baseSalary + baseOT + baseHol + baseEr) * pct;
      add(propKey, "total", totalAllocated, emp.name, pct, baseSalary + baseOT + baseHol + baseEr);
    }
  }

  const out = [...invByKey.values()];
  out.sort((a, b) => (a.propertyKey || "").localeCompare(b.propertyKey || ""));
  return out;
}

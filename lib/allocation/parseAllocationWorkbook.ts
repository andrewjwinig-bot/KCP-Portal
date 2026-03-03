import * as XLSX from "xlsx";
import { AllocationEmployee, AllocationProperty, AllocationTable } from "../types";
import { toNumber } from "../utils";

function norm(s: unknown): string {
  return String(s ?? "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function lower(s: unknown): string {
  return norm(s).toLowerCase();
}

function isPropHeader(v: unknown): boolean {
  const s = norm(v);
  if (!s) return false;
  // Common property codes: 4-digit numeric or alpha-numeric like 40A0 / 40B0 / 40C0
  return /^\d{4}$/.test(s) || /^[0-9]{2}[A-Z][0-9]$/.test(s) || /^[0-9]{2}[A-Z]{2}$/.test(s) || /^[0-9A-Z]{4}$/.test(s);
}

function getSheet(wb: XLSX.WorkBook): XLSX.WorkSheet {
  const name = wb.SheetNames[0];
  const sheet = wb.Sheets[name];
  if (!sheet) throw new Error("No sheets found in allocation workbook");
  return sheet;
}

/**
 * Allocation workbook formats supported:
 * 1) Legacy: EmployeeName | EmployeeKey | Recoverable | [prop columns...]
 * 2) New: EmployeeID | EmployeeName | EmployeeKey | Recoverable | [prop columns...]
 *
 * This parser locates the header row by searching for cells containing
 * "EmployeeName" and "EmployeeKey" (case-insensitive) anywhere in the row.
 */
export function parseAllocationWorkbook(buf: Buffer): AllocationTable {
  const wb = XLSX.read(buf, { type: "buffer", cellNF: true, cellText: false });
  const sheet = getSheet(wb);

  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }) as any[][];
  if (!rows.length) throw new Error("Allocation workbook is empty");

  // Find header row and the key columns by scanning early rows.
  let headerRowIdx = -1;
  let colEmployeeId = -1;
  let colEmployeeName = -1;
  let colEmployeeKey = -1;
  let colRecoverable = -1;

  for (let r = 0; r < Math.min(rows.length, 120); r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c++) {
      const cell = lower(row[c]);
      if (cell === "employeeid" || cell === "employee id" || cell === "id") colEmployeeId = c;
      if (cell === "employeename" || cell === "employee name") colEmployeeName = c;
      if (cell === "employeekey" || cell === "employee key" || cell === "key") colEmployeeKey = c;
      if (cell === "recoverable" || cell === "rec") colRecoverable = c;
    }
    if (colEmployeeName >= 0 && colEmployeeKey >= 0) {
      headerRowIdx = r;
      break;
    }
    // reset per-row discovery
    colEmployeeId = colEmployeeName = colEmployeeKey = colRecoverable = -1;
  }

  if (headerRowIdx < 0) {
    throw new Error("Could not locate allocation header row");
  }

  const header = rows[headerRowIdx] || [];

  // Property columns start at first header cell that looks like a property code,
  // scanning left-to-right.
  const propCols: { col: number; key: string; label: string }[] = [];
  for (let c = 0; c < header.length; c++) {
    if (c === colEmployeeId || c === colEmployeeName || c === colEmployeeKey || c === colRecoverable) continue;
    if (isPropHeader(header[c])) {
      const key = norm(header[c]);
      propCols.push({ col: c, key, label: key });
    }
  }

  if (!propCols.length) {
    throw new Error("Could not locate property columns in allocation header row");
  }

  // Parse property names table (Property Code / Property Name) anywhere below.
  const propertyNames: Record<string, string> = {};
  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const idxCode = row.findIndex((v) => lower(v) === "property code");
    const idxName = row.findIndex((v) => lower(v) === "property name");
    if (idxCode >= 0 && idxName >= 0) {
      // Read until blank code
      for (let rr = r + 1; rr < rows.length; rr++) {
        const code = norm((rows[rr] || [])[idxCode]);
        const name = norm((rows[rr] || [])[idxName]);
        if (!code) break;
        if (name) propertyNames[code] = name;
      }
      break;
    }
  }

  const employees: AllocationEmployee[] = [];
  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const rawName = norm(row[colEmployeeName]);
    const rawKey = norm(row[colEmployeeKey]);
    const rawId = colEmployeeId >= 0 ? norm(row[colEmployeeId]) : "";
    // Stop if we hit the property names table.
    if (lower(rawName) === "property code" || lower(rawKey) === "property code") break;
    if (!rawName && !rawKey && !rawId) continue;

    const recoverableStr = colRecoverable >= 0 ? lower(row[colRecoverable]) : "";
    const recoverable = recoverableStr === "rec" || recoverableStr === "y" || recoverableStr === "yes" || recoverableStr === "true" || recoverableStr === "1";

    const allocations: Record<string, number> = {};
    for (const p of propCols) {
      const v = row[p.col];
      if (v === "" || v === "-" || v == null) continue;
      const num = toNumber(v);
      if (!Number.isFinite(num) || num === 0) continue;
      // Allow percent values 0-100 or fractions 0-1
      const frac = num > 1 ? num / 100 : num;
      allocations[p.key] = frac;
    }

    employees.push({
      employeeId: rawId ? rawId : null,
      name: rawName || rawKey || rawId,
      employeeKey: rawKey ? rawKey : null,
      recoverable,
      allocations,
    });
  }

  const properties: AllocationProperty[] = propCols.map((p) => ({
    key: p.key,
    label: p.label,
    name: propertyNames[p.key] ?? null,
  }));

  return { employees, properties, propertyNames };
}

import * as XLSX from "xlsx";
import { AllocationEmployee, AllocationTable } from "../types";
import { toNumber } from "../utils";

/**
 * Parses the allocation workbook used by the Payroll Invoicer.
 *
 * Expected layout (based on your 2026 workbook screenshot):
 * - Header row contains: EmployeeID (optional), EmployeeName, EmployeeKey (optional), Recoverable,
 *   followed by one column per Property Code (e.g. 2010, 3610, ...).
 * - Values are percentages (either 0..1 or 0..100).
 * - A second table lower on the sheet maps Property Code -> Property Name.
 */
export function parseAllocationWorkbook(buf: ArrayBuffer | Buffer): AllocationTable {
  const wb = XLSX.read(buf, {
    type: buf instanceof ArrayBuffer ? "array" : "buffer",
    cellText: false,
    cellDates: false,
    raw: false,
  });

  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });

  const norm = (v: any) => String(v ?? "").trim();
  const normLower = (v: any) => norm(v).toLowerCase();

  // -------------------------
  // 1) Locate allocation header row
  // -------------------------
  let headerRowIdx = -1;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] || [];
    const hasEmployeeName = row.some((c) => normLower(c) === "employeename");
    const hasRecoverable = row.some((c) => normLower(c) === "recoverable");
    if (hasEmployeeName && hasRecoverable) {
      headerRowIdx = r;
      break;
    }
  }
  if (headerRowIdx < 0) throw new Error("Could not locate allocation header row");

  const header = (rows[headerRowIdx] || []).map(norm);
  const colIndex = (name: string) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase());

  const employeeNameCol = colIndex("EmployeeName");
  const employeeIdCol = colIndex("EmployeeID"); // optional
  const employeeKeyCol = colIndex("EmployeeKey"); // optional
  const recoverableCol = colIndex("Recoverable");

  if (employeeNameCol < 0 || recoverableCol < 0) {
    throw new Error("Could not locate EmployeeName/Recoverable columns in allocation header row");
  }

  // Any columns to the right of Recoverable that look like property keys.
  const propertyCols: Array<{ key: string; col: number }> = [];
  for (let c = recoverableCol + 1; c < header.length; c++) {
    const key = norm(header[c]);
    if (!key) continue;
    // Skip obvious non-property columns
    if (["total", ""].includes(key.toLowerCase())) continue;
    propertyCols.push({ key, col: c });
  }

  // -------------------------
  // 2) Parse employee rows
  // -------------------------
  const employees: AllocationEmployee[] = [];
  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const name = norm(row[employeeNameCol]);
    if (!name) break; // end of allocation table

    const idRaw = employeeIdCol >= 0 ? norm(row[employeeIdCol]) : "";
    const id = idRaw ? String(toNumber(idRaw) ?? idRaw).trim() : undefined;

    const employeeKey = employeeKeyCol >= 0 ? norm(row[employeeKeyCol]) : "";

    const recRaw = norm(row[recoverableCol]).toUpperCase();
    const recoverable = recRaw === "REC" || recRaw === "Y" || recRaw === "YES" || recRaw === "TRUE";

    const top: Record<string, number> = {};
    for (const pc of propertyCols) {
      const rawVal = row[pc.col];
      const s = norm(rawVal);
      if (!s || s === "-" || s === "—") continue;
      let v = toNumber(s);
      if (v == null || Number.isNaN(v)) continue;
      // normalize percent
      if (v > 1) v = v / 100;
      if (v <= 0) continue;
      top[pc.key] = v;
    }

    employees.push({
      id,
      name,
      employeeKey: employeeKey || undefined,
      recoverable,
      top,
      allocations: top, // alias
      marketingToGroups: {},
    });
  }

  // -------------------------
  // 3) Parse Property Code -> Property Name mapping table
  // -------------------------
  const propertyMeta: Record<string, { code?: string; label: string }> = {};
  let mapHeaderIdx = -1;
  let codeCol = -1;
  let nameCol = -1;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] || [];
    const idxCode = row.findIndex((c) => normLower(c) === "property code");
    const idxName = row.findIndex((c) => normLower(c) === "property name");
    if (idxCode >= 0 && idxName >= 0) {
      mapHeaderIdx = r;
      codeCol = idxCode;
      nameCol = idxName;
      break;
    }
  }

  if (mapHeaderIdx >= 0) {
    for (let r = mapHeaderIdx + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      const code = norm(row[codeCol]);
      const label = norm(row[nameCol]);
      if (!code) break;
      if (!label) continue;
      propertyMeta[code] = { code, label };
    }
  }

  // Ensure we at least have meta entries for any allocation keys.
  for (const e of employees) {
    for (const key of Object.keys(e.top)) {
      if (!propertyMeta[key]) propertyMeta[key] = { code: key, label: key };
    }
  }

  return {
    employees,
    prs: { salaryREC: {}, salaryNR: {} },
    propertyMeta,
  };
}

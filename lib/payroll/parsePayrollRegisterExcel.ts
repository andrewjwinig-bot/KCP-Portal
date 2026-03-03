import * as XLSX from "xlsx";
import { PayrollEmployee, PayrollParseResult } from "../types";
import { toNumber } from "../utils";

/**
 * Payroll Register parser resilient to merged cells / shifted columns.
 * We scan each row for headers + extract numeric series from the entire row.
 */

function cellText(v: any): string {
  return String(v ?? "").trim();
}

function normalizeSpace(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

function cleanEmployeeName(raw: string) {
  return normalizeSpace(raw).replace(/\s*Default\s*-\s*#\d+\s*$/i, "").trim();
}

function findRowText(row: any[]): string[] {
  return row.map(cellText).filter((s) => s.length > 0);
}

function rowContains(row: any[], re: RegExp): boolean {
  return row.some((c) => re.test(cellText(c)));
}

function findEmployeeNameInRow(row: any[]): string | null {
  // Prefer explicit "Default - #"
  for (const c of row) {
    const t = cellText(c);
    if (/Default\s*-\s*#\d+/i.test(t) && /[A-Za-z]/.test(t)) {
      return cleanEmployeeName(t);
    }
  }

  // Fallback: 2+ word line that isn't a known header
  const texts = findRowText(row);
  for (const t of texts) {
    const low = t.toLowerCase();
    if (low.includes("payroll register") || low.includes("report totals")) continue;
    if (low.startsWith("pay type")) continue;
    if (low.startsWith("deductions")) continue;
    if (low.startsWith("taxes")) continue;
    if (low.startsWith("totals")) continue;
    const parts = t.replace(",", " ").split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return cleanEmployeeName(t);
  }

  return null;
}

function extractNumericSeries(row: any[]): number[] {
  const out: number[] = [];
  for (const c of row) {
    const n = toNumber(c);
    if (Number.isFinite(n) && Math.abs(n) > 1e-9) out.push(n);
  }
  return out;
}

// Header detectors (any column)
function isPayHeaderRow(row: any[]): boolean {
  return rowContains(row, /^pay\s*type\b/i);
}
function isDeductionsErHeaderRow(row: any[]): boolean {
  return rowContains(row, /^deductions\s*\(er\)\b/i);
}
function isDeductionsEeHeaderRow(row: any[]): boolean {
  return rowContains(row, /^deductions\s*\(ee\)\b/i);
}
function isTaxesHeaderRow(row: any[]): boolean {
  return rowContains(row, /^taxes\b/i);
}
function isTotalsRow(row: any[]): boolean {
  return rowContains(row, /^totals\b/i);
}

function isOvertimeLabelRow(row: any[]): boolean {
  return rowContains(row, /^overtime\b/i) || rowContains(row, /^ot\b/i);
}
function isHolLabelRow(row: any[]): boolean {
  return rowContains(row, /^hol\b/i) || rowContains(row, /holiday/i);
}
function is401kRow(row: any[]): boolean {
  const has401 = rowContains(row, /401/i);
  const hasLoan = rowContains(row, /loan/i);
  const hasEe = rowContains(row, /\bee\b/i) || rowContains(row, /\(ee\)/i) || rowContains(row, /employee/i);
  return has401 && !hasLoan && !hasEe;
}

function findFirstDate(grid: any[][]): string | undefined {
  for (const row of grid) {
    for (const cell of row) {
      const s = String(cell ?? "");
      const m = s.match(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/);
      if (m) return m[0];
    }
  }
  return undefined;
}

export function parsePayrollRegisterExcel(buf: Buffer): PayrollParseResult {
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) as any[][];

  const payDate = findFirstDate(grid);
  const employees: PayrollEmployee[] = [];

  type Mode = "NONE" | "PAY" | "ER";
  let r = 0;

  while (r < grid.length) {
    const maybeName = findEmployeeNameInRow(grid[r] || []);
    if (!maybeName) {
      r++;
      continue;
    }

    const name = maybeName;

    let salaryAmt = 0;
    let overtimeAmt = 0;
    let overtimeHours = 0;
    let holAmt = 0;
    let holHours = 0;
    let er401k = 0;

    let mode: Mode = "NONE";
    let blankRun = 0;

    r++;
    for (; r < grid.length; r++) {
      const row = grid[r] || [];

      const nextName = findEmployeeNameInRow(row);
      if (nextName && nextName !== name) break;

      const texts = findRowText(row);
      if (texts.length === 0) {
        blankRun++;
        if (blankRun >= 10) break;
        continue;
      }
      blankRun = 0;

      if (isPayHeaderRow(row)) {
        mode = "PAY";
        continue;
      }
      if (isDeductionsErHeaderRow(row)) {
        mode = "ER";
        continue;
      }
      if (isDeductionsEeHeaderRow(row) || isTaxesHeaderRow(row)) {
        mode = "NONE";
        continue;
      }
      if (isTotalsRow(row)) {
        mode = "NONE";
        continue;
      }

      const nums = extractNumericSeries(row);

      if (mode === "PAY") {
        if (nums.length === 0) continue;

        let hrs = 0;
        let amt = 0;

        if (nums.length >= 2) {
          if (Math.abs(nums[0]) <= 3000) {
            hrs = nums[0];
            amt = nums[1];
          } else {
            amt = nums[0];
          }
        } else {
          amt = nums[0];
        }

        if (isOvertimeLabelRow(row)) {
          overtimeAmt += amt;
          overtimeHours += hrs;
          continue;
        }
        if (isHolLabelRow(row)) {
          holAmt += amt;
          holHours += hrs;
          continue;
        }

        salaryAmt += amt;
        continue;
      }

      if (mode === "ER") {
        if (nums.length === 0) continue;
        const amt = nums[0];
        if (is401kRow(row)) er401k += amt;
        continue;
      }
    }

    employees.push({ name, salaryAmt, overtimeAmt, overtimeHours, holAmt, holHours, er401k });
  }

  const reportTotals = employees.reduce(
    (acc, e) => {
      acc.salaryTotal += e.salaryAmt;
      acc.overtimeAmtTotal += e.overtimeAmt;
      acc.overtimeHoursTotal += e.overtimeHours ?? 0;
      acc.holAmtTotal += e.holAmt;
      acc.holHoursTotal += e.holHours ?? 0;
      acc.er401kTotal += e.er401k;
      return acc;
    },
    { salaryTotal: 0, overtimeAmtTotal: 0, overtimeHoursTotal: 0, holHoursTotal: 0, holAmtTotal: 0, er401kTotal: 0 }
  );

  return { payDate, reportTotals, employees };
}

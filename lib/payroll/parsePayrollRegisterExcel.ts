import * as XLSX from "xlsx";
import { PayrollEmployee, PayrollParseResult } from "../types";
import { toNumber } from "../utils";

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

function norm(s: any) {
  return String(s ?? "").trim().toLowerCase();
}

function findCellIndex(row: any[] | undefined, containsText: string): number {
  if (!row) return -1;
  const needle = containsText.toLowerCase();
  for (let c = 0; c < row.length; c++) {
    if (norm(row[c]).includes(needle)) return c;
  }
  return -1;
}

function isOvertimeLabel(label: string) {
  const s = label.toLowerCase().trim();
  return s === "overtime" || s.startsWith("overtime") || /^ot\b/.test(s) || s.includes("over time");
}

function isHolLabel(label: string) {
  const s = label.toLowerCase().trim();
  return s === "hol" || s.startsWith("hol") || s.includes("holiday");
}

function isProbablyEmployeeName(s: string) {
  const t = (s || "").trim();
  if (!t) return false;
  const low = t.toLowerCase();
  if (
    low.includes("payroll register") ||
    low.includes("report totals") ||
    low.includes("company") ||
    low.includes("department") ||
    low.includes("pay type") ||
    low.includes("totals") ||
    low === "taxes" ||
    low.includes("deductions")
  ) return false;

  if (!/[a-zA-Z]/.test(t)) return false;

  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return true;
  if (parts.length === 1 && parts[0].length >= 4 && /^[A-Za-z][A-Za-z\-']+$/.test(parts[0])) return true;

  return false;
}

function findEmployeeNameAbove(grid: any[][], payTypeRowIndex: number, nameCol: number): string | undefined {
  for (let r = payTypeRowIndex - 1; r >= 0 && r >= payTypeRowIndex - 30; r--) {
    const cand = String(grid[r]?.[nameCol] ?? "").trim();
    if (isProbablyEmployeeName(cand)) return cand;
  }
  return undefined;
}

function findNextRowIndexWithText(grid: any[][], startRow: number, text: string): { row: number; col: number } | null {
  const needle = text.toLowerCase();
  for (let r = startRow; r < grid.length; r++) {
    const row = grid[r] || [];
    for (let c = 0; c < row.length; c++) {
      if (norm(row[c]).includes(needle)) return { row: r, col: c };
    }
  }
  return null;
}

export function parsePayrollRegisterExcel(buf: Buffer): PayrollParseResult {
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) as any[][];

  const payDate = findFirstDate(grid);

  const employees: PayrollEmployee[] = [];
  const seen = new Set<string>();

  let i = 0;
  while (i < grid.length) {
    const payTypeCol = findCellIndex(grid[i], "pay type");
    if (payTypeCol === -1) {
      i++;
      continue;
    }

    // The label column is the same column that contains "Pay Type"
    const labelCol = payTypeCol;
    const hoursCol = labelCol + 1;
    const amtCol = labelCol + 2;

    const name = findEmployeeNameAbove(grid, i, labelCol);
    if (!name) {
      i++;
      continue;
    }

    const key = name.toLowerCase();
    if (seen.has(key)) {
      i++;
      continue;
    }

    let salaryAmt = 0;
    let overtimeAmt = 0;
    let overtimeHours = 0;
    let holAmt = 0;
    let holHours = 0;

    // Pay type rows start immediately after "Pay Type" header
    let j = i + 1;
    for (; j < grid.length; j++) {
      const r = grid[j];
      const label = String(r?.[labelCol] ?? "").trim();
      const low = label.toLowerCase().trim();
      if (!label) continue;

      // Stop conditions
      if (/^totals?:\s*$/i.test(label)) break;
      if (low.includes("deductions")) break;
      if (low.includes("taxes")) break;

      const hours = toNumber(r?.[hoursCol]);
      const amt = toNumber(r?.[amtCol]);

      if (isOvertimeLabel(label)) {
        overtimeAmt += amt;
        overtimeHours += hours;
      } else if (isHolLabel(label)) {
        holAmt += amt;
        holHours += hours;
      } else {
        salaryAmt += amt;
      }
    }

    // Find Deductions (ER) section after pay types (could be in any column)
    const erHeader = findNextRowIndexWithText(grid, j, "deductions (er)");
    let er401k = 0;
    let k = j;

    if (erHeader) {
      const erLabelCol = erHeader.col;
      const erAmtCol = erLabelCol + 2; // label, (blank/hrs), amount matches pattern

      k = erHeader.row + 1;
      for (; k < grid.length; k++) {
        const r = grid[k];
        const label = String(r?.[erLabelCol] ?? "").trim();
        const low = label.toLowerCase();

        if (!label) continue;
        if (low.startsWith("taxes") || low.includes("taxes")) break;
        if (/^totals?:\s*$/i.test(label)) break;

        const amt = toNumber(r?.[erAmtCol]);

        if (/401k/i.test(label) && /(er|employer)/i.test(label) && !/loan/i.test(label)) {
          er401k += amt;
        }
      }
    }

    employees.push({
      name,
      salaryAmt,
      overtimeAmt,
      overtimeHours,
      holAmt,
      holHours,
      er401k,
    });
    seen.add(key);

    i = Math.max(i + 1, k);
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
    {
      salaryTotal: 0,
      overtimeAmtTotal: 0,
      overtimeHoursTotal: 0,
      holHoursTotal: 0,
      holAmtTotal: 0,
      er401kTotal: 0,
    }
  );

  return { payDate, reportTotals, employees };
}

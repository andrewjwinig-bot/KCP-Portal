import * as XLSX from "xlsx";
import { PayrollEmployee, PayrollParseResult } from "../types";
import { toNumber } from "../utils";

/**
 * Robust Payroll Register parser for your "By Pay Statements" Excel export.
 *
 * IMPORTANT FIX:
 * Some employee blocks (notably ANDREW WINIG and Gregory Masciantonio) have headers like
 * "Pay Type:" or extra spaces, so exact equality checks fail and the parser never enters PAY mode,
 * resulting in $0 for the whole employee. Same idea for "Deductions (ER)".
 *
 * This version uses regex/contains checks for section headers.
 */

function asText(v: any): string {
  return String(v ?? "").trim();
}

function cleanName(raw: string) {
  return (raw || "")
    .replace(/\s*Default\s*-\s*#\d+\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeEmployeeName(s: string): boolean {
  const t = asText(s);
  if (!t) return false;
  const low = t.toLowerCase();
  if (low.includes("payroll register")) return false;
  if (low.includes("report totals")) return false;
  if (/^pay\s*type\b/.test(low)) return false;
  if (low.includes("deductions")) return false;
  if (low.includes("taxes")) return false;
  if (low === "totals:" || low.startsWith("totals")) return false;

  const hasLetters = /[A-Za-z]/.test(t);
  const parts = t.replace(",", " ").split(/\s+/).filter(Boolean);
  return hasLetters && parts.length >= 2;
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

function isOvertime(label: string) {
  const low = label.toLowerCase();
  return low.startsWith("overtime") || /^ot\b/.test(low);
}
function isHol(label: string) {
  const low = label.toLowerCase();
  return low === "hol" || low.startsWith("hol") || low.includes("holiday");
}
function isTotals(label: string) {
  return label.toLowerCase().startsWith("totals");
}

// Header detectors (regex so ":" or extra spaces don't break)
function isPayTypeHeader(label: string) {
  return /^pay\s*type\b/i.test(label.trim());
}
function isErHeader(label: string) {
  return /^deductions\s*\(er\)\b/i.test(label.trim());
}
function isEeHeader(label: string) {
  return /^deductions\s*\(ee\)\b/i.test(label.trim());
}
function isTaxesHeader(label: string) {
  return /^taxes\b/i.test(label.trim());
}

export function parsePayrollRegisterExcel(buf: Buffer): PayrollParseResult {
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) as any[][];

  const payDate = findFirstDate(grid);
  const employees: PayrollEmployee[] = [];

  let r = 0;
  while (r < grid.length) {
    const nameCell = asText(grid[r]?.[1]); // column B
    if (!looksLikeEmployeeName(nameCell)) {
      r++;
      continue;
    }

    const name = cleanName(nameCell);

    let salaryAmt = 0;
    let overtimeAmt = 0;
    let overtimeHours = 0;
    let holAmt = 0;
    let holHours = 0;
    let er401k = 0;

    type Mode = "NONE" | "PAY" | "ER";
    let mode: Mode = "NONE";

    r++; // scan after name row
    let blankRun = 0;

    for (; r < grid.length; r++) {
      const label = asText(grid[r]?.[1]); // column B label
      const hrs = toNumber(grid[r]?.[2]); // column C
      const amt = toNumber(grid[r]?.[3]); // column D

      // next employee starts
      if (looksLikeEmployeeName(label) && cleanName(label) !== name) break;

      if (!label) {
        blankRun++;
        if (blankRun >= 8) break;
        continue;
      }
      blankRun = 0;

      if (isPayTypeHeader(label)) {
        mode = "PAY";
        continue;
      }
      if (isErHeader(label)) {
        mode = "ER";
        continue;
      }
      if (isEeHeader(label)) {
        mode = "NONE";
        continue;
      }
      if (isTaxesHeader(label)) {
        mode = "NONE";
        continue;
      }

      if (mode === "PAY") {
        if (isTotals(label)) {
          mode = "NONE";
          continue;
        }
        if (isOvertime(label)) {
          overtimeAmt += amt;
          overtimeHours += hrs;
          continue;
        }
        if (isHol(label)) {
          holAmt += amt;
          holHours += hrs;
          continue;
        }
        // everything else in pay section counts as salary bucket
        if (amt) salaryAmt += amt;
        continue;
      }

      if (mode === "ER") {
        const low = label.toLowerCase();
        // 401K ER: any 401* line under ER header; exclude loan/ee
        const is401 = low.includes("401");
        const isLoan = low.includes("loan");
        const isEE = low.includes(" ee") || low.includes("(ee") || low.includes("employee");
        if (is401 && !isLoan && !isEE) {
          er401k += amt;
        }
        if (isTotals(label) || isTaxesHeader(label)) mode = "NONE";
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

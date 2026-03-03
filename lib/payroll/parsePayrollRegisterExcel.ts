import * as XLSX from "xlsx";
import { PayrollEmployee, PayrollParseResult } from "../types";
import { toNumber } from "../utils";

/**
 * Payroll Register parser (stable + specific to your export):
 * - Employee name is in column B
 * - "Pay Type" section lists pay lines (labels in B, hours in C, amount in D)
 * - Deductions (ER) section exists but the 401K ER line label is just "401k" (no "ER" text)
 *
 * Fixes:
 * - Andrew/Charles show $0 because their pay line is "Salary" (not "Regular pay")
 * - 401K ER was 0 because we required "ER" text in the label; in this export ER lines are under the ER header.
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
  if (low.includes("pay type")) return false;
  if (low.includes("deductions")) return false;
  if (low.includes("taxes")) return false;
  if (low === "totals:" || low.startsWith("totals")) return false;
  // name-like string: has letters and at least 2 tokens
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

    // state machine inside the employee block
    type Mode = "NONE" | "PAY" | "ER";
    let mode: Mode = "NONE";

    r++; // start scanning after name row
    let blankRun = 0;

    for (; r < grid.length; r++) {
      const label = asText(grid[r]?.[1]); // column B label
      const hrs = toNumber(grid[r]?.[2]); // column C
      const amt = toNumber(grid[r]?.[3]); // column D

      // If we hit another employee name, end current block
      if (looksLikeEmployeeName(label) && label !== nameCell) break;

      if (!label) {
        blankRun++;
        if (blankRun >= 8) break;
        continue;
      }
      blankRun = 0;

      const low = label.toLowerCase();

      if (low === "pay type") {
        mode = "PAY";
        continue;
      }
      if (low === "deductions (er)") {
        mode = "ER";
        continue;
      }
      if (low.startsWith("taxes")) {
        mode = "NONE";
        continue;
      }
      if (low.startsWith("deductions (ee)")) {
        mode = "NONE"; // ignore EE deductions
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

        // Everything else in Pay Type gets treated as Salary (includes "Salary", "Regular Pay", allowances, etc.)
        if (amt) salaryAmt += amt;
        continue;
      }

      if (mode === "ER") {
        // In your export, the ER 401k line label is just "401k" (no ER text)
        if (low.includes("401") && low.includes("k") && !low.includes("loan")) {
          er401k += amt;
        }
        // stop ER mode when totals or taxes start
        if (isTotals(label) || low.startsWith("taxes")) mode = "NONE";
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

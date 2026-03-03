import * as XLSX from "xlsx";
import { PayrollEmployee, PayrollParseResult } from "../types";
import { toNumber } from "../utils";

/**
 * Payroll Register (.xls/.xlsx) parser for the "By Pay Statements" export you shared.
 *
 * Key behaviors:
 * - Employee name rows are in column B (index 1) and typically look like:
 *     "ANDREW WINIG  Default - #10"
 *     "Charles Loiseau  Default - #33"
 * - Within an employee block:
 *     - "Pay Type" header appears, then pay lines until "Totals:" (or until a new section)
 *       * Any line containing "Overtime" -> overtimeAmt (+ hours if present in col C)
 *       * Any line containing "HOL" or "Holiday" -> holAmt (+ hours if present in col C)
 *       * All other pay lines with an amount -> salaryAmt  (this catches "Salary", "Auto Allowance", etc.)
 *     - "Deductions (ER)" header appears, then deduction lines until the next header/block
 *       * Any line containing "401" (e.g., "401k") counts toward er401k
 *       * Excludes "EE" and "Loan"
 *
 * This is intentionally column-focused (B label, D amount) but section-aware,
 * so it won't miss employees whose pay label isn't exactly "Regular Pay".
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

  // exclude common headers
  if (low.includes("payroll register")) return false;
  if (low.includes("report totals")) return false;
  if (low.includes("pay date")) return false;
  if (low.includes("pay type")) return false;
  if (low.includes("deductions")) return false;
  if (low.includes("taxes")) return false;
  if (low === "totals:" || low.startsWith("totals")) return false;

  // needs at least 2 words with letters
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

type Section = "none" | "pay" | "ded_er";

function isHeader(label: string): boolean {
  const low = label.toLowerCase();
  return (
    low === "pay type" ||
    low.startsWith("pay type") ||
    low === "deductions (er)" ||
    low.startsWith("deductions (er)") ||
    low === "deductions" ||
    low.startsWith("deductions") ||
    low === "taxes" ||
    low.startsWith("taxes") ||
    low === "totals:" ||
    low.startsWith("totals")
  );
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

    let section: Section = "none";
    let blankRun = 0;

    // walk forward through this employee's block
    r++; // start after name row
    for (; r < grid.length; r++) {
      const label = asText(grid[r]?.[1]); // column B
      const amount = toNumber(grid[r]?.[3]); // column D
      const hours = toNumber(grid[r]?.[2]); // column C (sometimes)

      // stop if next employee starts
      if (looksLikeEmployeeName(label)) {
        break;
      }

      if (!label) {
        blankRun++;
        if (blankRun >= 8) {
          // long blank gap ends the block
          break;
        }
        continue;
      }
      blankRun = 0;

      const low = label.toLowerCase();

      // Switch sections
      if (low === "pay type" || low.startsWith("pay type")) {
        section = "pay";
        continue;
      }
      if (low === "deductions (er)" || low.startsWith("deductions (er)")) {
        section = "ded_er";
        continue;
      }
      if (low === "totals:" || low.startsWith("totals")) {
        // totals ends pay section; keep scanning in case Deductions(ER) follows
        section = "none";
        continue;
      }
      // Other headers reset section
      if (isHeader(label) && section !== "ded_er" && section !== "pay") {
        section = "none";
      }

      // Parse by active section
      if (section === "pay") {
        // Overtime / HOL explicit
        if (low.includes("overtime") || low === "ot" || low.startsWith("ot ")) {
          overtimeAmt += amount;
          if (hours) overtimeHours += hours;
          continue;
        }
        if (low.startsWith("hol") || low.includes("holiday")) {
          holAmt += amount;
          if (hours) holHours += hours;
          continue;
        }

        // Everything else with a numeric amount counts as "salary" bucket (base pay)
        if (amount) {
          salaryAmt += amount;
        }
        continue;
      }

      if (section === "ded_er") {
        // Count 401K ER lines even if label is just "401k"
        // Exclude employee deductions and loans
        const is401 = low.includes("401");
        const isLoan = low.includes("loan");
        const isEE = low.includes(" ee") || low.includes("(ee") || low.includes("employee");
        if (is401 && !isLoan && !isEE) {
          er401k += amount;
        }
        continue;
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

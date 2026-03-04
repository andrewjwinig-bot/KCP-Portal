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

  // Primary signal: "Default - #N" suffix is unambiguous — always an employee name row
  if (/Default\s*-\s*#\d+/i.test(t)) return true;

  const low = t.toLowerCase();
  if (low.includes("payroll register")) return false;
  if (low.includes("report totals")) return false;
  if (/^pay\s*type\b/.test(low)) return false;
  if (low.includes("deductions")) return false;
  if (low.includes("taxes")) return false;
  if (low === "totals:" || low.startsWith("totals")) return false;
  if (low.includes("er totals")) return false;
  if (low.includes("all tax")) return false;
  if (low.startsWith("net pay")) return false;
  if (low.includes("direct deposit")) return false;
  // Employer/employee labels that appear as section items, not person names
  if (low.startsWith("employer")) return false;
  if (low.startsWith("employee")) return false;

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

/**
 * Returns the canonical exclusion category name if this pay-type label should be
 * noted but NOT counted toward salary (Commission, Bonus, Auto Allowance).
 * Returns null for normal pay items.
 */
function excludedCategory(label: string): string | null {
  const low = label.toLowerCase();
  if (low.includes("commission")) return "Commission";
  if (low.includes("bonus")) return "Bonus";
  if (low.includes("auto allow")) return "Auto Allowance";
  return null;
}

// Header detectors (regex so ":" or extra spaces don't break)
function isPayTypeHeader(label: string) {
  return /^pay\s*type\b/i.test(label.trim());
}
function isErHeader(label: string) {
  // Note: no \b after \) because ) is \W and \b never matches between two \W chars
  return /^deductions\s*\(er\)/i.test(label.trim());
}
function isEeHeader(label: string) {
  return /^deductions\s*\(ee\)/i.test(label.trim());
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
    // Employee ID is in column L (index 11) on the same row as the name
    const rawId = asText(grid[r]?.[11]);
    const employeeId = rawId || undefined;

    let salaryAmt = 0;
    let overtimeAmt = 0;
    let overtimeHours = 0;
    let holAmt = 0;
    let holHours = 0;
    let er401kAmt = 0;
    const exclusions: Array<{ label: string; amount: number }> = [];

    type Mode = "NONE" | "PAY" | "ER";
    let mode: Mode = "NONE";

    console.log(`[payroll] Found employee: "${name}" (id=${employeeId ?? "none"}) at row ${r}`);

    r++; // scan after name row
    let blankRun = 0;
    let rowsLogged = 0; // log first 12 rows of each block so we can see the column layout

    for (; r < grid.length; r++) {
      const label = asText(grid[r]?.[1]); // column B label
      const hrs = toNumber(grid[r]?.[2]); // column C
      const amt = toNumber(grid[r]?.[3]); // column D

      // Log first 12 rows of this block with full column A-F content
      if (rowsLogged < 12) {
        const cols = [0,1,2,3,4,5].map(i => `[${i}]=${JSON.stringify(asText(grid[r]?.[i]))}`).join(" ");
        console.log(`[payroll]   row${r} ${cols}`);
        rowsLogged++;
      }

      // Strong signal: "Default - #N" on a different name → always a new employee block
      if (/Default\s*-\s*#\d+/i.test(label) && cleanName(label) !== name) break;

      // Weaker signal: in NONE mode (between sections) a name-like label is the next employee.
      // We only do this outside PAY/ER mode so pay-type labels ("Regular Pay", etc.) don't
      // accidentally end the current employee's block while we're still accumulating amounts.
      if (mode === "NONE" && looksLikeEmployeeName(label) && cleanName(label) !== name) break;

      if (!label) {
        blankRun++;
        if (blankRun >= 8) break;
        continue;
      }
      blankRun = 0;

      if (isPayTypeHeader(label)) {
        console.log(`[payroll]   → entering PAY mode`);
        mode = "PAY";
        continue;
      }
      if (isErHeader(label)) {
        console.log(`[payroll]   → entering ER mode`);
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
        // Commission / Bonus / Auto Allowance: track separately, exclude from salary
        const excCat = excludedCategory(label);
        if (excCat) {
          if (amt) {
            const existing = exclusions.find((e) => e.label === excCat);
            if (existing) existing.amount += amt;
            else exclusions.push({ label: excCat, amount: amt });
            console.log(`[payroll]   → excluded from salary: "${label}" (${excCat}) amt=${amt}`);
          }
          continue;
        }
        // everything else in pay section counts as salary bucket
        if (amt) salaryAmt += amt;
        continue;
      }

      if (mode === "ER") {
        const low = label.toLowerCase();
        // 401K ER: any 401* line under ER header; exclude loan lines and pure EE lines.
        // Use word boundary for "ee" so "employee" (in a label like "401K Employee Contribution ER")
        // does NOT falsely exclude the ER contribution.
        const is401 = low.includes("401");
        const isLoan = low.includes("loan");
        const isEE = /\bee\b/i.test(low) || low.includes("(ee)");
        if (is401 && !isLoan && !isEE) {
          console.log(`[payroll]   → 401K ER line "${label}" amt=${amt}`);
          er401kAmt += amt;
        }
        // Exit ER mode only on a new section header (taxes, EE deductions, pay types).
        // Do NOT exit on generic "Totals:" — the ER total summary can appear before individual
        // 401K ER line items in some Excel exports, and we must not skip those items.
        continue;
      }
    }

    console.log(`[payroll]   salary=${salaryAmt} ot=${overtimeAmt} hol=${holAmt} er401k=${er401kAmt} exclusions=${JSON.stringify(exclusions)}`);
    employees.push({ name, employeeId, salaryAmt, overtimeAmt, overtimeHours, holAmt, holHours, er401kAmt, exclusions: exclusions.length ? exclusions : undefined });
  }

  const totals = employees.reduce(
    (acc, e) => {
      acc.salaryAmt += e.salaryAmt;
      acc.overtimeAmt += e.overtimeAmt;
      acc.overtimeHours += e.overtimeHours ?? 0;
      acc.holAmt += e.holAmt;
      acc.holHours += e.holHours ?? 0;
      acc.er401kAmt += e.er401kAmt;
      return acc;
    },
    {
      salaryAmt: 0,
      overtimeAmt: 0,
      overtimeHours: 0,
      holHours: 0,
      holAmt: 0,
      er401kAmt: 0,
    }
  );

  return { payDate, totals, employees };
}

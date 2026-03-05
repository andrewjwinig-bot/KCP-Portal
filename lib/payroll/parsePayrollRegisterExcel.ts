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
  if (low.includes("deduct")) return false;        // "Deductions", "Deduction", "Deductn"
  if (low.includes("taxes")) return false;
  if (low === "totals:" || low.startsWith("totals")) return false;
  if (low.includes("er totals")) return false;
  if (low.includes("all tax")) return false;
  if (low.startsWith("net pay")) return false;
  if (low.includes("direct deposit")) return false;
  // Employer/employee section labels (not person names)
  if (low.startsWith("employer")) return false;
  if (low.startsWith("employee")) return false;
  // "ER Deductions", "ER Contributions", "ER:" etc. — but NOT names starting with "Er" (Ernest…)
  if (/^er\b/.test(low)) return false;
  // Payroll tax line items
  if (low.startsWith("futa") || low.startsWith("fica") || low.startsWith("medi") || low.startsWith("suta") || low.startsWith("sui")) return false;

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
 * Bonus or Auto Allowance — tracked in the "Other" column, allocated to properties.
 * Returns the canonical category name, or null for regular pay.
 */
function isOtherPay(label: string): string | null {
  const low = label.toLowerCase();
  if (low.includes("bonus")) return "Bonus";
  if (low.includes("auto allow")) return "Auto Allowance";
  return null;
}

/**
 * Commission — tracked as an exclusion (not in salary, not in Other column).
 */
function isCommission(label: string): boolean {
  return label.toLowerCase().includes("commission");
}

/**
 * Returns true for ER payroll tax line items: FUTA, FICA, MEDI, SUTA/SUI variants.
 * Returns the canonical label to use in the breakdown.
 */
function erTaxLabel(label: string): string | null {
  const low = label.toLowerCase().trim();
  // Skip items explicitly employee-side — can appear in mixed "Taxes:" sections
  if (/\bee\b/.test(low) || low.includes("(ee)") || low.endsWith(":ee")) return null;
  // Federal Unemployment (FUTA / FUI)
  if (low.startsWith("futa") || low.startsWith("fui") || /\bfuta\b/.test(low) || low.includes("federal unemp")) return "FUTA";
  // Social Security / FICA (ER)
  if (low.startsWith("fica") || /^ss[: (]/.test(low) || low.startsWith("ss:er") || low.includes("social sec")) return "FICA";
  // Medicare
  if (low.startsWith("medi") || low.startsWith("medicare")) return "MEDI";
  // State Unemployment (SUTA / SUI) — preserve full label e.g. "SUTA:PA"
  if (low.startsWith("suta") || low.startsWith("sui") || low.includes("state unemp")) return label.trim();
  return null;
}

// Header detectors (regex so ":" or extra spaces don't break)
function isPayTypeHeader(label: string) {
  return /^pay\s*type\b/i.test(label.trim());
}
function isErHeader(label: string) {
  const t = label.trim();
  // "Deductions (ER)", "Deduction (ER)", "Deductions - ER", "ER Deductions", "Employer Match", "ER Contributions"
  if (/^deductions?\s*[\-(]\s*er/i.test(t)) return true;
  if (/^er\s+(deductions?|contributions?)/i.test(t)) return true;
  if (/^employer\s+(match|contribution)/i.test(t)) return true;
  return false;
}
function isEeHeader(label: string) {
  const t = label.trim();
  if (/^deductions?\s*[\-(]\s*ee/i.test(t)) return true;
  if (/^ee\s+deductions?/i.test(t)) return true;
  if (/^employee\s+deductions?/i.test(t)) return true;
  return false;
}
/** "Taxes (ER)" / "ER Taxes" / "Employer Taxes" — the employer tax section */
function isTaxesErHeader(label: string) {
  const low = label.toLowerCase().trim();
  if (/^taxes?\b/.test(low) && /\ber\b/.test(low)) return true;  // "Taxes (ER)", "Taxes - ER"
  if (/^er\s+tax/i.test(low)) return true;                         // "ER Taxes:", "ER Tax:"
  if (/^employer\s+tax/i.test(low)) return true;                   // "Employer Taxes:"
  return false;
}
/** "Taxes (EE)" — employee-only tax section; skip all contents */
function isTaxesEeHeader(label: string) {
  const low = label.toLowerCase().trim();
  return /^taxes?\b/.test(low) && /\bee\b/.test(low);
}
/** Generic "Taxes:" header (no EE/ER marker) — enter TAXES mode; erTaxLabel filters out EE items */
function isTaxesHeader(label: string) {
  return /^taxes?\b/i.test(label.trim());
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
    let otherAmt = 0;
    let taxesErAmt = 0;
    const otherBreakdown: Array<{ label: string; amount: number }> = [];
    const taxesErBreakdown: Array<{ label: string; amount: number }> = [];
    const exclusions: Array<{ label: string; amount: number }> = [];

    type Mode = "NONE" | "EE" | "PAY" | "ER" | "TAXES";
    let mode: Mode = "NONE";

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
        rowsLogged++;
      }

      // Strong signal: "Default - #N" on a different name → always a new employee block
      if (/Default\s*-\s*#\d+/i.test(label) && cleanName(label) !== name) break;

      // Weaker signal: in NONE mode (between sections) a name-like label is the next employee.
      // We only do this outside PAY/ER/TAXES mode so pay-type labels don't accidentally end the block.
      if (mode === "NONE" && looksLikeEmployeeName(label) && cleanName(label) !== name) break;

      if (!label) {
        blankRun++;
        if (blankRun >= 8) break;
        continue;
      }
      blankRun = 0;

      // Diagnostic: log any row whose label contains "tax" so we can see the exact text
      if (/tax/i.test(label)) {
      }

      if (isPayTypeHeader(label)) {
        mode = "PAY";
        continue;
      }
      if (isErHeader(label)) {
        mode = "ER";
        continue;
      }
      if (isEeHeader(label)) {
        mode = "EE";
        continue;
      }
      if (isTaxesErHeader(label)) {
        mode = "TAXES";
        continue;
      }
      // "Taxes (EE)" / EE deductions — employee-side only, skip contents entirely.
      // Use "EE" mode (not "NONE") so name-like labels inside the section
      // (e.g. "Federal Income Tax", "Social Security EE") don't trigger the
      // NONE-mode break guard and kill the loop before the "Taxes (ER)" section.
      if (isTaxesEeHeader(label)) {
        mode = "EE";
        continue;
      }
      // Generic "Taxes:" with no EE/ER marker → enter TAXES mode; erTaxLabel will skip EE items
      if (isTaxesHeader(label)) {
        mode = "TAXES";
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
        // Bonus / Auto Allowance → "Other" column, allocated to properties
        const otherCat = isOtherPay(label);
        if (otherCat) {
          if (amt) {
            otherAmt += amt;
            const existing = otherBreakdown.find((e) => e.label === otherCat);
            if (existing) existing.amount += amt;
            else otherBreakdown.push({ label: otherCat, amount: amt });
          }
          continue;
        }
        // Commission → exclusion only (not in salary, not in Other column)
        if (isCommission(label)) {
          if (amt) {
            const existing = exclusions.find((e) => e.label === "Commission");
            if (existing) existing.amount += amt;
            else exclusions.push({ label: "Commission", amount: amt });
          }
          continue;
        }
        // everything else in pay section counts as salary
        if (amt) salaryAmt += amt;
        continue;
      }

      if (mode === "ER") {
        const low = label.toLowerCase();
        // 401K ER: any 401* line under ER header; exclude loan lines and pure EE lines.
        const is401 = low.includes("401");
        const isLoan = low.includes("loan");
        const isEE = /\bee\b/i.test(low) || low.includes("(ee)");
        if (is401 && !isLoan && !isEE) {
          er401kAmt += amt;
        }
        continue;
      }

      if (mode === "TAXES") {
        // Capture only ER-specific tax items (FUTA, FICA, MEDI, SUTA, SUI)
        const taxLabel = erTaxLabel(label);
        if (taxLabel && amt) {
          taxesErAmt += amt;
          const existing = taxesErBreakdown.find((e) => e.label === taxLabel);
          if (existing) existing.amount += amt;
          else taxesErBreakdown.push({ label: taxLabel, amount: amt });
        }
        continue;
      }
    }

    employees.push({
      name, employeeId, salaryAmt, overtimeAmt, overtimeHours, holAmt, holHours, er401kAmt,
      otherAmt, otherBreakdown: otherBreakdown.length ? otherBreakdown : undefined,
      taxesErAmt, taxesErBreakdown: taxesErBreakdown.length ? taxesErBreakdown : undefined,
      exclusions: exclusions.length ? exclusions : undefined,
    });
  }

  const totals = employees.reduce(
    (acc, e) => {
      acc.salaryAmt += e.salaryAmt;
      acc.overtimeAmt += e.overtimeAmt;
      acc.overtimeHours += e.overtimeHours ?? 0;
      acc.holAmt += e.holAmt;
      acc.holHours += e.holHours ?? 0;
      acc.er401kAmt += e.er401kAmt;
      acc.otherAmt += e.otherAmt;
      acc.taxesErAmt += e.taxesErAmt;
      return acc;
    },
    {
      salaryAmt: 0,
      overtimeAmt: 0,
      overtimeHours: 0,
      holHours: 0,
      holAmt: 0,
      er401kAmt: 0,
      otherAmt: 0,
      taxesErAmt: 0,
    }
  );

  return { payDate, totals, employees };
}

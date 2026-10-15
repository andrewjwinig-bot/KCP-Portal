// In-place revenue for the budget — the contracted rent each unit is scheduled
// to be charged, month by month, for the budget year.
//
// WHY THIS IS AN IMPORT AND NOT DERIVED FROM THE RENT ROLL. The rent roll is a
// point-in-time snapshot carrying TODAY'S rate: it cannot know a step that has
// not happened yet. (The rent-roll check says the same thing from the other
// side — it marks a YTD comparison "indicative" because a mid-year escalation
// is not in the roll.) A budget has to carry next year's steps, so the figures
// come from Skyline's own forward schedule:
//
//   General Ledger → G/L Information → Budget Rent Increase Calculation
//
// TWO THINGS THAT GO WRONG, both of which were handwritten notes in the margin
// of the 2026 workbook rather than anything that checked itself:
//
//   1. The amounts arrive as TEXT ("Convert Charge Amounts in column G to
//      number once pasted"). A text "11458.33" sums to zero silently.
//   2. The export can quietly omit properties. The 2026 sheet carries the note
//      "Missing 1100 and 1500" — two centres absent, discovered by eye. A
//      property with no rows is NOT a property with no rent, so coverage is
//      reported rather than assumed, the way the management-fees card reports
//      `missingGl` instead of letting a gap read as a real figure.

import * as XLSX from "xlsx";

/** One scheduled charge: a unit, a month, an amount. */
export type InPlaceCharge = {
  /** Skyline's posting company — the property code. */
  propertyCode: string;
  /** Canonical unit ref, Skyline's "-CU" charge suffix stripped. */
  unitRef: string;
  tenant: string;
  /** 1–12. */
  month: number;
  /** Charge code, e.g. "RNT". */
  chargeCode: string;
  glAccount: string;
  amount: number;
  /** The charge date as the export wrote it, for tracing a figure back. */
  chargeDate: string | null;
};

export type InPlaceRevenueImport = {
  charges: InPlaceCharge[];
  /** Property codes the export actually carried, sorted. */
  properties: string[];
  /** Per property: 12 monthly totals and the year. */
  byProperty: Record<string, { months: number[]; total: number; units: number }>;
  /** Rows the parser could not read, with why — surfaced, never dropped silently. */
  skipped: { row: number; reason: string }[];
  /** Charge codes seen, so an unexpected one is visible rather than assumed. */
  chargeCodes: string[];
  glAccounts: string[];
};

const HEADERS = ["posting co", "unit ref", "tenant name", "charge date", "charge code", "gl acct", "charge amount", "month"];

const norm = (v: unknown): string => String(v ?? "").trim();

/**
 * Skyline's charge refs carry a "-CU" suffix that the rest of the app strips.
 * Matching the canonical form here means a unit lines up with the rent roll,
 * the recon rosters and the portal token without a second lookup.
 */
export function canonicalUnit(ref: string): string {
  return ref.trim().replace(/-CU$/i, "");
}

/**
 * Coerce a cell that may be a real number or the TEXT Skyline pastes.
 * Returns null when it is neither, so the row is reported rather than counted
 * as zero — a silent zero is the failure mode the margin note was guarding.
 */
export function chargeAmount(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = norm(v).replace(/[$,]/g, "").replace(/^\((.*)\)$/, "-$1");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** The month a charge belongs to: the export's own Month column, else its date. */
export function chargeMonth(monthCell: unknown, dateCell: unknown): number | null {
  const m = Number(norm(monthCell));
  if (Number.isInteger(m) && m >= 1 && m <= 12) return m;
  const d = norm(dateCell);
  const slash = /^(\d{1,2})\/\d{1,2}\/\d{2,4}$/.exec(d);
  if (slash) {
    const mm = Number(slash[1]);
    if (mm >= 1 && mm <= 12) return mm;
  }
  // Excel serial date.
  const serial = Number(d);
  if (Number.isFinite(serial) && serial > 20000 && serial < 80000) {
    const js = new Date(Date.UTC(1899, 11, 30) as unknown as number);
    js.setUTCDate(js.getUTCDate() + serial);
    return js.getUTCMonth() + 1;
  }
  return null;
}

function headerRowIndex(rows: unknown[][]): number {
  for (let r = 0; r < Math.min(rows.length, 30); r++) {
    const cells = (rows[r] ?? []).map((c) => norm(c).toLowerCase());
    const hits = HEADERS.filter((h) => cells.some((c) => c.startsWith(h))).length;
    if (hits >= 5) return r;
  }
  return -1;
}

export function parseInPlaceRevenue(buf: Buffer | ArrayBuffer): InPlaceRevenueImport {
  const wb = XLSX.read(buf, { type: "buffer" });
  // The sheet may be the whole budget workbook or just the exported tab.
  const sheetName = wb.SheetNames.find((n) => /in.?place/i.test(n)) ?? wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = (ws ? XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) : []) as unknown[][];

  const head = headerRowIndex(rows);
  const charges: InPlaceCharge[] = [];
  const skipped: { row: number; reason: string }[] = [];
  const codes = new Set<string>();
  const gls = new Set<string>();

  for (let r = head + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const propertyCode = norm(row[0]);
    const unitRaw = norm(row[1]);
    if (!propertyCode && !unitRaw) continue; // a blank spacer row is not an error
    if (!propertyCode || !unitRaw) { skipped.push({ row: r + 1, reason: "no property code or unit ref" }); continue; }

    const amount = chargeAmount(row[6]);
    if (amount === null) { skipped.push({ row: r + 1, reason: `charge amount is not a number (${norm(row[6]) || "blank"})` }); continue; }
    const month = chargeMonth(row[7], row[3]);
    if (month === null) { skipped.push({ row: r + 1, reason: "no month, and the charge date could not be read" }); continue; }
    if (amount === 0) continue; // a $0 scheduled charge carries no budget

    const chargeCode = norm(row[4]);
    const glAccount = norm(row[5]);
    if (chargeCode) codes.add(chargeCode);
    if (glAccount) gls.add(glAccount);
    charges.push({
      propertyCode, unitRef: canonicalUnit(unitRaw), tenant: norm(row[2]),
      month, chargeCode, glAccount, amount, chargeDate: norm(row[3]) || null,
    });
  }

  const byProperty: InPlaceRevenueImport["byProperty"] = {};
  const unitsSeen: Record<string, Set<string>> = {};
  for (const c of charges) {
    const p = (byProperty[c.propertyCode] ??= { months: Array(12).fill(0), total: 0, units: 0 });
    p.months[c.month - 1] += c.amount;
    p.total += c.amount;
    (unitsSeen[c.propertyCode] ??= new Set()).add(c.unitRef);
  }
  for (const [code, p] of Object.entries(byProperty)) {
    p.months = p.months.map((v) => Math.round(v * 100) / 100);
    p.total = Math.round(p.total * 100) / 100;
    p.units = unitsSeen[code]?.size ?? 0;
  }

  return {
    charges,
    properties: Object.keys(byProperty).sort(),
    byProperty,
    skipped,
    chargeCodes: [...codes].sort(),
    glAccounts: [...gls].sort(),
  };
}

/**
 * Which of the properties this budget covers did NOT appear in the export.
 *
 * The 2026 workbook carried "Missing 1100 and 1500" as a note somebody typed
 * after noticing. A property with no rows is not a property with no rent, so
 * this is computed and shown rather than left to the eye.
 */
export function missingProperties(imported: string[], expected: string[]): string[] {
  const have = new Set(imported.map((p) => p.toUpperCase()));
  return expected.filter((p) => !have.has(p.toUpperCase()));
}

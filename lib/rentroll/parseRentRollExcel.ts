import * as XLSX from "xlsx";
import { toNumber } from "../utils";
import { PROPERTY_DEFS } from "../properties/data";

/**
 * Rent Roll Excel Parser
 *
 * Expected Excel layout (Korman Commercial Properties rent roll format):
 *   Column A  (index 0):  Occupant Name (or "*** VACANT ***")
 *   Column I  (index 8):  Unit Reference Number  e.g. "1100-34-CU"
 *   Column J  (index 9):  Square Feet
 *   Column K  (index 10): Lease Term From
 *   Column L  (index 11): Lease Term To
 *   Column M  (index 12): Base Rent (monthly)
 *   Column N  (index 13): Annual Rent
 *   Column O  (index 14): Annual Rent per Sq Ft/Yr
 *   Column P  (index 15): Base Rent Increase Date (most recent)
 *   Column Q  (index 16): Base Rent Increase Amount
 *   Column R  (index 17): Operating Expense – Month
 *   Column S  (index 18): Operating Expense – Sq Ft/Yr
 *   Column T  (index 19): Real Estate Tax – Month
 *   Column U  (index 20): Real Estate Tax – Sq Ft/Yr
 *   Column V  (index 21): Other Expense – Month
 *   Column W  (index 22): Other Expense – Sq Ft/Yr
 *   Column X  (index 23): Gross Rents – Total
 *   Column Y  (index 24): Gross Rents – Sq Ft/Yr
 *   Column Z+ (index 25+): Future escalation dates then amounts (grouped)
 *
 * Property code = first segment of unit ref before the first dash.
 * Only units whose property code matches a known entry in PROPERTY_DEFS are included.
 */

const COL_OCCUPANT    = 0;
const COL_UNIT_REF    = 8;
const COL_SQFT        = 9;
const COL_LEASE_FROM  = 10;
const COL_LEASE_TO    = 11;
const COL_BASE_RENT   = 12;
const COL_ANNUAL_RENT = 13;
const COL_ANNUAL_SQFT = 14;
const COL_INCR_DATE   = 15;
const COL_INCR_AMT    = 16;
const COL_OPEX_MONTH  = 17;
const COL_OPEX_SQFT   = 18;
const COL_RETAX_MONTH = 19;
const COL_RETAX_SQFT  = 20;
const COL_OTHER_MONTH = 21;
const COL_OTHER_SQFT  = 22;
const COL_GROSS_TOTAL = 23;
const COL_GROSS_SQFT  = 24;
const COL_FUTURE_START = 25;

export interface RentRollEscalation {
  date: string;
  amount: number;
}

export interface RentRollUnit {
  occupantName: string;
  isVacant: boolean;
  unitRef: string;
  propertyCode: string;
  sqft: number;
  leaseFrom: string | null;
  leaseTo: string | null;
  baseRent: number;
  annualRent: number;
  annualRentPerSqft: number;
  lastIncreaseDate: string | null;
  lastIncreaseAmount: number;
  opexMonth: number;
  opexPerSqft: number;
  reTaxMonth: number;
  reTaxPerSqft: number;
  otherMonth: number;
  otherPerSqft: number;
  grossRentTotal: number;
  grossRentPerSqft: number;
  futureEscalations: RentRollEscalation[];
}

export interface RentRollProperty {
  propertyCode: string;
  reportedPropertyName: string;
  totalSqft: number;
  occupiedSqft: number;
  vacantSqft: number;
  units: RentRollUnit[];
}

export interface RentRollData {
  id: string;
  uploadedAt: string;
  reportFrom: string;
  reportTo: string;
  properties: RentRollProperty[];
}

const UNIT_REF_RE = /^\d{4}-/;
const DATE_RE     = /^\d{1,2}\/\d{1,2}\/\d{2,4}$/;

const KNOWN_CODES = new Set(PROPERTY_DEFS.map((p) => p.id.toUpperCase()));

function norm(v: any): string {
  return String(v ?? "").trim();
}

function parseDateStr(v: any): string | null {
  if (v == null || v === "") return null;
  const s = norm(v);
  if (DATE_RE.test(s)) return s;
  // Handle Excel serial date numbers
  if (typeof v === "number" && v > 10000 && v < 100000) {
    try {
      const formatted = XLSX.SSF.format("MM/DD/YYYY", v);
      if (DATE_RE.test(formatted)) return formatted;
    } catch { /* ignore */ }
  }
  return null;
}

export function parseRentRollExcel(
  buf: ArrayBuffer | Buffer
): Omit<RentRollData, "id" | "uploadedAt"> {
  const wb = XLSX.read(buf, {
    type: buf instanceof ArrayBuffer ? "array" : "buffer",
    cellText: false,
    cellDates: false,
    raw: false,
  });

  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: "",
  });

  // ── Extract report date range ──────────────────────────────────────────────
  let reportFrom = "";
  let reportTo   = "";
  for (let i = 0; i < Math.min(25, rows.length); i++) {
    const rowStr = rows[i].map(norm).join(" ");
    const m = rowStr.match(
      /REPORT\s+DATE\s+FROM\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+TO\s+(\d{1,2}\/\d{1,2}\/\d{4})/i
    );
    if (m) {
      reportFrom = m[1];
      reportTo   = m[2];
      break;
    }
  }

  // ── Parse property sections and unit rows ──────────────────────────────────
  const propertiesMap = new Map<string, RentRollProperty>();
  let currentSectionName = "";

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] || [];

    // Detect PROPERTY: header rows (not "PROPERTY TOTALS")
    for (const cell of row) {
      const s = norm(cell);
      const m = s.match(/^PROPERTY\s*:\s*(.+)/i);
      if (m) {
        currentSectionName = m[1].trim();
        break;
      }
    }

    // Only process rows with a unit reference in column I
    const unitRefCell = norm(row[COL_UNIT_REF]);
    if (!UNIT_REF_RE.test(unitRefCell)) continue;

    // Property code = leading digits before first dash
    const code = unitRefCell.split("-")[0].toUpperCase();

    // Skip properties not in our known list
    if (!KNOWN_CODES.has(code)) continue;

    // Create property entry if needed
    if (!propertiesMap.has(code)) {
      const propDef = PROPERTY_DEFS.find((p) => p.id.toUpperCase() === code);
      propertiesMap.set(code, {
        propertyCode: code,
        reportedPropertyName: currentSectionName || propDef?.name || code,
        totalSqft: 0,
        occupiedSqft: 0,
        vacantSqft: 0,
        units: [],
      });
    }

    const prop = propertiesMap.get(code)!;

    // Parse unit fields
    const rawOccupant = norm(row[COL_OCCUPANT]);
    const isVacant    = !rawOccupant || rawOccupant.toUpperCase().includes("VACANT");
    const occupantName = isVacant ? "Vacant" : rawOccupant;

    const sqft               = toNumber(row[COL_SQFT]);
    const leaseFrom          = parseDateStr(row[COL_LEASE_FROM]);
    const leaseTo            = parseDateStr(row[COL_LEASE_TO]);
    const baseRent           = toNumber(row[COL_BASE_RENT]);
    const annualRent         = toNumber(row[COL_ANNUAL_RENT]);
    const annualRentPerSqft  = toNumber(row[COL_ANNUAL_SQFT]);
    const lastIncreaseDate   = parseDateStr(row[COL_INCR_DATE]);
    const lastIncreaseAmount = toNumber(row[COL_INCR_AMT]);
    const opexMonth          = toNumber(row[COL_OPEX_MONTH]);
    const opexPerSqft        = toNumber(row[COL_OPEX_SQFT]);
    const reTaxMonth         = toNumber(row[COL_RETAX_MONTH]);
    const reTaxPerSqft       = toNumber(row[COL_RETAX_SQFT]);
    const otherMonth         = toNumber(row[COL_OTHER_MONTH]);
    const otherPerSqft       = toNumber(row[COL_OTHER_SQFT]);
    const grossRentTotal     = toNumber(row[COL_GROSS_TOTAL]);
    const grossRentPerSqft   = toNumber(row[COL_GROSS_SQFT]);

    // Future escalations: dates appear before amounts in the grouped layout
    const futureDates:   string[] = [];
    const futureAmounts: number[] = [];
    for (let c = COL_FUTURE_START; c < row.length; c++) {
      const s = norm(row[c]);
      if (!s) continue;
      if (DATE_RE.test(s)) {
        futureDates.push(s);
      } else {
        const n = toNumber(s);
        if (n > 0) futureAmounts.push(n);
      }
    }
    const futureEscalations: RentRollEscalation[] = futureDates.map((date, i) => ({
      date,
      amount: futureAmounts[i] ?? 0,
    }));

    prop.units.push({
      occupantName,
      isVacant,
      unitRef: unitRefCell,
      propertyCode: code,
      sqft,
      leaseFrom,
      leaseTo,
      baseRent,
      annualRent,
      annualRentPerSqft,
      lastIncreaseDate,
      lastIncreaseAmount,
      opexMonth,
      opexPerSqft,
      reTaxMonth,
      reTaxPerSqft,
      otherMonth,
      otherPerSqft,
      grossRentTotal,
      grossRentPerSqft,
      futureEscalations,
    });

    prop.totalSqft += sqft;
    if (isVacant) {
      prop.vacantSqft += sqft;
    } else {
      prop.occupiedSqft += sqft;
    }
  }

  // Sort properties by code
  const properties = Array.from(propertiesMap.values()).sort((a, b) =>
    a.propertyCode.localeCompare(b.propertyCode)
  );

  return { reportFrom, reportTo, properties };
}

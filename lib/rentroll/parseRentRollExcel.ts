import * as XLSX from "xlsx";
import { toNumber } from "../utils";
import { PROPERTY_DEFS } from "../properties/data";

/**
 * Rent Roll Excel Parser
 *
 * Confirmed column layout (Korman Commercial Properties rent roll format):
 *   Column B   (index  1): Occupant Name — merged B:G  (or "*** VACANT ***")
 *   Column I   (index  8): Unit Reference Number  e.g. "1100-34-CU"
 *   Column M   (index 12): Square Feet — merged M:N
 *   Column P   (index 15): Lease Term From — merged P:Q
 *   Column R   (index 17): Lease Term To — merged R:T
 *   Column U   (index 20): Base Rent / month — merged U:X
 *   Column AL  (index 37): CAM (Operating Expense) / month — merged AL:AM
 *   Column AS  (index 44): Real Estate Tax / month — merged AS:AV
 *   Column BB  (index 53): Other / month — merged BB:BC
 *
 * Property code = first segment of unit ref before the first dash.
 * Only units whose property code matches a known entry in PROPERTY_DEFS are included.
 */

const COL_OCCUPANT    =  1; // B  (merged B:G)
const COL_UNIT_REF    =  8; // I
const COL_SQFT        = 12; // M  (merged M:N)
const COL_LEASE_FROM  = 15; // P  (merged P:Q)
const COL_LEASE_TO    = 17; // R  (merged R:T)
const COL_BASE_RENT   = 20; // U  (merged U:X)
const COL_OPEX_MONTH  = 39; // AN (merged AN:AR) — CAM
const COL_RETAX_MONTH = 48; // AW (merged AW:AZ) — RE Tax
const COL_OTHER_MONTH = 53; // BB (merged BB:BC) — Other

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
  // JavaScript Date object (when cellDates: true + raw: true)
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    const mo = String(v.getMonth() + 1).padStart(2, "0");
    const dy = String(v.getDate()).padStart(2, "0");
    return `${mo}/${dy}/${v.getFullYear()}`;
  }
  const s = norm(v);
  if (DATE_RE.test(s)) return s;
  // Excel serial date number fallback
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
    cellDates: true,  // dates come through as Date objects
    raw: true,
  });

  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,  // keep raw types so Date objects and numbers are preserved
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

    const sqft      = toNumber(row[COL_SQFT]);
    const leaseFrom = parseDateStr(row[COL_LEASE_FROM]);
    const leaseTo   = parseDateStr(row[COL_LEASE_TO]);
    const baseRent  = toNumber(row[COL_BASE_RENT]);
    const opexMonth  = toNumber(row[COL_OPEX_MONTH]);
    const reTaxMonth = toNumber(row[COL_RETAX_MONTH]);
    const otherMonth = toNumber(row[COL_OTHER_MONTH]);

    prop.units.push({
      occupantName,
      isVacant,
      unitRef: unitRefCell.replace(/-CU$/i, ""),
      propertyCode: code,
      sqft,
      leaseFrom,
      leaseTo,
      baseRent,
      annualRent:         baseRent * 12,
      annualRentPerSqft:  sqft > 0 ? (baseRent * 12) / sqft : 0,
      lastIncreaseDate:   null,
      lastIncreaseAmount: 0,
      opexMonth,
      opexPerSqft:    sqft > 0 ? (opexMonth * 12) / sqft : 0,
      reTaxMonth,
      reTaxPerSqft:   sqft > 0 ? (reTaxMonth * 12) / sqft : 0,
      otherMonth,
      otherPerSqft:   sqft > 0 ? (otherMonth * 12) / sqft : 0,
      grossRentTotal: baseRent + opexMonth + reTaxMonth + otherMonth,
      grossRentPerSqft: sqft > 0 ? ((baseRent + opexMonth + reTaxMonth + otherMonth) * 12) / sqft : 0,
      futureEscalations: [],
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

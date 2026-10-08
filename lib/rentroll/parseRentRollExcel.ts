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

/**
 * The row's populated cells from SQUARE FEET rightward, in column order.
 *
 * The money columns after base rent are read from the END of this list, not by
 * index, because a value floats inside its merged header block and the drift is
 * NOT a constant: measured against the header row, base rent moves 2 columns,
 * rent/sq-ft 1 and gross 4. What IS fixed is the ORDER and the count — every
 * tenant row ends with the same eight figures:
 *
 *   … CAM/mo, CAM/sf, RET/mo, RET/sf, Other/mo, Other/sf, Gross, Gross/sf
 *
 * so counting back from the last cell finds each one wherever it landed.
 *
 * Checked against the whole August 2026 roll — 441 tenant rows across 46
 * properties. Against the fixed indices this changes CAM on 1 row, RET on 1 and
 * OTHER on 42, and all 42 are the same error: column 53 is where GROSS RENTS
 * begins, so a row whose Other sat at 51 had its GROSS read as its Other.
 * 1100's Ferry Good Treats showed $2,159 of "other expense" that was its whole
 * gross rent; 2000's clearing rows showed their entire billing as Other.
 */
function tailValues(row: unknown[]): unknown[] {
  const out: unknown[] = [];
  for (let c = COL_SQFT; c < 62; c++) {
    const v = row[c];
    if (v === null || v === undefined || String(v).trim() === "") continue;
    out.push(v);
  }
  return out;
}

/** The n-th value counting back from the end (1 = last). 0 when the row is too
 *  short to hold the full run — a malformed row must not read a neighbour's
 *  figure, and every such row in the sample is an all-zero vacancy anyway. */
function fromEnd(tail: unknown[], n: number): number {
  return tail.length >= 10 ? toNumber(tail[tail.length - n]) : 0;
}

/** The first populated numeric cell in [from, to) — how a value is found when
 *  it floats inside a merged header block rather than sitting at one index. */
function firstNumberIn(row: unknown[], [from, to]: readonly [number, number]): number {
  for (let c = from; c < to; c++) {
    const raw = row[c];
    if (raw === null || raw === undefined || String(raw).trim() === "") continue;
    return toNumber(raw);
  }
  return 0;
}

const COL_OCCUPANT    =  1; // B  (merged B:G)
const COL_UNIT_REF    =  8; // I
const COL_SQFT        = 12; // M  (merged M:N)
const COL_LEASE_FROM  = 15; // P  (merged P:Q)
const COL_LEASE_TO    = 17; // R  (merged R:T)
// A VALUE FLOATS INSIDE ITS MERGED BLOCK, so a single index cannot find it.
//
// The report's own header row declares "UNIT INFO / BASE RENT" at column 18,
// but the value lands at 20 for a tenant WITH lease dates and at 18 for one
// WITHOUT — the dates in the preceding block push it right. Every tenant at
// every property had lease dates except one, so a hardcoded 20 worked
// everywhere it was ever looked at.
//
// 1100's Ferry Good Treats is the exception: no lease dates, $2,000 of base
// rent at column 18, and the parser read column 20 and found nothing. The
// property's rent roll totalled $3,054.38 against Skyline's $5,054.38 — the
// missing $2,000 exactly — and the operating statement then reported the
// correctly-billed $2,000 as "UNEXPECTED". The two VACANT rows above it sit at
// 18 as well, which is why this survived: their base rent is 0 either way.
//
// So base rent is the first populated cell in the header's own span, 18 up to
// but not including 22 ("PRORATED BASE RENT ANNUAL"). Bounded by the next
// header column, it cannot reach past its own field.
const COL_BASE_RENT   = 20; // U  (merged U:X) — kept for the fixed-position read
const BASE_RENT_SPAN: readonly [number, number] = [18, 22];
// Superseded by the end-anchored reads in `tailValues` — kept only as the
// record of where the header row puts each block, since the constants are what
// a reader reaches for first and they are no longer where the value is:
//   CAM header col 37 (value drifts to 39), RET 44 (to 48), Other 51 (to 53,
//   which is where GROSS RENTS starts — the collision that caused the bug).
import { amenityFor, type AmenityInfo } from "./amenities";


export interface RentRollEscalation {
  date: string;
  amount: number;
}

export interface RentRollUnit {
  occupantName: string;
  isVacant: boolean;
  unitRef: string;
  propertyCode: string;
  /** Set for in-house amenity units (training room, conference center, etc.).
   *  These count as occupied for sqft accounting but aren't real tenants. */
  amenity?: AmenityInfo;
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

/** A rent-roll row with a valid unit-ref shape but a property code the portal
 *  doesn't know (not in PROPERTY_DEFS). Captured instead of silently dropped so
 *  the import can call out "these units were skipped." */
export interface RentRollUnknownUnit {
  code: string;
  unitRef: string;
  occupantName: string;
  sqft: number;
  /** The report section the row sat under, for context. */
  section: string;
}

export interface RentRollData {
  id: string;
  uploadedAt: string;
  /** Display label of the user who uploaded — captured at POST time
   *  so the rent-roll page can show "Last imported … by NANCY".
   *  Optional because pre-existing uploads predate this field. */
  uploadedBy?: string | null;
  reportFrom: string;
  reportTo: string;
  properties: RentRollProperty[];
  /** Rows skipped because their property code isn't recognized. Optional —
   *  pre-existing uploads predate this field. */
  unknownUnits?: RentRollUnknownUnit[];
}

const UNIT_REF_RE = /^[A-Z0-9]{4}-/i;
const DATE_RE     = /^\d{1,2}\/\d{1,2}\/\d{2,4}$/;

const KNOWN_CODES = new Set(PROPERTY_DEFS.map((p) => p.id.toUpperCase()));

// Strip trailing store / location / branch numbers from a tenant name.
// Matches a "#…" suffix at end of string, optionally preceded by a
// generic locator word ("Store", "Location", "Branch", "Unit", "Shop",
// "Site"). Leaves names alone when the # is at the start of the name
// (e.g. "#1 Chinese Buffet") or when no #-suffix is present.
//
//   "Starbucks #1234"        → "Starbucks"
//   "Walgreens Store #234"   → "Walgreens"
//   "Wells Fargo Branch #5"  → "Wells Fargo"
//   "Target #T-2345"         → "Target"
//   "AT&T"                   → "AT&T"        (unchanged)
//   "#1 Chinese Buffet"      → "#1 Chinese Buffet" (unchanged)
export function stripStoreNumber(name: string): string {
  return name
    .replace(/\s+(?:store|location|loc\.?|branch|unit|shop|site)?\s*#\s*[\w.-]+\s*$/i, "")
    .trim();
}

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
  const unknownUnits: RentRollUnknownUnit[] = [];
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

    // Capture — don't silently drop — rows whose property code we don't know.
    // A valid-looking unit ref under an unrecognized code means a whole
    // building's tenants would otherwise vanish from the roll without a trace.
    if (!KNOWN_CODES.has(code)) {
      const rawOcc = norm(row[COL_OCCUPANT]);
      unknownUnits.push({
        code,
        unitRef: unitRefCell.replace(/-CU$/i, ""),
        occupantName: rawOcc ? stripStoreNumber(rawOcc) : "",
        sqft: toNumber(row[COL_SQFT]),
        section: currentSectionName || "",
      });
      continue;
    }

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

    const unitRef = unitRefCell.replace(/-CU$/i, "");

    // Amenity override (training room, conference center, etc.) takes
    // precedence over whatever the Excel says — these are in-house units
    // that should always render with their canonical label and count as
    // occupied.
    const amenity = amenityFor(unitRef);

    // Parse unit fields
    const rawOccupant = norm(row[COL_OCCUPANT]);
    const isVacant    = amenity
      ? false
      : !rawOccupant || rawOccupant.toUpperCase().includes("VACANT");
    const occupantName = amenity
      ? amenity.label
      : isVacant
        ? "Vacant"
        : stripStoreNumber(rawOccupant);

    const sqft      = toNumber(row[COL_SQFT]);
    const leaseFrom = parseDateStr(row[COL_LEASE_FROM]);
    const leaseTo   = parseDateStr(row[COL_LEASE_TO]);
    const baseRent  = firstNumberIn(row, BASE_RENT_SPAN);
    // Counted back from the row's last figure — see `tailValues`. The trailing
    // run is Gross/sf, Gross, Other/sf, Other, RET/sf, RET, CAM/sf, CAM.
    const tail = tailValues(row);
    const opexMonth  = fromEnd(tail, 8);
    const reTaxMonth = fromEnd(tail, 6);
    const otherMonth = fromEnd(tail, 4);

    prop.units.push({
      occupantName,
      isVacant,
      unitRef,
      amenity: amenity ?? undefined,
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

  return { reportFrom, reportTo, properties, unknownUnits };
}

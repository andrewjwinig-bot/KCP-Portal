// Insurance Statement of Values (SOV) — the carrier's / broker's workbook,
// read, matched to our properties, and filled back in with the portal's data.
//
// THE FILE IS THEIRS, NOT OURS. It is the broker's form, returned in the
// broker's layout: we write values into the cells they already have and touch
// nothing else — no letterhead, no theme, no re-ordered rows, and never a
// formula cell (Price per SF, Total and the totals row stay their formulas).
// Like a machine import, theming it would break it for the person who reads
// it back, so do NOT move it onto `lib/excel/theme.ts`'s look.
//
// The form's rows are INSURED LOCATIONS, not properties. Most properties are
// one row, but Trust #4 (8200) is two (the Four Seasons and the McDonald's
// pad) and Butler & Main (9000) is three buildings. Property-level data (the
// rent roll's GLA, a property's facts) can only describe a property that is
// ONE row, so a property spread over several rows is left exactly as the sheet
// has it and the page says so — splitting a property's figure across rows
// would be a guess written onto an insurance application.

import type ExcelJS from "exceljs";

// ── Columns ───────────────────────────────────────────────────────────────

export type SovColumnKey =
  | "locationId" | "locationName" | "address" | "city" | "state" | "postalCode" | "country"
  | "construction" | "occupancy" | "yearBuilt" | "yearUpgrade" | "roofAge"
  | "stories" | "buildings" | "sprinklered" | "units" | "floorArea" | "parkingSqft"
  | "pricePerSqft" | "building" | "contents" | "fineArts" | "signage" | "biValues" | "total"
  | "pctSprinklered" | "basement" | "floodZone" | "protection" | "notes";

/** Header text → key. Matched on the header folded to lowercase letters and
 *  digits, so "# of Stories" / "#of stories" and the form's own "Signange"
 *  typo all land. First match wins, so the more specific tests come first. */
const HEADER_RULES: [SovColumnKey, (h: string) => boolean][] = [
  ["locationId", (h) => h === "locationid"],
  ["locationName", (h) => h === "locationname"],
  ["address", (h) => h.startsWith("address")],
  ["city", (h) => h === "city"],
  ["state", (h) => h === "state"],
  ["postalCode", (h) => h.startsWith("postal") || h === "zip" || h === "zipcode"],
  ["country", (h) => h === "country"],
  ["construction", (h) => h.startsWith("construction")],
  ["occupancy", (h) => h.startsWith("occupancy")],
  ["yearBuilt", (h) => h === "yearbuilt"],
  ["yearUpgrade", (h) => h.startsWith("yearupgrade") || h.startsWith("yearrenovat")],
  ["roofAge", (h) => h.startsWith("roofage")],
  ["stories", (h) => h.includes("stories")],
  ["buildings", (h) => h.includes("ofbuildings")],
  ["sprinklered", (h) => h === "sprinklered"],
  ["units", (h) => h === "units"],
  ["floorArea", (h) => h.startsWith("floorarea")],
  ["parkingSqft", (h) => h.startsWith("parking")],
  ["pricePerSqft", (h) => h.startsWith("pricepersquare") || h.startsWith("pricepersf")],
  ["building", (h) => h === "building"],
  ["contents", (h) => h === "contents"],
  ["fineArts", (h) => h === "finearts"],
  ["signage", (h) => h === "signage" || h === "signange"],
  ["biValues", (h) => h.startsWith("bivalue") || h.startsWith("businessincome")],
  ["total", (h) => h === "total"],
  ["basement", (h) => h === "basement"],
  ["floodZone", (h) => h.includes("floodzone")],
  ["protection", (h) => h.startsWith("protection")],
  ["notes", (h) => h === "notes"],
];

export const foldHeader = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function headerKey(text: string): SovColumnKey | null {
  const h = foldHeader(text);
  if (!h) return null;
  // "% Sprinklered" and "Sprinklered" fold to the same letters; the % is the
  // only thing telling the share apart from the description.
  if (h.includes("sprinklered") && /%|percent|pct/i.test(text)) return "pctSprinklered";
  for (const [key, test] of HEADER_RULES) if (test(h)) return key;
  return null;
}

/** The columns the portal can fill, in the form's order, with their labels
 *  as the page shows them. Everything else on the form (addresses, the dollar
 *  values, notes) is the broker's and is passed through untouched. */
export const FILLABLE: { key: SovColumnKey; label: string; numeric?: boolean }[] = [
  { key: "construction", label: "Construction" },
  { key: "occupancy", label: "Occupancy" },
  { key: "yearBuilt", label: "Year Built" },
  { key: "yearUpgrade", label: "Year Upgrade" },
  { key: "roofAge", label: "Roof Age" },
  { key: "stories", label: "Stories", numeric: true },
  { key: "buildings", label: "Buildings", numeric: true },
  { key: "sprinklered", label: "Sprinklered" },
  { key: "units", label: "Units", numeric: true },
  { key: "floorArea", label: "Floor Area", numeric: true },
  { key: "parkingSqft", label: "Parking SF", numeric: true },
  { key: "pctSprinklered", label: "% Sprinklered" },
  { key: "basement", label: "Basement" },
  { key: "floodZone", label: "Flood Zone" },
  { key: "protection", label: "Protection" },
  { key: "biValues", label: "BI Values", numeric: true },
];
export type FillableKey = (typeof FILLABLE)[number]["key"];

// ── Reading the form ─────────────────────────────────────────────────────

export type SovCellValue = string | number | null;

export type SovRow = {
  /** 1-based worksheet row. */
  row: number;
  values: Partial<Record<SovColumnKey, SovCellValue>>;
};

export type SovSheet = {
  sheetName: string;
  headerRow: number;
  /** Column number (1-based) of each recognised header. */
  columns: Partial<Record<SovColumnKey, number>>;
  rows: SovRow[];
  /** Sum of the Total column the form's own formula carries (cached), when it has one. */
  totalInsuredValue: number | null;
  /** Other sheets in the workbook (Vacant Land…) — passed through unchanged. */
  otherSheets: string[];
};

/** A cell's plain value: rich text joined, a formula's cached result. */
export function plainCell(v: ExcelJS.CellValue): SovCellValue {
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (v instanceof Date) return v.getFullYear();
  if (typeof v === "object") {
    if ("richText" in v && Array.isArray(v.richText)) return v.richText.map((r) => r.text).join("");
    if ("result" in v) {
      const r = (v as { result?: unknown }).result;
      return typeof r === "number" || typeof r === "string" ? r : null;
    }
    if ("text" in v && typeof (v as { text?: unknown }).text === "string") return (v as { text: string }).text;
  }
  return null;
}

const isBlank = (v: SovCellValue | undefined) => v == null || (typeof v === "string" && !v.trim());

/** Find the sheet and row carrying the form's header (Location Name +
 *  Construction Description), then read every location row below it up to the
 *  totals row. Rows with neither a name nor an address are spacers and skipped. */
export function readSov(wb: ExcelJS.Workbook): SovSheet | null {
  for (const ws of wb.worksheets) {
    for (let r = 1; r <= Math.min(ws.rowCount, 30); r++) {
      const columns: Partial<Record<SovColumnKey, number>> = {};
      ws.getRow(r).eachCell((cell, col) => {
        const text = plainCell(cell.value);
        if (typeof text !== "string") return;
        const key = headerKey(text);
        if (key && columns[key] == null) columns[key] = col;
      });
      if (columns.locationName == null || columns.construction == null) continue;

      const rows: SovRow[] = [];
      let totalInsuredValue: number | null = null;
      for (let i = r + 1; i <= ws.rowCount; i++) {
        const row = ws.getRow(i);
        const values: SovRow["values"] = {};
        for (const [key, col] of Object.entries(columns) as [SovColumnKey, number][]) {
          const v = plainCell(row.getCell(col).value);
          if (!isBlank(v)) values[key] = typeof v === "string" ? v.replace(/\s+$/, "") : v;
        }
        if (isBlank(values.locationName) && isBlank(values.address)) {
          // The totals row: blank labels, a number under Total.
          if (typeof values.total === "number") totalInsuredValue = values.total;
          continue;
        }
        rows.push({ row: i, values });
      }
      return {
        sheetName: ws.name,
        headerRow: r,
        columns,
        rows,
        totalInsuredValue,
        otherSheets: wb.worksheets.filter((w) => w !== ws).map((w) => w.name),
      };
    }
  }
  return null;
}

// ── Matching a row to a property ─────────────────────────────────────────

/** How each of the form's locations maps to a property code. Explicit on
 *  purpose: the form comes back every year with the same rows, a wrong match
 *  writes one building's facts onto another's application, and a new row that
 *  matches nothing is surfaced on the page rather than guessed at. Order
 *  matters — Office Works shares Building 5's address, so it is tested first. */
const LOCATION_RULES: { code: string; name?: RegExp; address?: RegExp }[] = [
  { code: "4900", name: /office\s*works/i },
  { code: "3610A", name: /neshaminy\s+condo/i },
  { code: "8200", address: /28(01|11)\s+cottman/i },
  { code: "5600", address: /6382\s+castor/i },
  { code: "7200", address: /6412.*castor/i },
  { code: "1100", address: /12300.*academy/i },
  { code: "7010", address: /12301.*academy/i },
  { code: "2300", address: /street\s+r(oa)?d/i },
  { code: "4500", address: /grays\s+ferry/i },
  { code: "7300", address: /7201\s+roosevelt/i },
  { code: "40A0", address: /2577\s+interplex/i },
  { code: "40B0", address: /2607\s+interplex/i },
  { code: "40C0", address: /2585\s+interplex/i },
  { code: "3610", address: /^\s*one\s+neshaminy/i },
  { code: "3620", address: /^\s*two\s+neshaminy/i },
  { code: "3640", address: /^\s*four\s+neshaminy/i },
  { code: "4050", address: /^\s*five\s+neshaminy/i },
  { code: "4060", address: /^\s*six\s+neshaminy/i },
  { code: "4070", address: /^\s*seven\s+neshaminy/i },
  { code: "4080", address: /^\s*eight\s+neshaminy/i },
  { code: "0800", name: /bellmawr|interstate\s+business/i },
  { code: "1500", address: /2448\s+island/i },
  { code: "9510", address: /germantown\s+pike/i },
  { code: "9000", name: /butler\s+and\s+main|butler\s*&\s*main/i },
];

export function matchLocation(values: SovRow["values"]): string | null {
  const name = String(values.locationName ?? "");
  const address = String(values.address ?? "");
  for (const rule of LOCATION_RULES) {
    if (rule.name && !rule.name.test(name)) continue;
    if (rule.address && !rule.address.test(address)) continue;
    return rule.code;
  }
  return null;
}

// ── What the portal knows ────────────────────────────────────────────────

/** Everything the portal can say about ONE property, already resolved to the
 *  form's vocabulary. `source` names where each figure came from, because the
 *  page shows it on the cell's hover. */
export type PortalFacts = Partial<Record<FillableKey, { value: string | number; source: string }>>;

/** A property's keyed facts (the property page's Building Facts) → the form's
 *  columns. Only what someone actually typed; a blank fact is no data. */
export const FACT_TO_COLUMN: [factKey: string, column: FillableKey][] = [
  ["constructionType", "construction"],
  ["occupancyDescription", "occupancy"],
  ["yearBuilt", "yearBuilt"],
  ["yearUpgrade", "yearUpgrade"],
  ["roofAge", "roofAge"],
  ["stories", "stories"],
  ["buildingCount", "buildings"],
  ["sprinklered", "sprinklered"],
  ["pctSprinklered", "pctSprinklered"],
  ["parkingSqft", "parkingSqft"],
  ["basement", "basement"],
  ["floodZone", "floodZone"],
  ["protection", "protection"],
];

export type RollSummary = {
  /** Rentable area on the current rent roll. */
  totalSqft: number;
  /** Suites on the roll, in-house amenity units excluded. */
  units: number;
  /** 12 × this month's billed rent + CAM + tax + other, every suite. */
  annualGross: number;
};

export function portalFactsFor(
  facts: Record<string, unknown> | null | undefined,
  roll: RollSummary | null | undefined,
): PortalFacts {
  const out: PortalFacts = {};
  for (const [fk, col] of FACT_TO_COLUMN) {
    const v = facts?.[fk];
    if (v == null) continue;
    if (typeof v === "number" && Number.isFinite(v)) out[col] = { value: v, source: "Property info" };
    else if (typeof v === "string" && v.trim()) out[col] = { value: v.trim(), source: "Property info" };
  }
  // Area and suite count are the rent roll's, as the property page's header
  // tiles show them — not facts, so there is one figure, not two.
  if (roll) {
    if (roll.totalSqft > 0) out.floorArea = { value: Math.round(roll.totalSqft), source: "Rent roll GLA" };
    if (roll.units > 0) out.units = { value: roll.units, source: "Rent roll suites" };
    if (roll.annualGross > 0) out.biValues = { value: Math.round(roll.annualGross), source: "Rent roll · 12 × monthly rent + recoveries" };
  }
  return out;
}

// ── The fill ─────────────────────────────────────────────────────────────

export type CellPlan = {
  key: FillableKey;
  sheet: SovCellValue;
  /** What will be written; equals `sheet` when nothing changes. */
  next: SovCellValue;
  changed: boolean;
  source?: string;
};

export type RowStatus = "matched" | "shared" | "unmatched" | "no-column";

export type RowPlan = {
  row: number;
  locationName: string;
  address: string;
  code: string | null;
  status: RowStatus;
  /** Rows sharing this row's property (for "shared"). */
  siblings: number;
  cells: CellPlan[];
};

/** Parse a typed value into what the cell should hold. Numbers stay numbers
 *  so the form's own formulas (Price per SF, Total) keep working; a percent is
 *  written as the fraction the form stores (1 = 100%). */
export function cellValueFor(key: FillableKey, v: string | number): SovCellValue {
  if (key === "pctSprinklered") {
    const s = String(v).trim();
    const n = Number(s.replace(/[%,\s]/g, ""));
    if (!Number.isFinite(n) || !s) return s;
    return s.endsWith("%") || n > 1 ? n / 100 : n;
  }
  const numericCol = FILLABLE.find((f) => f.key === key)?.numeric || key === "yearBuilt" || key === "yearUpgrade";
  if (typeof v === "number") return v;
  if (numericCol) {
    const n = Number(v.replace(/[,\s]/g, ""));
    if (v.trim() && Number.isFinite(n)) return n;
  }
  return v;
}

const norm = (v: SovCellValue | undefined): string => {
  if (v == null) return "";
  if (typeof v === "number") return String(Math.round(v * 10000) / 10000);
  const t = v.trim().replace(/\s+/g, " ").toLowerCase();
  const n = Number(t.replace(/,/g, ""));
  return t && Number.isFinite(n) ? String(Math.round(n * 10000) / 10000) : t;
};
export const sameValue = (a: SovCellValue | undefined, b: SovCellValue | undefined) => norm(a) === norm(b);

export type PlanOptions = {
  /** Replace BI values with the rent roll's annualised gross. Off by default:
   *  BI is a coverage decision (it may carry 18 months, percentage rent…), so
   *  the page offers the rent-roll figure rather than imposing it. */
  updateBi?: boolean;
};

export function planFill(
  sov: SovSheet,
  portal: Record<string, PortalFacts>,
  opts: PlanOptions = {},
): RowPlan[] {
  const codes = sov.rows.map((r) => matchLocation(r.values));
  const perCode = new Map<string, number>();
  for (const c of codes) if (c) perCode.set(c, (perCode.get(c) ?? 0) + 1);

  return sov.rows.map((r, i) => {
    const code = codes[i];
    const siblings = code ? perCode.get(code)! : 0;
    const status: RowStatus = !code ? "unmatched" : siblings > 1 ? "shared" : "matched";
    const facts = status === "matched" ? portal[code!] ?? {} : {};
    const cells: CellPlan[] = [];
    for (const f of FILLABLE) {
      if (sov.columns[f.key] == null) continue;
      const sheet = r.values[f.key] ?? null;
      const p = facts[f.key];
      const allowed = f.key !== "biValues" || opts.updateBi;
      if (!p || !allowed) {
        cells.push({ key: f.key, sheet, next: sheet, changed: false, source: p?.source });
        continue;
      }
      const next = cellValueFor(f.key, p.value);
      const changed = !sameValue(sheet, next);
      cells.push({ key: f.key, sheet, next: changed ? next : sheet, changed, source: p.source });
    }
    return {
      row: r.row,
      locationName: String(r.values.locationName ?? "").replace(/\s+/g, " ").trim(),
      address: String(r.values.address ?? "").replace(/\s+/g, " ").trim(),
      code,
      status,
      siblings,
      cells,
    };
  });
}

/** Write the plan into the form. Only cells that change are touched, and a
 *  cell holding a formula is never overwritten. Returns how many were written. */
export function applyFill(ws: ExcelJS.Worksheet, sov: SovSheet, plan: RowPlan[]): number {
  let written = 0;
  for (const r of plan) {
    for (const c of r.cells) {
      if (!c.changed) continue;
      const col = sov.columns[c.key];
      if (col == null) continue;
      const cell = ws.getRow(r.row).getCell(col);
      const cur = cell.value as unknown;
      if (cur && typeof cur === "object" && ("formula" in (cur as object) || "sharedFormula" in (cur as object))) continue;
      cell.value = c.next;
      written++;
    }
  }
  return written;
}

/** The sheet's values that could seed a property's EMPTY facts — the one-time
 *  bootstrap that makes property info the source of truth for next year's
 *  form. Only single-row properties (a shared property's rows disagree by
 *  design), only descriptive fields (area and suites come from the rent roll),
 *  and never over a fact someone already keyed. */
export function seedableFacts(
  sov: SovSheet,
  existing: Record<string, Record<string, unknown> | null | undefined>,
): Record<string, Record<string, string | number>> {
  const SEEDED: FillableKey[] = [
    "construction", "occupancy", "yearBuilt", "yearUpgrade", "roofAge", "stories", "buildings",
    "sprinklered", "pctSprinklered", "parkingSqft", "basement", "floodZone", "protection",
  ];
  const codes = sov.rows.map((r) => matchLocation(r.values));
  const perCode = new Map<string, number>();
  for (const c of codes) if (c) perCode.set(c, (perCode.get(c) ?? 0) + 1);

  const out: Record<string, Record<string, string | number>> = {};
  sov.rows.forEach((r, i) => {
    const code = codes[i];
    if (!code || perCode.get(code)! > 1) return;
    const have = existing[code] ?? {};
    for (const [fk, col] of FACT_TO_COLUMN) {
      if (!SEEDED.includes(col)) continue;
      const cur = have[fk];
      if (cur != null && String(cur).trim() !== "") continue;
      const v = r.values[col];
      if (v == null || (typeof v === "string" && !v.trim())) continue;
      let seed: string | number;
      if (fk === "yearBuilt") {
        // The fact is a number; "1948-50" or "@ 1970 Tenant owns bldg." is not.
        const n = typeof v === "number" ? v : Number(String(v).trim());
        if (!Number.isInteger(n) || n < 1700 || n > 2100) continue;
        seed = n;
      } else if (col === "pctSprinklered") {
        seed = typeof v === "number" ? `${Math.round(v * (v <= 1 ? 100 : 1))}%` : String(v).trim();
      } else {
        seed = typeof v === "number" ? String(v) : String(v).trim();
      }
      (out[code] ??= {})[fk] = seed;
    }
  });
  return out;
}

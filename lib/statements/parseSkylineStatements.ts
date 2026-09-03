import * as XLSX from "xlsx";
import type { ChargeCategory, StatementCharge, TenantStatement } from "./types";

/**
 * Skyline "Statement" report parser.
 *
 * Confirmed layout (Crystal Reports export, one block per tenant):
 *   Column W  (index 22): the unit reference on the block's first row
 *                          ("1100-34-CU"), then the bill-to block on the next
 *                          row (tenant name + address, newline-separated).
 *   Column A  (index  0): charge date, "MM/DD/YYYY"
 *   Column G  (index  6): charge description (also carries the control labels
 *                          DESCRIPTION / PREVIOUS MONTH ENDING BALANCE /
 *                          CURRENT CHARGES / TOTAL CURRENT)
 *   Column S  (index 18): AMOUNT DUE
 *   Column Y  (index 24): BALANCE (only populated on the balance rows)
 *
 * Two paging quirks the parser has to survive, both observed in the real
 * export:
 *   1. A long tenant runs onto extra pages — the unit-ref header repeats and
 *      the charge list simply continues.
 *   2. Crystal then RE-RENDERS the whole detail group again after the balance
 *      row (the same charges a second and third time).
 * The rule that handles both: a tenant's statement is everything from its first
 * header up to its "PREVIOUS MONTH ENDING BALANCE" row; once that row is seen
 * the tenant is closed and any later repeat of it is ignored. The reported
 * balance then ties to the summed charges to the cent, which `tiesOut` asserts.
 */

const COL_DATE = 0;
const COL_DESC = 6;
const COL_AMOUNT = 18;
const COL_BALANCE = 24;
const COL_UNITREF = 22;

/** Control labels in the description column that aren't charges. */
const BALANCE_LABEL = "PREVIOUS MONTH ENDING BALANCE";
const CONTROL = new Set(["DESCRIPTION", "CURRENT CHARGES", "TOTAL CURRENT", "DATE", "AMOUNT DUE", "BALANCE"]);

/** A unit ref cell: "1100-34-CU", "7010-12311-CU". Skyline suffixes the charge
 *  type; the rest of the app keys on the ref WITHOUT it (see the rent-roll
 *  parser and office/assemble's `skylineUnitOf`), so we strip it the same way. */
const UNIT_REF_RE = /^(\d{3,6})-[A-Za-z0-9._/-]+$/;

const cell = (row: unknown[] | undefined, i: number): string =>
  String(row?.[i] ?? "").replace(/\s+/g, " ").trim();

const rawCell = (row: unknown[] | undefined, i: number): string => String(row?.[i] ?? "").trim();

function toAmount(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[$,\s]/g, "").replace(/^\((.*)\)$/, "-$1"));
  return Number.isFinite(n) ? n : null;
}

/** "MM/DD/YYYY" → "YYYY-MM-DD". Anything else → null. */
export function toISODate(s: string): string | null {
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const yr = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const mo = Number(m[1]), da = Number(m[2]);
  if (mo < 1 || mo > 12 || da < 1 || da > 31) return null;
  return `${yr}-${String(mo).padStart(2, "0")}-${String(da).padStart(2, "0")}`;
}

/** The recon year a "2025 Year End CAM Adjustment" / "2024 CAM Reconciliation"
 *  line settles — so the portal can link the line to that annual statement. */
function reconYearOf(desc: string): number | undefined {
  if (!/reconcil|year\s*end|adjustment/i.test(desc)) return undefined;
  const m = desc.match(/(20\d{2})/);
  return m ? Number(m[1]) : undefined;
}

/**
 * Bucket a Skyline charge description. Order matters — "2025 Year End CAM
 * Adjustment" must land in CAM, not in the estimate bucket, and the utility
 * descriptions are free text the property managers type, so they're matched
 * loosely.
 */
export function classifyCharge(desc: string, amount: number): ChargeCategory {
  const d = desc.toLowerCase();
  if (/open credit/.test(d)) return "credit";
  if (/^u\s*&\s*o\b|use\s*&\s*occupancy|use and occupancy/.test(d)) return "uando";
  if (/water|sewer|elec|gas\b|\bpgw\b|\bpeco\b|\baqua\b|utilit|trash|hvac charge/.test(d)) return "utilities";
  if (/\bins(urance)?\b/.test(d)) return "insurance";
  if (/\bret\b|real\s*estate\s*tax/.test(d)) return "ret";
  if (/\bcam\b|common\s*area/.test(d)) return "cam";
  if (/\brent(al)?s?\b/.test(d)) return "rent";
  if (amount < 0) return "credit";
  return "other";
}

const sumCents = (cs: StatementCharge[]): number =>
  Math.round(cs.reduce((a, c) => a + c.amount, 0) * 100) / 100;

const sameCharge = (a: StatementCharge, b: StatementCharge): boolean =>
  a.dateISO === b.dateISO && a.description === b.description && a.amount === b.amount;

/**
 * Undo Crystal's repeated detail group.
 *
 * On some tenants the report renders the whole charge list two, three or four
 * times over before printing the balance (observed on a 4-page tenant whose
 * charges came through exactly doubled). The list is then k identical copies of
 * the real one, so we look for the smallest such copy — but only accept it when
 * it reconciles to Skyline's own reported balance, which keeps a tenant who
 * genuinely happens to be billed two identical halves from being halved.
 */
export function dropRepeatedGroups(charges: StatementCharge[], reportedBalance: number): StatementCharge[] {
  const ties = (cs: StatementCharge[]) => Math.abs(sumCents(cs) - reportedBalance) < 0.011;
  if (ties(charges)) return charges;
  const n = charges.length;
  for (let k = 2; k <= 6; k++) {
    if (n < k * 1 || n % k !== 0) continue;
    const len = n / k;
    let periodic = true;
    for (let i = len; i < n && periodic; i++) periodic = sameCharge(charges[i], charges[i % len]);
    if (!periodic) continue;
    const head = charges.slice(0, len);
    if (ties(head)) return head;
  }
  return charges;
}

export type ParsedStatements = {
  statements: TenantStatement[];
  /** Month the statement speaks as of ("YYYY-MM"), from the newest charge date. */
  period: string | null;
  /** Tenants whose charges don't sum to Skyline's reported balance. */
  mismatched: string[];
};

/** Parse one Skyline Statement export (.xls or .xlsx) into per-tenant records. */
export function parseSkylineStatements(buf: ArrayBuffer | Buffer): ParsedStatements {
  const wb = XLSX.read(buf, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("The workbook has no sheets.");
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, raw: true, defval: null });

  const byUnit = new Map<string, TenantStatement>();
  const closed = new Set<string>();
  const order: string[] = [];
  let current: string | null = null;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] as unknown[];

    // ── Block header: the unit ref, with the bill-to block on the next row ──
    const ref = cell(row, COL_UNITREF).toUpperCase();
    const m = ref.match(UNIT_REF_RE);
    if (m) {
      // "2300-1817-CU" → portal ref "2300-1817", suite "1817".
      const portalRef = ref.replace(/-CU$/, "");
      current = portalRef;
      if (!byUnit.has(current)) {
        const billTo = rawCell(rows[i + 1] as unknown[], COL_UNITREF)
          .split("\n").map((s) => s.trim()).filter(Boolean);
        byUnit.set(current, {
          unitRef: portalRef,
          skylineUnitRef: ref,
          propertyCode: m[1],
          suite: portalRef.slice(m[1].length + 1),
          tenantName: billTo[0] ?? "",
          address: billTo.slice(1),
          charges: [],
          reportedBalance: 0,
          chargeTotal: 0,
          tiesOut: true,
        });
        order.push(current);
      }
      continue;
    }

    if (!current) continue;
    const desc = cell(row, COL_DESC);
    if (!desc) continue;

    // ── Balance row closes the tenant: everything after is a Crystal re-render ──
    if (desc.toUpperCase() === BALANCE_LABEL) {
      const rec = byUnit.get(current);
      if (rec && !closed.has(current)) {
        rec.reportedBalance = toAmount((row as unknown[])[COL_BALANCE]) ?? 0;
        closed.add(current);
      }
      continue;
    }
    if (CONTROL.has(desc.toUpperCase()) || desc.toUpperCase().startsWith("TOTAL CURRENT")) continue;
    if (closed.has(current)) continue;

    const amount = toAmount((row as unknown[])[COL_AMOUNT]);
    if (amount === null) continue;

    const rec = byUnit.get(current)!;
    // Skyline emits full float noise (312.90000000000003) — money is cents.
    const cents = Math.round(amount * 100) / 100;
    const charge: StatementCharge = {
      dateISO: toISODate(cell(row, COL_DATE)),
      description: desc,
      amount: cents,
      category: classifyCharge(desc, cents),
    };
    const ry = reconYearOf(desc);
    if (ry) charge.reconYear = ry;
    rec.charges.push(charge);
  }

  const statements: TenantStatement[] = [];
  const mismatched: string[] = [];
  for (const key of order) {
    const rec = byUnit.get(key)!;
    // A tenant with nothing open gets no balance row at all — that's a $0
    // account, not a mismatch.
    if (closed.has(key)) rec.charges = dropRepeatedGroups(rec.charges, rec.reportedBalance);
    rec.chargeTotal = sumCents(rec.charges);
    if (!closed.has(key)) rec.reportedBalance = rec.chargeTotal;
    rec.tiesOut = Math.abs(rec.chargeTotal - rec.reportedBalance) < 0.011;
    if (!rec.tiesOut) mismatched.push(rec.unitRef);
    statements.push(rec);
  }

  return { statements, period: periodOf(statements), mismatched };
}

/** The statement month — the newest charge date across the export. */
export function periodOf(statements: TenantStatement[]): string | null {
  let max: string | null = null;
  for (const s of statements) {
    for (const c of s.charges) {
      if (c.dateISO && (max === null || c.dateISO > max)) max = c.dateISO;
    }
  }
  return max ? max.slice(0, 7) : null;
}

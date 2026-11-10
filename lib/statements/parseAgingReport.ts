// Skyline's "Aging Report (Detailed)" — every tenant's open items as of the day
// it was run, one line per charge AND per credit, each with its charge code,
// description, date and aging bucket (owner, 11/2026: "this will show current
// detail of open credits and open charges. right now we just have open credits
// as a total"). The laser statement prints credits as one undated "Open
// Credits" total; this report itemizes them — "2025 Year End CAM Adjustment,
// 04/30/2026, (1,580.47)" — which is what tells Tami where a credit came from
// and how long it has been open.
//
// The .xls is a Crystal Reports rendering with two traps, both handled here:
//   1. A tenant's charge lines arrive as MULTI-LINE CELLS — one cell holds every
//      code, another every description, another every date, and each aging
//      bucket column holds that bucket's amounts, one per line, TOP-ALIGNED with
//      trailing blanks trimmed. Line i's amount is whichever bucket has a figure
//      at index i.
//   2. Only the FIRST property's header ("Property : 1100") survives the
//      export. Every later property is just a run of tenants closed by a
//      "PROPERTY TOTALS" row, so the property code is recovered afterwards
//      (`resolveAgingProperties`) from the suites and names the portal already
//      knows — never guessed from order.
//
// Pure — no storage, no network.

import * as XLSX from "xlsx";
import { classifyCharge, toISODate } from "./parseSkylineStatements";
import type { ChargeCategory } from "./types";

export const AGING_BUCKETS = ["1–30 days", "31–60 days", "61–90 days", "Over 90 days"] as const;

export type AgingLine = {
  /** Skyline's charge code, e.g. "YEC", "RNT", "PPD". */
  code: string;
  description: string;
  dateISO: string | null;
  /** Positive = owed, negative = a credit on account. */
  amount: number;
  /** 0 = 1–30 days … 3 = over 90 days, as Skyline aged it on the run date. */
  bucket: number;
  category: ChargeCategory;
};

export type AgingTenant = {
  /** Canonical unit ref once the property is known, e.g. "4050-113". Null
   *  while unresolved. */
  unitRef: string | null;
  propertyCode: string | null;
  /** The suite exactly as the report printed it, e.g. "113". */
  suite: string;
  tenantName: string;
  /** "CURR" for a current tenant; Skyline also prints former occupants. */
  unitType: string;
  contact: string | null;
  phone: string | null;
  depositsHeld: number;
  balanceDue: number;
  lines: AgingLine[];
  /** The lines add to Skyline's own Balance Due (within a cent). */
  tiesOut: boolean;
};

export type AgingBlock = {
  /** The property code printed in the header — only the first block has one. */
  headerCode: string | null;
  headerName: string | null;
  tenants: AgingTenant[];
};

export type ParsedAging = {
  /** "as of" date on the report, YYYY-MM-DD. */
  asOfISO: string | null;
  /** When Skyline ran it (the report's own date + time), ISO. */
  runAt: string | null;
  blocks: AgingBlock[];
};

const s = (v: unknown) => String(v ?? "").replace(/\r/g, "");
const amountOf = (v: string): number | null => {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t.replace(/[$,\s]/g, "").replace(/^\((.*)\)$/, "-$1"));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};
const lines = (v: unknown) => s(v).split("\n").map((x) => x.trim());
const isCode = (x: string) => /^[A-Z0-9&]{1,5}$/.test(x);
const isDate = (x: string) => /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(x);

function runAtOf(dateText: string, timeText: string): string | null {
  const d = toISODate(dateText.trim());
  if (!d) return null;
  const m = timeText.trim().match(/^(\d{1,2}):(\d{2}):(\d{2})\s*([AP]M)$/i);
  if (!m) return `${d}T12:00:00${etOffset(d)}`;
  let h = Number(m[1]) % 12;
  if (/p/i.test(m[4])) h += 12;
  return `${d}T${String(h).padStart(2, "0")}:${m[2]}:${m[3]}${etOffset(d)}`;
}

/** Skyline prints Eastern time with no zone — "-05:00" or "-04:00" that day. */
function etOffset(dateISO: string): string {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "shortOffset" })
    .formatToParts(new Date(`${dateISO}T17:00:00Z`)).find((p) => p.type === "timeZoneName")?.value ?? "GMT-5";
  const h = Number(part.replace(/^GMT/, "")) || -5;
  return `${h < 0 ? "-" : "+"}${String(Math.abs(h)).padStart(2, "0")}:00`;
}

export function parseAgingReport(buf: ArrayBuffer | Buffer): ParsedAging {
  const wb = XLSX.read(buf, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0] ?? ""];
  if (!sheet) throw new Error("The workbook has no sheets.");
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: null });

  const flat = rows.map((r) => (r ?? []).map((v) => s(v)).join(" "));
  if (!flat.some((t) => /Aging Report/i.test(t))) throw new Error("This doesn't look like Skyline's Aging Report (Detailed).");

  let asOfISO: string | null = null;
  let runAt: string | null = null;
  // The four bucket columns, from the header row that prints "AGED …".
  let bucketCols: number[] = [];
  for (const r of rows) {
    const cells = (r ?? []).map((v) => s(v));
    for (const c of cells) {
      const m = c.match(/as of\s+(\d{1,2}\/\d{1,2}\/\d{4})/i);
      if (m && !asOfISO) asOfISO = toISODate(m[1]);
    }
    if (!bucketCols.length && cells.filter((c) => /^AGED/i.test(c.trim())).length >= 4) {
      bucketCols = cells.map((c, i) => (/^AGED/i.test(c.trim()) ? i : -1)).filter((i) => i >= 0);
    }
    if (!runAt) {
      const di = cells.findIndex((c) => isDate(c.trim()));
      const ti = cells.findIndex((c) => /^\s*\d{1,2}:\d{2}:\d{2}\s*[AP]M\s*$/i.test(c));
      if (di >= 0 && ti >= 0) runAt = runAtOf(cells[di], cells[ti]);
    }
  }
  if (bucketCols.length < 4) throw new Error("Couldn't find the aging columns (1–30 / 31–60 / 61–90 / Over 90) in this report.");
  bucketCols = bucketCols.slice(0, 4);
  const firstBucket = bucketCols[0];

  const blocks: AgingBlock[] = [];
  let block: AgingBlock = { headerCode: null, headerName: null, tenants: [] };
  let tenant: AgingTenant | null = null;
  let inTotals = false;

  for (const r of rows) {
    const row = (r ?? []).map((v) => s(v));
    const nonNull = row.map((v, i) => ({ v, i })).filter((x) => x.v.trim() !== "");
    if (!nonNull.length) continue;
    const first = nonNull[0].v.trim();

    const prop = row.find((c) => /^Property\s*:/i.test(c.trim()));
    if (prop) {
      const code = prop.replace(/^Property\s*:/i, "").trim().split(/\s+/)[0] || null;
      const nameCell = nonNull.find((x) => x.v !== prop && !/as of/i.test(x.v));
      block.headerCode = code;
      block.headerName = nameCell ? nameCell.v.trim() : null;
      continue;
    }
    const totals = row.find((c) => /^(PROPERTY|GRAND) TOTALS/i.test(c.trim()));
    if (totals) {
      if (/^PROPERTY/i.test(totals.trim())) {
        blocks.push(block);
        block = { headerCode: null, headerName: null, tenants: [] };
      }
      tenant = null;
      inTotals = true;
      continue;
    }
    // A tenant row: the unit type first ("CURR"), then suite, name, deposits,
    // balance and the buckets.
    if (nonNull[0].i === 0 && /^[A-Z]{3,5}$/.test(first) && !/^Unit/i.test(first) && !/^User/i.test(first)) {
      // Suite and name are the first two cells after the type, whatever they
      // hold (a suite of "34" reads as a number); the figures follow.
      const before = nonNull.filter((x) => x.i > 0 && x.i < firstBucket);
      const nums = before.slice(2).filter((x) => amountOf(x.v) !== null);
      tenant = {
        unitRef: null, propertyCode: null,
        suite: before[0]?.v.trim() ?? "",
        tenantName: before[1]?.v.trim() ?? "",
        unitType: first,
        contact: null, phone: null,
        depositsHeld: nums.length >= 2 ? amountOf(nums[0].v)! : 0,
        balanceDue: nums.length ? amountOf(nums[nums.length - 1].v)! : 0,
        lines: [], tiesOut: false,
      };
      // A suite that is purely digits prints as a number in some cells.
      if (/^\d+(\.0+)?$/.test(tenant.suite)) tenant.suite = String(Number(tenant.suite));
      block.tenants.push(tenant);
      inTotals = false;
      continue;
    }
    if (!tenant || inTotals) continue;
    if (/^Contact\s*:/i.test(first)) { tenant.contact = nonNull[1]?.v.trim() || null; continue; }
    if (/^Phone\s*:/i.test(first)) { tenant.phone = nonNull[1]?.v.trim() || null; continue; }
    if (/^CHARGE/i.test(first)) continue;

    // A detail row: a code cell, a description cell, a date cell, buckets.
    const before = nonNull.filter((x) => x.i < firstBucket);
    const codeCell = before.find((x) => lines(x.v).filter(Boolean).length > 0 && lines(x.v).filter(Boolean).every(isCode));
    const dateCell = before.find((x) => lines(x.v).filter(Boolean).length > 0 && lines(x.v).filter(Boolean).every(isDate));
    if (!codeCell || !dateCell) continue;
    const descCell = before.find((x) => x !== codeCell && x !== dateCell && x.i > codeCell.i && x.i < dateCell.i);
    const codes = lines(codeCell.v);
    while (codes.length && !codes[codes.length - 1]) codes.pop();
    const descs = lines(descCell?.v ?? "");
    const dates = lines(dateCell.v);
    const buckets = bucketCols.map((c) => lines(row[c] ?? ""));
    codes.forEach((code, i) => {
      let amount: number | null = null;
      let bucket = 0;
      for (let b = 0; b < 4; b++) {
        const a = amountOf(buckets[b][i] ?? "");
        if (a !== null) { amount = a; bucket = b; break; }
      }
      if (amount === null) return;
      const description = (descs[i] ?? "").trim();
      tenant!.lines.push({ code, description, dateISO: toISODate(dates[i] ?? ""), amount, bucket, category: classifyCharge(description, amount) });
    });
  }
  if (block.tenants.length) blocks.push(block);
  for (const b of blocks) for (const t of b.tenants) {
    const sum = Math.round(t.lines.reduce((a, l) => a + l.amount, 0) * 100) / 100;
    t.tiesOut = Math.abs(sum - t.balanceDue) < 0.015;
  }
  return { asOfISO, runAt, blocks };
}

const fold = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
/** Same tenant under naming drift: equal folded, or one a long prefix of the
 *  other — the report truncates names at 30 characters ("Partnership for
 *  Community Supp"). */
export function sameName(a: string, b: string): boolean {
  const x = fold(a), y = fold(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [sh, lo] = x.length <= y.length ? [x, y] : [y, x];
  return sh.length >= 6 && lo.startsWith(sh);
}

export type KnownUnit = { unitRef: string; name: string };

/**
 * Give each block its property code and each tenant its canonical unit ref.
 * A block with a printed header keeps it. Otherwise every tenant votes: the
 * property codes where the portal knows `<code>-<suite>` under the SAME name
 * (the rent roll's occupant or the laser statement's tenant). The code with
 * the most votes wins; a block nobody can place is left unresolved and
 * reported, never assigned by position.
 */
export function resolveAgingProperties(blocks: AgingBlock[], known: KnownUnit[]): { blocks: AgingBlock[]; unresolved: AgingTenant[] } {
  const bySuite = new Map<string, KnownUnit[]>();
  for (const k of known) {
    const i = k.unitRef.indexOf("-");
    if (i < 0) continue;
    const suite = k.unitRef.slice(i + 1).toUpperCase();
    (bySuite.get(suite) ?? bySuite.set(suite, []).get(suite)!).push(k);
  }
  const unresolved: AgingTenant[] = [];
  for (const b of blocks) {
    let code = b.headerCode;
    if (!code) {
      const votes = new Map<string, number>();
      for (const t of b.tenants) {
        const codes = new Set((bySuite.get(t.suite.toUpperCase()) ?? []).filter((k) => sameName(k.name, t.tenantName)).map((k) => k.unitRef.split("-")[0]));
        for (const c of codes) votes.set(c, (votes.get(c) ?? 0) + 1);
      }
      const ranked = [...votes.entries()].sort((a, b2) => b2[1] - a[1]);
      if (ranked.length && (ranked.length === 1 || ranked[0][1] > ranked[1][1])) code = ranked[0][0];
    }
    for (const t of b.tenants) {
      if (code) { t.propertyCode = code; t.unitRef = `${code}-${t.suite}`; }
      else unresolved.push(t);
    }
  }
  return { blocks, unresolved };
}

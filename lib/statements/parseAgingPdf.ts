// Skyline's "Delinquency / Aging Report (Detailed)" as a PDF — the file Tanya
// circulates around the 16th to ask who to mark delinquent for U&O (owner,
// 11/2026: "this is the report tanya sends to the office"). It is the SAME
// report the Excel import reads (`parseAgingReport.ts`), printed: one line per
// open charge or credit with its code, description, date and aging bucket.
//
// The PDF is the better file of the two: it prints "Property : 1100" at the top
// of EVERY page, so each tenant's property is read off the page rather than
// voted on afterwards. Items are laid out by POSITION (`pdfPages`): the unit
// type at the far left, the suite, the name, deposits, balance, then the four
// bucket columns; a charge line is code / description / date / one amount in
// its bucket's column. Crystal sometimes sets a row's figures a point lower
// than its words (Hair Concepts' buckets sit under its name), so a row is
// every item within a couple of points.
//
// Pure — no storage, no network. Returns the same `ParsedAging` the Excel
// parser does, so everything downstream is unchanged.

import { classifyCharge, toISODate } from "./parseSkylineStatements";
import { runAtOf, type AgingBlock, type AgingTenant, type ParsedAging } from "./parseAgingReport";

export type PdfItem = { x: number; y: number; s: string };

const amountOf = (v: string): number | null => {
  const t = v.trim();
  if (!/^\(?-?\$?[\d,]+\.\d{2}\)?$/.test(t)) return null;
  const n = Number(t.replace(/[$,\s]/g, "").replace(/^\((.*)\)$/, "-$1"));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};
const isDate = (x: string) => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(x.trim());
const isTime = (x: string) => /^\d{1,2}:\d{2}:\d{2}\s*[AP]M$/i.test(x.trim());

// Column edges, in PDF points (the report prints on a fixed 612-wide page).
const X = {
  unitTypeMax: 45, suiteMax: 100, nameMax: 262, depositsMax: 318, balanceMax: 385,
  codeMin: 88, codeMax: 120, descMax: 320, dateMax: 350,
};
/** The four aging columns by where an amount starts (they are right-aligned). */
export function bucketOf(x: number): number {
  return x < 435 ? 0 : x < 490 ? 1 : x < 545 ? 2 : 3;
}

/** A page's items as rows, top to bottom, each left to right. */
function rowsOf(items: PdfItem[]): PdfItem[][] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: { y: number; items: PdfItem[] }[] = [];
  for (const it of sorted) {
    const last = rows[rows.length - 1];
    if (last && last.y - it.y <= 2.5) last.items.push(it);
    else rows.push({ y: it.y, items: [it] });
  }
  return rows.map((r) => r.items.sort((a, b) => a.x - b.x));
}

const isHeaderWord = (s: string) => /^(Unit|Type|Number|Occupant|Name|Deposits|Held|Balance|Due|AGED|AGED OVER|DAYS|1 - 30|31 - 60|61-90|90|Unit Reference)$/i.test(s.trim());

/** Is this PDF text the tenant Aging Report (not, say, the AP Aged Trial Balance)? */
export function looksLikeTenantAging(pages: PdfItem[][]): boolean {
  const first = (pages[0] ?? []).map((i) => i.s).join(" ");
  return /Aging Report/i.test(first) && /Occupant/i.test(first) && /Deposits/i.test(first);
}

const sumOf = (ls: { amount: number }[]) => Math.round(ls.reduce((a, l) => a + l.amount, 0) * 100) / 100;

/**
 * Crystal sometimes prints a tenant's whole detail group two to four times
 * (Einstein Podiatry, 7010-201, on 11/19/2026 — Skyline's own property total
 * counted it twice too). Keep ONE copy only when the lines are that same list
 * repeated exactly AND one copy adds to the tenant's printed balance; anything
 * else is left as read, and reads as not tying.
 */
export function withoutRepeats<T extends { code: string; dateISO: string | null; amount: number; description: string }>(lines: T[], balance: number): T[] {
  if (Math.abs(sumOf(lines) - balance) < 0.015) return lines;
  const key = (l: T) => `${l.code}|${l.dateISO}|${l.amount}|${l.description}`;
  for (let k = 2; k <= 4; k++) {
    if (lines.length % k) continue;
    const n = lines.length / k;
    const first = lines.slice(0, n);
    const same = Array.from({ length: k }, (_, c) => lines.slice(c * n, c * n + n)).every((chunk) => chunk.every((l, i) => key(l) === key(first[i])));
    if (same && Math.abs(sumOf(first) - balance) < 0.015) return first;
  }
  return lines;
}

export function agingFromPdfPages(pages: PdfItem[][]): ParsedAging {
  if (!pages.length || !looksLikeTenantAging(pages)) throw new Error("This doesn't look like Skyline's Aging Report (Detailed).");

  let asOfISO: string | null = null;
  let runAt: string | null = null;
  const blocks: AgingBlock[] = [];
  let block: AgingBlock | null = null;
  let tenant: AgingTenant | null = null;
  let inTotals = false;

  for (const items of pages) {
    // The page header: "Property :" with the code under it, the as-of date,
    // and the run date / time in the corners.
    const prop = items.find((i) => /^Property\s*:/i.test(i.s.trim()));
    let code: string | null = null;
    let name: string | null = null;
    if (prop) {
      const inline = prop.s.replace(/^Property\s*:/i, "").trim();
      const below = items
        .filter((i) => i.x < 60 && i.y < prop.y - 2 && i.y > prop.y - 20 && /^[A-Z0-9]{2,6}$/i.test(i.s.trim()))
        .sort((a, b) => b.y - a.y)[0];
      code = (below?.s.trim() || inline.split(/\s+/)[0] || "").toUpperCase() || null;
      name = items
        .filter((i) => i.x >= 60 && i.x < 260 && i.y <= prop.y + 2 && i.y > prop.y - 18 && !/as of/i.test(i.s))
        .sort((a, b) => b.y - a.y || a.x - b.x).map((i) => i.s.trim()).join(" ") || null;
    }
    for (const i of items) {
      const m = i.s.match(/as of\s+(\d{1,2}\/\d{1,2}\/\d{4})/i);
      if (m && !asOfISO) asOfISO = toISODate(m[1]);
    }
    if (!runAt) {
      const d = items.find((i) => isDate(i.s) && i.x < 100);
      const t = items.find((i) => isTime(i.s));
      if (d && t) runAt = runAtOf(d.s, t.s);
    }
    if (code && block?.headerCode !== code) {
      if (block && block.tenants.length) blocks.push(block);
      block = { headerCode: code, headerName: name, tenants: [] };
      tenant = null;
      inTotals = false;
    }
    if (!block) block = { headerCode: null, headerName: null, tenants: [] };

    // Below the column headings is the body.
    const heads = items.filter((i) => isHeaderWord(i.s) && i.y < (prop?.y ?? Infinity));
    const bodyTop = heads.length ? Math.min(...heads.map((i) => i.y)) - 1 : Infinity;

    for (const row of rowsOf(items.filter((i) => i.y < bodyTop))) {
      const first = row[0];
      const text = row.map((i) => i.s).join(" ");
      if (/PROPERTY TOTALS|GRAND TOTALS/i.test(text)) { inTotals = true; tenant = null; continue; }

      // A tenant: the unit type at the far left, then the suite.
      const suiteItem = row.find((i) => i.x > X.unitTypeMax && i.x < X.suiteMax);
      if (first.x < X.unitTypeMax && /^[A-Z]{2,6}$/.test(first.s.trim()) && suiteItem) {
        const nums = row.filter((i) => i.x >= X.nameMax).map((i) => ({ x: i.x, v: amountOf(i.s) })).filter((n) => n.v !== null) as { x: number; v: number }[];
        const deposits = nums.find((n) => n.x < X.depositsMax);
        const balance = nums.find((n) => n.x >= X.depositsMax && n.x < X.balanceMax);
        let suite = suiteItem.s.trim();
        if (/^\d+(\.0+)?$/.test(suite)) suite = String(Number(suite));
        tenant = {
          unitRef: null, propertyCode: null, suite,
          tenantName: row.filter((i) => i.x >= X.suiteMax && i.x < X.nameMax).map((i) => i.s.trim()).join(" "),
          unitType: first.s.trim(), contact: null, phone: null,
          depositsHeld: deposits?.v ?? 0, balanceDue: balance?.v ?? 0, lines: [], tiesOut: false,
        };
        block.tenants.push(tenant);
        inTotals = false;
        continue;
      }
      if (!tenant || inTotals) continue;
      if (/^Contact$/i.test(first.s.trim())) { tenant.contact = row.filter((i) => i.x > 100).map((i) => i.s.trim()).join(" ") || null; continue; }
      if (/^Phone$/i.test(first.s.trim())) { tenant.phone = row.filter((i) => i.x > 100).map((i) => i.s.trim()).join(" ") || null; continue; }

      // A charge or credit line.
      const codeItem = row.find((i) => i.x >= X.codeMin && i.x < X.codeMax && /^[A-Z0-9&]{1,5}$/.test(i.s.trim()));
      const dateItem = row.find((i) => i.x >= X.descMax && i.x < X.dateMax && isDate(i.s));
      const amt = row.map((i) => ({ x: i.x, v: amountOf(i.s) })).find((n) => n.x >= X.balanceMax && n.v !== null);
      if (!codeItem || !amt || amt.v === null) continue;
      const description = row.filter((i) => i.x > codeItem.x + 10 && i.x < X.descMax).map((i) => i.s.trim()).join(" ");
      tenant.lines.push({
        code: codeItem.s.trim(), description, dateISO: dateItem ? toISODate(dateItem.s) : null,
        amount: amt.v, bucket: bucketOf(amt.x), category: classifyCharge(description, amt.v),
      });
    }
  }
  if (block && block.tenants.length) blocks.push(block);
  for (const b of blocks) for (const t of b.tenants) {
    t.lines = withoutRepeats(t.lines, t.balanceDue);
    t.tiesOut = Math.abs(sumOf(t.lines) - t.balanceDue) < 0.015;
  }
  return { asOfISO, runAt, blocks };
}

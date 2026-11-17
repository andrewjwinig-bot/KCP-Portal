// Skyline's AP Aged Trial Balance — the vendor aging that proves accounts
// payable (2110) on the workpapers, as the accountants' AP tab does.
//
// Run for PALL it is ONE file, and like the PALL General Ledger it prints the
// property's name only on the FIRST page ("0800 - Bellmawr Joint Venture"):
// every later property is just the next block of vendors closed by
// "Company Total". So a section is placed by EVIDENCE, never position:
//   1. its total equals exactly one property's payables (2110) balance at the
//      as-of date — decisive;
//   2. else its VENDORS: the vendors the property's own 2110 account carried
//      during the year, rare vendors counting more than the ones every
//      property pays (Liberty Bank, Korman Commercial) — placed only on a
//      clear winner;
//   3. section 1 only: the one header the file prints.
// Anything else is left UNPLACED and reported, never guessed.
//
// Pure — the route reads the file and the General Ledgers.

export type Cell = string | number | boolean | Date | null | undefined;
export type Row = Cell[];

export interface ApInvoice {
  vendorCode: string;
  vendor: string;
  voucher: string;
  invoice: string;
  /** ISO date of the invoice — what the aging buckets by. */
  date: string | null;
  amount: number;
  bucket: "current" | "31-60" | "61-90" | "90+";
  description: string;
}

export interface ApSection {
  /** 1-based position in the file, for the import report only. */
  index: number;
  /** The property the PDF printed over this section ("4500 - Grays Ferry
   *  Shopping Center"). The Excel export prints only the first one. */
  code?: string;
  name?: string;
  total: number;
  invoices: ApInvoice[];
}

export interface ApAgingFile {
  /** "Balance as of" — ISO date. */
  asOf: string | null;
  /** The one property code the file prints (section 1's). */
  headerCode: string | null;
  sections: ApSection[];
  portfolioTotal: number | null;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const str = (c: Cell) => (c == null ? "" : String(c)).trim();
export function amountOf(c: Cell): number | null {
  if (typeof c === "number") return c;
  const s = str(c).replace(/[$,\s]/g, "");
  if (!s) return null;
  const neg = /^\(.*\)$/.test(s) || s.startsWith("-");
  const n = Number(s.replace(/[()\-]/g, ""));
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}
function isoOf(c: Cell): string | null {
  if (c instanceof Date) return c.toISOString().slice(0, 10);
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(str(c));
  if (!m) return null;
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

export function parseApAging(rows: Row[]): ApAgingFile {
  // Columns come from the header rows, not fixed positions.
  let cVoucher = -1, cInvoice = -1, cDate = -1, cDesc = -1;
  const buckets: { col: number; bucket: ApInvoice["bucket"] }[] = [];
  let asOf: string | null = null;
  let headerCode: string | null = null;
  for (const r of rows.slice(0, 40)) {
    r.forEach((c, j) => {
      const s = str(c);
      if (/^voucher$/i.test(s)) cVoucher = j;
      if (/^invoice\s*#$/i.test(s)) cInvoice = j;
      if (/^invoice\s*date$/i.test(s.replace(/\s+/g, " "))) cDate = j;
      if (/^invoice description$/i.test(s)) cDesc = j;
      if (/^current$/i.test(s)) buckets.push({ col: j, bucket: "current" });
      if (/^31\s*-\s*60/.test(s)) buckets.push({ col: j, bucket: "31-60" });
      if (/^61\s*-\s*90/.test(s)) buckets.push({ col: j, bucket: "61-90" });
      if (/^over\s*90/i.test(s)) buckets.push({ col: j, bucket: "90+" });
      const bal = /balance as of\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i.exec(s);
      if (bal && !asOf) asOf = isoOf(bal[1]);
      const hdr = /^([0-9][0-9A-Z]{3})\s+-\s+\S/.exec(s);
      if (hdr && !headerCode) headerCode = hdr[1];
    });
    if (cVoucher >= 0 && buckets.length >= 4 && asOf) break;
  }
  if (cVoucher < 0 || buckets.length < 4) throw new Error("This doesn't look like Skyline's AP Aged Trial Balance — no Voucher / Current / Over 90 Days columns.");
  const uniq = new Map(buckets.map((b) => [b.bucket, b.col]));

  const sections: ApSection[] = [];
  let invoices: ApInvoice[] = [];
  let vendorCode = "", vendor = "";
  let portfolioTotal: number | null = null;
  for (const r of rows) {
    const lead = str(r[cVoucher]);
    // "Company Total" closes a property; "Portfolio Total" the file.
    const label = r.map(str).find((s) => /^(company|portfolio) total$/i.test(s));
    if (label) {
      const total = r.map(amountOf).find((v, j) => v != null && str(r[j]) !== label) ?? 0;
      if (/^portfolio/i.test(label)) portfolioTotal = round2(total);
      else { sections.push({ index: sections.length + 1, total: round2(total), invoices }); invoices = []; }
      continue;
    }
    // A vendor line: a code in the column before Voucher, "-" and the name.
    const code = str(r[cVoucher - 1]);
    const dashAt = r.findIndex((c) => str(c) === "-");
    if (code && dashAt > 0 && !lead) {
      vendorCode = code;
      vendor = r.slice(dashAt + 1).map(str).find((s) => s && !/^\(\d{3}\)/.test(s)) ?? "";
      continue;
    }
    // An invoice line: a numeric voucher.
    if (/^\d+$/.test(lead)) {
      let amount: number | null = null, bucket: ApInvoice["bucket"] = "current";
      for (const [b, col] of uniq) { const v = amountOf(r[col]); if (v != null && v !== 0) { amount = v; bucket = b; } }
      if (amount == null) continue;
      invoices.push({
        vendorCode, vendor, voucher: lead,
        invoice: cInvoice >= 0 ? str(r[cInvoice]) : "",
        date: cDate >= 0 ? isoOf(r[cDate]) : null,
        amount: round2(amount), bucket,
        description: cDesc >= 0 ? str(r[cDesc]) : "",
      });
    }
  }
  return { asOf, headerCode, sections, portfolioTotal };
}

/** A property the file could belong to: its payables owed at the as-of date
 *  (2110, read positive) and the vendors its 2110 account carried. */
export interface ApCandidate { key: string; owed: number | null; vendors?: string[] }
export interface ApPlacement { index: number; key: string | null; by: "total" | "vendors" | "header" | null; note?: string }

export const foldVendor = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\b(inc|llc|co|corp|company|the)\b/g, "").replace(/\s+/g, " ").trim();

export function placeApSections(file: ApAgingFile, candidates: ApCandidate[]): ApPlacement[] {
  const out: ApPlacement[] = file.sections.map((s) => ({ index: s.index, key: null, by: null }));
  const taken = new Set<string>();
  // 0. The PDF names every section on its page header — decisive.
  for (const s of file.sections) if (s.code) { out[s.index - 1] = { index: s.index, key: s.code, by: "header" }; taken.add(s.code); }
  // 1. Exact total — only when exactly one property and one section share it.
  for (const s of file.sections) {
    if (Math.abs(s.total) < 0.005) continue;
    const props = candidates.filter((c) => c.owed != null && Math.abs(c.owed - s.total) < 0.01);
    const twins = file.sections.filter((o) => Math.abs(o.total - s.total) < 0.01);
    if (out[s.index - 1].key) continue;
    if (props.length === 1 && twins.length === 1) { out[s.index - 1] = { index: s.index, key: props[0].key, by: "total" }; taken.add(props[0].key); }
  }
  // 2. Vendors, weighted by rarity across the candidates.
  const sets = new Map(candidates.filter((c) => c.vendors?.length).map((c) => [c.key, new Set(c.vendors!.map(foldVendor))]));
  const df = new Map<string, number>();
  for (const set of sets.values()) for (const v of set) df.set(v, (df.get(v) ?? 0) + 1);
  const n = Math.max(1, sets.size);
  for (const s of file.sections) {
    if (out[s.index - 1].key) continue;
    const vendors = [...new Set(s.invoices.map((i) => foldVendor(i.vendor)).filter(Boolean))];
    if (!vendors.length) continue;
    const weight = (v: string) => Math.log(1 + n / (df.get(v) ?? 0.5));
    const total = vendors.reduce((a, v) => a + weight(v), 0);
    const scores = [...sets].filter(([k]) => !taken.has(k)).map(([k, set]) => ({ k, score: vendors.reduce((a, v) => a + (set.has(v) ? weight(v) : 0), 0) / total }))
      .sort((a, b) => b.score - a.score);
    const [best, next] = scores;
    if (best && best.score >= 0.6 && (!next || best.score - next.score >= 0.25)) {
      out[s.index - 1] = { index: s.index, key: best.k, by: "vendors" };
      taken.add(best.k);
    }
  }
  // 3. The one printed header names section 1.
  if (!out[0]?.key && file.headerCode && !taken.has(file.headerCode)) out[0] = { index: 1, key: file.headerCode, by: "header" };
  for (const p of out) if (!p.key) p.note = "Couldn't tell which property this is — no property's payables or vendors match it.";
  return out;
}

/** Invoices on the aging that the books' payables never carried — bills dated
 *  on or before the as-of date but entered after it (they age by invoice date,
 *  so a later re-run picks them up), or keyed to another property. Matched by
 *  amount and vendor against the year's 2110 credits. */
export function invoicesNotInBooks(invoices: ApInvoice[], payableCredits: { amount: number; text: string }[]): ApInvoice[] {
  const pool = payableCredits.map((c) => ({ amount: round2(Math.abs(c.amount)), text: foldVendor(c.text), used: false }));
  const out: ApInvoice[] = [];
  for (const inv of invoices) {
    const v = foldVendor(inv.vendor).split(" ")[0] ?? "";
    const hit = pool.find((p) => !p.used && Math.abs(p.amount - Math.abs(inv.amount)) < 0.01 && (!v || p.text.includes(v)))
      ?? pool.find((p) => !p.used && Math.abs(p.amount - Math.abs(inv.amount)) < 0.01);
    if (hit) hit.used = true; else out.push(inv);
  }
  return out;
}

// ── The PDF ────────────────────────────────────────────────────────────────
// Skyline's PDF prints the property under "AP Aged Trial Balance" on EVERY
// page, so each section is named by the page it closes on — the cleaner
// export (owner). Items are laid out by position: voucher at the left edge,
// the amount under whichever bucket header it sits beneath.

export type PdfItem = { x: number; y: number; s: string };
const MONEY_RE = /^\(?-?[\d,]+\.\d{2}\)?$/;
const DATE_RE = /^\d{1,2}\/\d{1,2}\/\d{2,4}$/;

function pdfLines(items: PdfItem[]): PdfItem[][] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const out: PdfItem[][] = [];
  for (const it of sorted) {
    const last = out[out.length - 1];
    if (last && Math.abs(last[0].y - it.y) <= 3) last.push(it);
    else out.push([it]);
  }
  return out.map((l) => l.sort((a, b) => a.x - b.x));
}

export function apAgingFromPdfPages(pages: PdfItem[][]): ApAgingFile {
  const sections: ApSection[] = [];
  let invoices: ApInvoice[] = [];
  let asOf: string | null = null, headerCode: string | null = null, portfolioTotal: number | null = null;
  let vendorCode = "", vendor = "";
  for (const items of pages) {
    const ls = pdfLines(items);
    let code = "", name = "";
    const titleAt = ls.findIndex((l) => l.some((i) => /^AP Aged Trial Balance$/i.test(i.s)));
    const hdr = titleAt >= 0 ? ls[titleAt + 1]?.map((i) => i.s).join(" ") : "";
    const hm = /^([0-9][0-9A-Z]{3,4})\s*-\s*(.+)$/.exec(hdr ?? "");
    if (hm) { code = hm[1]; name = hm[2].trim(); headerCode ??= code; }
    const bal = items.find((i) => /balance as of/i.test(i.s));
    const bm = bal && /(\d{1,2}\/\d{1,2}\/\d{2,4})/.exec(bal.s);
    if (bm && !asOf) asOf = isoOf(bm[1]);
    // Bucket columns from this page's headers.
    const head = (re: RegExp) => items.find((i) => re.test(i.s))?.x;
    const cols = ([["current", head(/^Current$/)], ["31-60", head(/^31\s*-\s*60/)], ["61-90", head(/^61\s*-\s*90/)], ["90+", head(/^Over\s*90/i)]] as [ApInvoice["bucket"], number | undefined][])
      .filter((c): c is [ApInvoice["bucket"], number] => c[1] != null).sort((a, b) => a[1] - b[1]);
    const descX = head(/^Invoice Description$/i) ?? 480;
    const bucketAt = (x: number) => { let b: ApInvoice["bucket"] = "current"; for (const [k, cx] of cols) if (x + 12 >= cx) b = k; return b; };
    const start = ls.findIndex((l) => l.some((i) => /^Voucher$/i.test(i.s)));
    for (let li = Math.max(0, start + 1); li < ls.length; li++) {
      const l = ls[li];
      if (/^(Company|Portfolio) Total\b/i.test(l[0]?.s ?? "")) {
        // The figure prints a few points off its label — look around it.
        const y0 = l[0].y;
        const amt = items.filter((i) => MONEY_RE.test(i.s) && Math.abs(i.y - y0) <= 6).sort((a, b) => a.x - b.x)[0];
        const total = round2(amountOf(amt?.s) ?? 0);
        if (/^Portfolio/i.test(l[0].s)) portfolioTotal = total;
        else { sections.push({ index: sections.length + 1, total, invoices, code: code || undefined, name: name || undefined }); invoices = []; }
        continue;
      }
      if (/^Total$/i.test(l[0]?.s ?? "")) continue;
      // Vendor: a code at the left edge and a "-" before the name.
      if (l[0] && l[0].x < 40 && !/^\d+$/.test(l[0].s) && l.some((i) => i.s === "-" || i.s.startsWith("- "))) {
        vendorCode = l[0].s;
        vendor = l.filter((i) => i !== l[0] && i.s !== "-" && !/^\(\d{3}\)/.test(i.s)).map((i) => i.s.replace(/^-\s*/, "")).join(" ").trim();
        continue;
      }
      if (l[0] && l[0].x < 40 && /^\d{3,6}$/.test(l[0].s)) {
        let row = l;
        // A wrapped line: the date and amount print on the next line.
        if (!row.some((i) => MONEY_RE.test(i.s) && i.x < descX - 10) && ls[li + 1] && !(ls[li + 1][0]?.x < 40)) { row = [...row, ...ls[li + 1]]; li++; }
        const amt = row.find((i) => MONEY_RE.test(i.s) && i.x < descX - 10 && i.x > 150);
        if (!amt) continue;
        invoices.push({
          vendorCode, vendor, voucher: l[0].s,
          invoice: row.filter((i) => i.x > 60 && i.x < 120 && !DATE_RE.test(i.s)).map((i) => i.s).join(" "),
          date: isoOf(row.find((i) => DATE_RE.test(i.s))?.s ?? null),
          amount: round2(amountOf(amt.s) ?? 0),
          bucket: bucketAt(amt.x),
          description: row.filter((i) => i.x >= descX - 20 && !MONEY_RE.test(i.s)).map((i) => i.s).join(" "),
        });
      }
    }
  }
  return { asOf, headerCode, sections, portfolioTotal };
}

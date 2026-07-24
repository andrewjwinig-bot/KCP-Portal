// Presentation-ready Statement of Values PDF — the document circulated to
// ownership annually and on request. Uses pdf-lib so it runs both client-side
// (the Download menu on the Investor page) and server-side (future email/cron).
//
// Takes fully-computed rows so it stays a pure renderer: the page decides the
// year-end vs. "today estimate" values (and, for an owner, their % share).

import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";

export interface StatementPdfRow {
  /** Entity / property code chip. */
  code: string;
  /** Property / entity name. */
  name: string;
  /** Ownership fraction (0–1) — owner statements only; omit for portfolio. */
  pct?: number | null;
  /** Frozen year-end equity value (or the owner's year-end share). */
  yearEnd: number | null;
  /** Current estimated equity value (or the owner's estimated share). */
  estimated: number | null;
}

export interface StatementPdfInput {
  /** Owner name for a per-beneficiary statement; omit for the portfolio. */
  ownerName?: string;
  /** Long-form year-end date, e.g. "December 31, 2025". */
  asOfYearEnd: string;
  /** Long-form estimate date, e.g. "July 24, 2026"; "" when unset. */
  asOfEstimate?: string;
  /** Long-form generation date for the footer. */
  generatedOn: string;
  rows: StatementPdfRow[];
  totals: { yearEnd: number; estimated: number };
}

const navy = rgb(11 / 255, 74 / 255, 125 / 255);
const white = rgb(1, 1, 1);
const ink = rgb(0.1, 0.12, 0.15);
const muted = rgb(0.42, 0.46, 0.52);
const rule = rgb(0.85, 0.87, 0.9);
const zebra = rgb(0.965, 0.972, 0.98);

const usd = (n: number | null | undefined): string =>
  n == null ? "—" : (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");

export async function buildStatementOfValuesPdf(input: StatementPdfInput): Promise<Uint8Array> {
  const { ownerName, asOfYearEnd, asOfEstimate, generatedOn, rows, totals } = input;
  const isOwner = !!ownerName;

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Letter landscape gives the money columns room.
  const W = 792, H = 612;
  const MX = 48;                     // left/right margin
  const contentW = W - MX * 2;

  // Column layout (x positions). Owner mode inserts an Ownership % column.
  const cols = isOwner
    ? [
        { key: "code", label: "Code", x: MX, w: 54, align: "left" as const },
        { key: "name", label: "Property / Entity", x: MX + 54, w: 300, align: "left" as const },
        { key: "pct", label: "Ownership %", x: MX + 354, w: 110, align: "right" as const },
        { key: "ye", label: `Value (${asOfYearEnd})`, x: MX + 464, w: 116, align: "right" as const },
        { key: "est", label: asOfEstimate ? `Est. (${asOfEstimate})` : "Est. (Today)", x: MX + 580, w: contentW - 580, align: "right" as const },
      ]
    : [
        { key: "code", label: "Code", x: MX, w: 60, align: "left" as const },
        { key: "name", label: "Property / Entity", x: MX + 60, w: 360, align: "left" as const },
        { key: "ye", label: `Value (${asOfYearEnd})`, x: MX + 420, w: 138, align: "right" as const },
        { key: "est", label: asOfEstimate ? `Est. (${asOfEstimate})` : "Est. (Today)", x: MX + 558, w: contentW - 558, align: "right" as const },
      ];

  let page = pdf.addPage([W, H]);
  let y = 0;

  const text = (p: PDFPage, s: string, x: number, yy: number, size: number, f: PDFFont, color = ink) =>
    p.drawText(s, { x, y: yy, size, font: f, color });
  const textR = (p: PDFPage, s: string, right: number, yy: number, size: number, f: PDFFont, color = ink) =>
    p.drawText(s, { x: right - f.widthOfTextAtSize(s, size), y: yy, size, font: f, color });
  const clip = (s: string, f: PDFFont, size: number, w: number) => {
    if (f.widthOfTextAtSize(s, size) <= w) return s;
    let out = s;
    while (out.length > 1 && f.widthOfTextAtSize(out + "…", size) > w) out = out.slice(0, -1);
    return out + "…";
  };

  function drawHeaderBand(p: PDFPage) {
    p.drawRectangle({ x: 0, y: H - 70, width: W, height: 70, color: navy });
    text(p, "KORMAN", MX, H - 40, 20, bold, white);
    text(p, "COMMERCIAL PROPERTIES", MX + 96, H - 38, 9, font, rgb(0.82, 0.88, 0.95));
    textR(p, "Statement of Values", W - MX, H - 34, 15, bold, white);
    textR(p, isOwner ? (ownerName as string) : "Portfolio — all entities", W - MX, H - 52, 9.5, font, rgb(0.82, 0.88, 0.95));
  }

  function drawColumnHeader(p: PDFPage, yy: number) {
    for (const c of cols) {
      const label = clip(c.label, bold, 8, c.w - 6);
      if (c.align === "right") textR(p, label, c.x + c.w, yy, 8, bold, muted);
      else text(p, label, c.x, yy, 8, bold, muted);
    }
    p.drawLine({ start: { x: MX, y: yy - 6 }, end: { x: W - MX, y: yy - 6 }, thickness: 1, color: rule });
  }

  function startPage(): void {
    page = pdf.addPage([W, H]);
    drawHeaderBand(page);
    y = H - 92;
    // as-of line under the band on the first content block of each page
    text(page, `Year-end values as of ${asOfYearEnd}.` + (asOfEstimate ? `  Estimated values as of ${asOfEstimate}.` : "  Estimated values default to year-end until updated."), MX, y, 8.5, font, muted);
    y -= 18;
    drawColumnHeader(page, y);
    y -= 18;
  }

  startPage();

  const rowH = 17;
  let i = 0;
  for (const r of rows) {
    if (y < 70) startPage();
    if (i % 2 === 1) page.drawRectangle({ x: MX, y: y - 5, width: contentW, height: rowH, color: zebra });
    text(page, r.code, cols[0].x, y, 8.5, bold, navy);
    const nameCol = cols.find((c) => c.key === "name")!;
    text(page, clip(r.name, font, 9, nameCol.w - 6), nameCol.x, y, 9, font, ink);
    if (isOwner) {
      const pctCol = cols.find((c) => c.key === "pct")!;
      textR(page, r.pct == null ? "—" : (r.pct * 100).toFixed(4) + "%", pctCol.x + pctCol.w, y, 9, font);
    }
    const yeCol = cols.find((c) => c.key === "ye")!;
    const estCol = cols.find((c) => c.key === "est")!;
    textR(page, usd(r.yearEnd), yeCol.x + yeCol.w, y, 9, font);
    textR(page, usd(r.estimated), estCol.x + estCol.w, y, 9, bold);
    y -= rowH;
    i++;
  }

  // Totals row.
  if (y < 70) startPage();
  y -= 2;
  page.drawLine({ start: { x: MX, y: y + 9 }, end: { x: W - MX, y: y + 9 }, thickness: 1.2, color: navy });
  const labelCol = cols.find((c) => c.key === "name")!;
  text(page, isOwner ? `TOTAL — ${rows.length} ${rows.length === 1 ? "entity" : "entities"}` : "TOTAL", cols[0].x, y - 6, 10, bold, ink);
  const yeCol = cols.find((c) => c.key === "ye")!;
  const estCol = cols.find((c) => c.key === "est")!;
  textR(page, usd(totals.yearEnd), yeCol.x + yeCol.w, y - 6, 10, bold);
  textR(page, usd(totals.estimated), estCol.x + estCol.w, y - 6, 10, bold, navy);
  void labelCol;

  // Footer on every page.
  const pages = pdf.getPages();
  pages.forEach((p, idx) => {
    p.drawLine({ start: { x: MX, y: 44 }, end: { x: W - MX, y: 44 }, thickness: 0.5, color: rule });
    text(p, `Generated ${generatedOn} · Confidential — for the named owner(s) only`, MX, 32, 7.5, font, muted);
    textR(p, `Page ${idx + 1} of ${pages.length}`, W - MX, 32, 7.5, font, muted);
  });

  return await pdf.save();
}

// Per-commission invoice PDF — mirrors the same teal-header layout as
// the payroll invoice template so the AvidBill processing pipeline
// sees a consistent look across the books we send them.
//
// Each commission generates one invoice. Vendor is LIKM4 (the
// management entity that pays the commission); account code 1940-8501
// is the Outside Leasing Commissions GL. The description block carries
// the building / suite, the lease window, and any free-text comments
// staff captured.

import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont } from "pdf-lib";
import type { CommissionEntry } from "@/lib/commissions";
import { PROPERTY_DEFS } from "@/lib/properties/data";

const ACC_CODE = "1940-8501";
const VENDOR   = "LIKM4";

function moneyStr(n: number) {
  return Number(n ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function todayLabel(): string {
  const d = new Date();
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

function py(page: PDFPage, topY: number) {
  return page.getHeight() - topY;
}

function fillRect(
  page: PDFPage,
  x: number, topY: number, w: number, h: number,
  color: ReturnType<typeof rgb>,
) {
  page.drawRectangle({ x, y: py(page, topY + h), width: w, height: h, color });
}

function drawText(
  page: PDFPage,
  str: string,
  x: number, topY: number,
  font: PDFFont, size: number,
  color: ReturnType<typeof rgb> = rgb(0, 0, 0),
  opts: { maxWidth?: number; align?: "left" | "right" } = {},
) {
  let drawX = x;
  if (opts.align === "right" && opts.maxWidth != null) {
    drawX = x + opts.maxWidth - font.widthOfTextAtSize(str, size);
  }
  page.drawText(str, { x: drawX, y: py(page, topY + size * 0.85), font, size, color });
}

/** Wrap a string at the supplied pixel width and return the lines. */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const trial = current ? `${current} ${w}` : w;
    if (font.widthOfTextAtSize(trial, size) > maxWidth && current) {
      lines.push(current);
      current = w;
    } else {
      current = trial;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function lookupBuildingMeta(buildingCode: string) {
  const def = PROPERTY_DEFS.find((p) => p.id.toUpperCase() === buildingCode.toUpperCase());
  return def ?? null;
}

function toDisplayDate(s: string): string {
  if (!s) return "";
  // Already MM/DD/YYYY or M/D/YYYY → leave alone; ISO → reformat.
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (iso) return `${Number(iso[2])}/${Number(iso[3])}/${iso[1]}`;
  return s;
}

export type CommissionInvoiceInput = {
  entry: CommissionEntry;
  /** Amount to bill — the per-row total. Computed by the caller so the
   *  PDF doesn't have to duplicate the office × 1.2 markup / retail %-
   *  of-lease-value logic that lives on the page. */
  amount: number;
  /** Unique 7–8 digit invoice number — caller usually derives it
   *  deterministically from the commission id so re-downloads
   *  generate the same number. */
  invoiceNumber: string;
  /** Optional override for the invoice date; defaults to today. */
  invoiceDate?: string;
};

export async function renderCommissionInvoicePdf(input: CommissionInvoiceInput): Promise<Uint8Array> {
  const { entry, amount, invoiceNumber } = input;
  const invoiceDate = input.invoiceDate ?? todayLabel();

  const pdfDoc  = await PDFDocument.create();
  const page    = pdfDoc.addPage([612, 792]); // US Letter

  const bold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Teal accent matches the payroll invoice template.
  const teal  = rgb(0.051, 0.322, 0.396);
  const white = rgb(1, 1, 1);
  const black = rgb(0, 0, 0);
  const dark  = rgb(0.15, 0.15, 0.15);

  const margin   = 45;
  const pageW    = 612;
  const contentW = pageW - margin * 2;

  // ── 1. Company header ──────────────────────────────────────────────────
  drawText(page, "LIK Management Inc",               margin, 38, bold,    18, black);
  drawText(page, "8 Neshaminy Interplex; Suite 400", margin, 60, regular, 10, dark);
  drawText(page, "Trevose, PA  19053",               margin, 74, regular, 10, dark);

  // ── 2. INVOICE banner ──────────────────────────────────────────────────
  const invLabel = "INVOICE";
  const invSize  = 36;
  const invW     = bold.widthOfTextAtSize(invLabel, invSize);
  drawText(page, invLabel, pageW - margin - invW, 38, bold, invSize, teal);

  // ── 3. Left = BILL TO, Right = info grid ──────────────────────────────
  const leftW  = 310;
  const rightX = margin + leftW + 12;
  const rightW = contentW - leftW - 12;
  const barH   = 20;

  const billBarY = 102;
  fillRect(page, margin, billBarY, leftW, barH, teal);
  drawText(page, "BILL TO", margin + 8, billBarY + 4, bold, 9, white);

  // The AvidBill processing pipeline routes invoices to LIKM4 — the
  // management entity the commission expense lands in. Drop a clean
  // bill-to block so it reads consistently across batches.
  drawText(page, "LIKM4",                            margin + 8, billBarY + barH + 10, bold,    10, black);
  drawText(page, "Korman Commercial Properties",     margin + 8, billBarY + barH + 24, regular, 10, dark);
  drawText(page, "8 Neshaminy Interplex; Suite 400", margin + 8, billBarY + barH + 38, regular, 10, dark);
  drawText(page, "Trevose, PA  19053",               margin + 8, billBarY + barH + 52, regular, 10, dark);

  // ── 4. Info grid (right side) ─────────────────────────────────────────
  const gridRow1Y = 102;
  const halfRW    = rightW / 2;

  fillRect(page, rightX, gridRow1Y, rightW, barH, teal);
  drawText(page, "INVOICE #", rightX + 8,           gridRow1Y + 4, bold, 9, white);
  drawText(page, "DATE",      rightX + halfRW + 8,  gridRow1Y + 4, bold, 9, white);
  drawText(page, invoiceNumber, rightX + 8,           gridRow1Y + barH + 5, bold, 10, black);
  drawText(page, invoiceDate,   rightX + halfRW + 8,  gridRow1Y + barH + 5, bold, 10, black);

  const r2HeaderY = gridRow1Y + barH + 18;
  fillRect(page, rightX, r2HeaderY, rightW, barH, teal);
  drawText(page, "VENDOR",    rightX + 8,          r2HeaderY + 4, bold, 9, white);
  drawText(page, "CATEGORY",  rightX + halfRW + 8, r2HeaderY + 4, bold, 9, white);
  drawText(page, VENDOR,                rightX + 8,          r2HeaderY + barH + 5, bold, 10, black);
  drawText(page, "LEASING COMMISSION",  rightX + halfRW + 8, r2HeaderY + barH + 5, bold, 10, black);

  // ── 5. Description / Property / Terms bar ─────────────────────────────
  const dpBarY  = 215;
  const dpColW1 = 230;
  const dpColW2 = 160;
  const dpColW3 = contentW - dpColW1 - dpColW2;

  fillRect(page, margin, dpBarY, contentW, barH, teal);
  drawText(page, "DESCRIPTION", margin + 8,                     dpBarY + 4, bold, 9, white);
  drawText(page, "PROPERTY",    margin + dpColW1 + 8,           dpBarY + 4, bold, 9, white);
  drawText(page, "TERMS",       margin + dpColW1 + dpColW2 + 8, dpBarY + 4, bold, 9, white);

  const meta = lookupBuildingMeta(entry.building);
  const propertyText = meta
    ? `${entry.building} · ${meta.name}`
    : entry.building || "";

  const dpRowY = dpBarY + barH + 8;
  drawText(page, `Leasing commission — ${entry.tenant || ""}`, margin + 8,                     dpRowY, regular, 10, black);
  drawText(page, propertyText,                                 margin + dpColW1 + 8,           dpRowY, regular, 10, dark);
  drawText(page, "Due upon receipt",                           margin + dpColW1 + dpColW2 + 8, dpRowY, regular, 10, dark);

  // ── 6. Line-items table ──────────────────────────────────────────────
  const tblY    = dpRowY + 26;
  const colDate = 75;
  const colDesc = 320;
  const colAcc  = 75;
  const colAmt  = contentW - colDate - colDesc - colAcc;

  fillRect(page, margin, tblY, contentW, barH, teal);
  drawText(page, "DATE",        margin + 8,                          tblY + 4, bold, 9, white);
  drawText(page, "DESCRIPTION", margin + colDate + 8,                tblY + 4, bold, 9, white);
  drawText(page, "ACC CODE",    margin + colDate + colDesc + 8,      tblY + 4, bold, 9, white);
  drawText(page, "AMOUNT",
    margin + colDate + colDesc + colAcc, tblY + 4, bold, 9, white,
    { maxWidth: colAmt - 8, align: "right" });

  // Stack the description lines: tenant·building/suite headline, then
  // lease window, then comments.
  const headline = entry.suite
    ? `${entry.tenant || ""} — ${entry.building}${entry.suite ? " · Suite " + entry.suite : ""}`
    : `${entry.tenant || ""} — ${entry.building || ""}`;
  const leaseLine = (entry.leaseFrom || entry.leaseTo)
    ? `Lease: ${toDisplayDate(entry.leaseFrom)} – ${toDisplayDate(entry.leaseTo)}${entry.termYears ? ` (${entry.termYears} yr)` : ""}`
    : "";
  const commentLines = wrap((entry.comments || "").trim(), regular, 10, colDesc - 16);

  let rowY = tblY + barH + 8;
  // First line: date + headline + acc + amount.
  drawText(page, invoiceDate,                  margin + 8,                          rowY, regular, 9, dark);
  drawText(page, headline,                     margin + colDate + 8,                rowY, bold,    10, black);
  drawText(page, ACC_CODE,                     margin + colDate + colDesc + 8,      rowY, regular, 10, dark);
  drawText(page, moneyStr(amount),
    margin + colDate + colDesc + colAcc, rowY, bold, 10, black,
    { maxWidth: colAmt - 8, align: "right" });
  rowY += 16;

  if (leaseLine) {
    drawText(page, leaseLine, margin + colDate + 8, rowY, regular, 10, dark);
    rowY += 14;
  }
  for (const cl of commentLines) {
    drawText(page, cl, margin + colDate + 8, rowY, regular, 10, dark);
    rowY += 14;
  }

  // Closing divider under the line block.
  page.drawLine({
    start: { x: margin,            y: py(page, rowY + 6) },
    end:   { x: margin + contentW, y: py(page, rowY + 6) },
    thickness: 0.6,
    color: rgb(0.82, 0.82, 0.82),
  });

  // ── 7. Total bar ───────────────────────────────────────────────────────
  const totalY = rowY + 26;
  fillRect(page, margin + colDate + colDesc, totalY, colAcc + colAmt, barH, rgb(0.88, 0.93, 0.96));
  drawText(page, "TOTAL", margin + colDate + colDesc + 8, totalY + 4, bold, 10, teal);
  drawText(page, moneyStr(amount),
    margin + colDate + colDesc + colAcc, totalY + 4, bold, 11, teal,
    { maxWidth: colAmt - 8, align: "right" });

  // ── 8. Footer ──────────────────────────────────────────────────────────
  const footY = 740;
  drawText(page, `Payable to ${VENDOR}`,    margin, footY,      bold,    10, black);
  drawText(page, "LIK Management Inc",      margin, footY + 14, regular, 10, dark);

  const bytes = await pdfDoc.save();
  return bytes;
}

/** Stable 8-digit invoice number derived from the commission id so
 *  re-downloads always produce the same number. */
export function invoiceNumberFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  // Clip to 8 digits, ensure no leading zero.
  return String(10000000 + (h % 90000000));
}

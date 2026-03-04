import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont } from "pdf-lib";
import { PropertyInvoice, PayrollParseResult } from "../types";

export type InvoicePdfInput = {
  invoice: PropertyInvoice;
  payroll: PayrollParseResult;
  invoiceNumber: string;
};

type Line = { description: string; accCode: string; amount: number };

function moneyStr(n: number) {
  return Number(n ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function buildLines(inv: PropertyInvoice): Line[] {
  const ACC_REC = "6030-8502";
  const ACC_NR  = "6010-8501";
  const lines: Line[] = [];
  const pushIf = (amount: number, description: string, accCode: string) => {
    if (Math.abs(Number(amount ?? 0)) < 0.005) return;
    lines.push({ description, accCode, amount: Number(amount) });
  };
  pushIf(inv.salaryREC, "Salary REC", ACC_REC);
  pushIf(inv.salaryNR,  "Salary NR",  ACC_NR);
  pushIf(inv.overtime,  "Overtime",   ACC_REC);
  pushIf(inv.holREC,    "HOL REC",    ACC_REC);
  pushIf(inv.holNR,     "HOL NR",     ACC_NR);
  pushIf(inv.er401k,    "401K ER",    ACC_NR);
  pushIf(inv.other,     "Other Pay",  ACC_NR);
  pushIf(inv.taxesEr,   "Taxes (ER)", ACC_REC);
  return lines;
}

// pdf-lib origin is bottom-left; convert from top-left y
function py(page: PDFPage, topY: number) {
  return page.getHeight() - topY;
}

function fillRect(
  page: PDFPage,
  x: number, topY: number, w: number, h: number,
  color: ReturnType<typeof rgb>
) {
  page.drawRectangle({ x, y: py(page, topY + h), width: w, height: h, color });
}

function drawText(
  page: PDFPage,
  str: string,
  x: number, topY: number,
  font: PDFFont, size: number,
  color: ReturnType<typeof rgb> = rgb(0, 0, 0),
  opts: { maxWidth?: number; align?: "left" | "right" } = {}
) {
  let drawX = x;
  if (opts.align === "right" && opts.maxWidth != null) {
    drawX = x + opts.maxWidth - font.widthOfTextAtSize(str, size);
  }
  // baseline = topY + size (ascender approximation for Helvetica)
  page.drawText(str, { x: drawX, y: py(page, topY + size * 0.85), font, size, color });
}

export async function renderInvoicePdf(input: InvoicePdfInput): Promise<Uint8Array> {
  const { invoice, invoiceNumber, payroll } = input;

  const pdfDoc  = await PDFDocument.create();
  const page    = pdfDoc.addPage([612, 792]); // US Letter

  const bold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Dark teal matching the reference invoice
  const teal  = rgb(0.051, 0.322, 0.396); // ≈ #0d5265
  const white = rgb(1, 1, 1);
  const black = rgb(0, 0, 0);
  const dark  = rgb(0.15, 0.15, 0.15);

  const margin   = 45;
  const pageW    = 612;
  const contentW = pageW - margin * 2;   // 522

  const propCode  = invoice.propertyCode  || invoice.propertyKey  || "";
  const propLabel = invoice.propertyLabel || invoice.propertyKey  || "";
  const payDate   = payroll.payDate ?? "";

  // ── 1. Company header (top-left) ────────────────────────────────────────────
  drawText(page, "LIK Management Inc",             margin, 38,  bold,    18, black);
  drawText(page, "8 Neshaminy Interplex; Suite 400", margin, 60,  regular, 10, dark);
  drawText(page, "Trevose, PA  19053",              margin, 74,  regular, 10, dark);

  // ── 2. "INVOICE" (top-right, teal, large) ───────────────────────────────────
  const invLabel = "INVOICE";
  const invSize  = 36;
  const invW     = bold.widthOfTextAtSize(invLabel, invSize);
  drawText(page, invLabel, pageW - margin - invW, 38, bold, invSize, teal);

  // ── 3. Layout split: left 310px = BILL TO, right 200px = info grid ──────────
  const leftW  = 310;
  const rightX = margin + leftW + 12;
  const rightW = contentW - leftW - 12;   // ≈ 200

  // BILL TO bar (full left width)
  const billBarY = 102;
  const barH     = 20;
  fillRect(page, margin, billBarY, leftW, barH, teal);
  drawText(page, "BILL TO", margin + 8, billBarY + 4, bold, 9, white);

  // Bill-to address
  drawText(page, propLabel,                  margin + 8, billBarY + barH + 10, bold, 10, black);
  drawText(page, "8 Neshaminy Interplex",    margin + 8, billBarY + barH + 24, regular, 10, dark);
  drawText(page, "Suite 400",                margin + 8, billBarY + barH + 38, regular, 10, dark);
  drawText(page, "Trevose, PA  19053",       margin + 8, billBarY + barH + 52, regular, 10, dark);

  // ── 4. Info grid (right side): Invoice#/Date + Property/Category ────────────
  const gridRow1Y = 102;
  const gridRow2Y = gridRow1Y + barH + 16 + barH; // header + value row + header
  const halfRW    = rightW / 2;

  // Row-1 header
  fillRect(page, rightX, gridRow1Y, rightW, barH, teal);
  drawText(page, "INVOICE #", rightX + 8,           gridRow1Y + 4, bold, 9, white);
  drawText(page, "DATE",      rightX + halfRW + 8,   gridRow1Y + 4, bold, 9, white);

  // Row-1 values
  drawText(page, invoiceNumber, rightX + 8,           gridRow1Y + barH + 5, bold, 10, black);
  drawText(page, payDate,       rightX + halfRW + 8,  gridRow1Y + barH + 5, bold, 10, black);

  // Row-2 header
  const r2HeaderY = gridRow1Y + barH + 18;
  fillRect(page, rightX, r2HeaderY, rightW, barH, teal);
  drawText(page, "PROPERTY",  rightX + 8,           r2HeaderY + 4, bold, 9, white);
  drawText(page, "CATEGORY",  rightX + halfRW + 8,   r2HeaderY + 4, bold, 9, white);

  // Row-2 values
  drawText(page, propCode,    rightX + 8,           r2HeaderY + barH + 5, bold, 10, black);
  drawText(page, "PAYROLL",   rightX + halfRW + 8,  r2HeaderY + barH + 5, bold, 10, black);

  // ── 5. Description/Period/Terms bar ─────────────────────────────────────────
  const dpBarY  = 215;
  const dpColW1 = 230; // DESCRIPTION col
  const dpColW2 = 160; // PERIOD col
  const dpColW3 = contentW - dpColW1 - dpColW2; // TERMS col

  fillRect(page, margin, dpBarY, contentW, barH, teal);
  drawText(page, "DESCRIPTION", margin + 8,                     dpBarY + 4, bold, 9, white);
  drawText(page, "PERIOD",      margin + dpColW1 + 8,           dpBarY + 4, bold, 9, white);
  drawText(page, "TERMS",       margin + dpColW1 + dpColW2 + 8, dpBarY + 4, bold, 9, white);

  // Description row
  const dpRowY = dpBarY + barH + 8;
  drawText(page, `Payroll Expenses — ${propLabel}`, margin + 8,                     dpRowY, regular, 10, black);
  drawText(page, `Pay period ending ${payDate}`,    margin + dpColW1 + 8,           dpRowY, regular, 10, dark);
  drawText(page, "Due upon receipt",                margin + dpColW1 + dpColW2 + 8, dpRowY, regular, 10, dark);

  // ── 6. Line-items table ──────────────────────────────────────────────────────
  const tblY   = dpRowY + 26;
  const colDate = 75;
  const colDesc = 195;
  const colAcc  = 110;
  const colAmt  = contentW - colDate - colDesc - colAcc;

  // Table header bar
  fillRect(page, margin, tblY, contentW, barH, teal);
  drawText(page, "DATE",        margin + 8,                             tblY + 4, bold, 9, white);
  drawText(page, "DESCRIPTION", margin + colDate + 8,                  tblY + 4, bold, 9, white);
  drawText(page, "ACC CODE",    margin + colDate + colDesc + 8,        tblY + 4, bold, 9, white);
  drawText(page, "AMOUNT",
    margin + colDate + colDesc + colAcc, tblY + 4, bold, 9, white,
    { maxWidth: colAmt - 8, align: "right" });

  const lines = buildLines(invoice);
  const rows  = lines.length ? lines : [{ description: "No charges", accCode: "", amount: 0 }];

  let rowY = tblY + barH + 8;
  for (const line of rows) {
    drawText(page, payDate,          margin + 8,                          rowY, regular, 9,  dark);
    drawText(page, line.description, margin + colDate + 8,               rowY, regular, 10, black);
    drawText(page, line.accCode,     margin + colDate + colDesc + 8,     rowY, regular, 10, dark);
    drawText(page, moneyStr(line.amount),
      margin + colDate + colDesc + colAcc, rowY, regular, 10, black,
      { maxWidth: colAmt - 8, align: "right" });

    // thin divider
    page.drawLine({
      start: { x: margin,            y: py(page, rowY + 14) },
      end:   { x: margin + contentW, y: py(page, rowY + 14) },
      thickness: 0.4, color: rgb(0.82, 0.82, 0.82),
    });
    rowY += 20;
  }

  // ── 7. Footer ────────────────────────────────────────────────────────────────
  const footY = 740;
  drawText(page, "Payable to LIKM4",      margin, footY,      bold,    10, black);
  drawText(page, "LIK Management Inc",    margin, footY + 14, regular, 10, dark);

  // TOTAL bar (right-aligned, spans ~260px)
  const totalBarW = 260;
  const totalBarX = margin + contentW - totalBarW;
  const totalBarH = 28;
  fillRect(page, totalBarX, footY - 4, totalBarW, totalBarH, teal);

  drawText(page, "TOTAL", totalBarX + 14, footY - 4 + 6, bold, 14, white);
  drawText(page, moneyStr(invoice.total),
    totalBarX + 14, footY - 4 + 6, bold, 14, white,
    { maxWidth: totalBarW - 24, align: "right" });

  return pdfDoc.save();
}

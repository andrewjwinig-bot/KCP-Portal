import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont } from "pdf-lib";
import { PropertyInvoice, PayrollParseResult } from "../types";

export type InvoicePdfInput = {
  invoice: PropertyInvoice;
  payroll: PayrollParseResult;
  invoiceNumber: string;
};

type Line = { description: string; accCode: string; amount: number };

function moneyStr(n: number) {
  const v = Number(n ?? 0);
  return v.toLocaleString("en-US", { style: "currency", currency: "USD" });
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
  return lines;
}

// pdf-lib uses bottom-left origin; helper converts top-left y to pdf y
function topY(page: PDFPage, y: number) {
  return page.getHeight() - y;
}

// Draw a filled rectangle (top-left coords)
function fillRect(page: PDFPage, x: number, y: number, w: number, h: number, color: ReturnType<typeof rgb>) {
  page.drawRectangle({ x, y: topY(page, y + h), width: w, height: h, color });
}

// Draw text at top-left coords
function text(
  page: PDFPage,
  str: string,
  x: number,
  y: number,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof rgb> = rgb(0, 0, 0),
  opts: { maxWidth?: number; align?: "left" | "right" | "center" } = {}
) {
  let drawX = x;
  if (opts.align === "right" && opts.maxWidth != null) {
    const w = font.widthOfTextAtSize(str, size);
    drawX = x + opts.maxWidth - w;
  } else if (opts.align === "center" && opts.maxWidth != null) {
    const w = font.widthOfTextAtSize(str, size);
    drawX = x + (opts.maxWidth - w) / 2;
  }
  page.drawText(str, { x: drawX, y: topY(page, y + size), font, size, color });
}

export async function renderInvoicePdf(input: InvoicePdfInput): Promise<Uint8Array> {
  const { invoice, invoiceNumber, payroll } = input;

  const pdfDoc = await PDFDocument.create();
  const page   = pdfDoc.addPage([612, 792]); // US Letter

  const bold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const blue  = rgb(0.043, 0.290, 0.490); // #0b4a7d
  const white = rgb(1, 1, 1);
  const black = rgb(0, 0, 0);
  const grey  = rgb(0.4, 0.4, 0.4);

  const margin = 36;
  const pageW  = 612;
  const contentW = pageW - margin * 2;

  // ── Header ──────────────────────────────────────────────
  text(page, "LIK Management Inc",            margin, 36,  bold,    18, black);
  text(page, "8 Neshaminy Interplex; Suite 400", margin, 60,  regular, 10, black);
  text(page, "Trevose, PA  19053",             margin, 74,  regular, 10, black);

  // INVOICE title (right)
  const invW = 160;
  text(page, "INVOICE", pageW - margin - invW, 36, bold, 32, blue,
       { maxWidth: invW, align: "right" });

  // ── Bill To block ─────────────────────────────────────────
  const billY = 110;
  fillRect(page, margin, billY, 260, 18, blue);
  text(page, "BILL TO", margin + 8, billY + 4, bold, 9, white);

  text(page, invoice.propertyLabel ?? invoice.propertyKey, margin + 8, billY + 26, regular, 10, black);
  text(page, "8 Neshaminy Interplex",   margin + 8, billY + 40, regular, 10, black);
  text(page, "Suite 400",               margin + 8, billY + 54, regular, 10, black);
  text(page, "Trevose, PA  19053",      margin + 8, billY + 68, regular, 10, black);

  // ── Info blocks (right side) ─────────────────────────────
  const infoX = pageW - margin - 300;
  const infoW = 300;
  const rowH  = 18;

  function headerBar(y: number, leftLabel: string, rightLabel: string) {
    fillRect(page, infoX, y, infoW, rowH, blue);
    text(page, leftLabel,  infoX + 10,          y + 4, bold, 9, white);
    text(page, rightLabel, infoX + infoW / 2 + 10, y + 4, bold, 9, white);
  }

  headerBar(billY, "INVOICE #", "DATE");
  text(page, invoiceNumber,              infoX + 10,              billY + rowH + 5, bold, 10, black);
  text(page, payroll.payDate ?? "",      infoX + infoW / 2 + 10,  billY + rowH + 5, bold, 10, black);

  headerBar(billY + 52, "PROPERTY", "TERMS");
  const propDisplay = invoice.propertyCode && invoice.propertyCode !== invoice.propertyLabel
    ? invoice.propertyCode
    : (invoice.propertyLabel ?? invoice.propertyKey);
  text(page, propDisplay,        infoX + 10,             billY + 52 + rowH + 5, bold, 10, black);
  text(page, "Due upon receipt", infoX + infoW / 2 + 10, billY + 52 + rowH + 5, regular, 10, black);

  // ── Line-item table ───────────────────────────────────────
  const tableY  = 250;
  const colDesc = 260;
  const colAcc  = 120;
  const colAmt  = contentW - colDesc - colAcc;

  fillRect(page, margin, tableY, contentW, 20, blue);
  text(page, "DESCRIPTION", margin + 10,           tableY + 5, bold, 10, white);
  text(page, "ACC CODE",    margin + colDesc + 10,  tableY + 5, bold, 10, white);
  text(page, "AMOUNT",
    margin + colDesc + colAcc, tableY + 5, bold, 10, white,
    { maxWidth: colAmt - 10, align: "right" });

  const lines = buildLines(invoice);
  const rows  = lines.length ? lines : [{ description: "No charges", accCode: "", amount: 0 }];

  let rowY = tableY + 28;
  for (const line of rows) {
    text(page, line.description, margin + 10,          rowY, regular, 10, black);
    text(page, line.accCode,     margin + colDesc + 10, rowY, regular, 10, black);
    text(page, moneyStr(line.amount),
      margin + colDesc + colAcc, rowY, regular, 10, black,
      { maxWidth: colAmt - 10, align: "right" });

    // divider
    page.drawLine({
      start: { x: margin,             y: topY(page, rowY + 16) },
      end:   { x: margin + contentW,  y: topY(page, rowY + 16) },
      thickness: 0.5, color: rgb(0.78, 0.78, 0.78),
    });
    rowY += 24;
  }

  // ── Footer totals ─────────────────────────────────────────
  const footerY = 660;
  text(page, "Payable to LIKM4", margin, footerY, bold, 10, black);

  const fRight = margin + contentW;
  text(page, "SUBTOTAL",        fRight - 240, footerY,      regular, 10, black);
  text(page, moneyStr(invoice.total), fRight - 120, footerY, regular, 10, black,
       { maxWidth: 120, align: "right" });
  text(page, "TAX RATE",        fRight - 240, footerY + 18, regular, 10, black);
  text(page, "n/a",             fRight - 120, footerY + 18, regular, 10, black,
       { maxWidth: 120, align: "right" });
  text(page, "TAX",             fRight - 240, footerY + 36, regular, 10, black);
  text(page, "n/a",             fRight - 120, footerY + 36, regular, 10, black,
       { maxWidth: 120, align: "right" });

  fillRect(page, margin, 720, contentW, 28, blue);
  text(page, "TOTAL",           margin + 12, 726, bold, 16, white);
  text(page, moneyStr(invoice.total), margin + contentW - 200, 726, bold, 16, white,
       { maxWidth: 190, align: "right" });

  return pdfDoc.save();
}

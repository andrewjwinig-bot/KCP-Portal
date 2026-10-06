// The CONTROL SHEET — the memo's second page (owner: Marie "needs [the memo]
// … so she can cross check all the individual commissions invoices to what
// she sees in avid … as well as a control sheet"). One line per invoice as
// AvidXchange received it: the invoice number, tenant, property, suite, the
// commission and the amount billed (× 1.2), with a tick box and the totals.
// Shared by the office (per fund) and retail memos so the two read the same.

import { PDFDocument, rgb, type PDFFont } from "pdf-lib";
import type { CommissionEntry } from "@/lib/commissions";
import { commissionInvoiceDate, commissionInvoiceNumber } from "@/lib/pdf/renderCommissionInvoicePdf";

const MARKUP = 1.2;

export function addControlSheet(pdf: PDFDocument, fonts: { font: PDFFont; bold: PDFFont }, opts: {
  title: string;          // "FNIPLX — Q3 2026" / "Shopping Centers — Q3 2026"
  entries: CommissionEntry[];
}) {
  const { font, bold } = fonts;
  const page = pdf.addPage([612, 792]);
  const navy = rgb(11 / 255, 74 / 255, 125 / 255);
  const white = rgb(1, 1, 1);
  const ink = rgb(0.10, 0.12, 0.15);
  const gray = rgb(0.42, 0.46, 0.52);
  const shade = rgb(0.945, 0.955, 0.965);
  const rule = rgb(0.80, 0.82, 0.86);
  const margin = 40, right = 572, contentW = right - margin;
  const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const txt = (s: string, x: number, y: number, size = 9, b = false, color = ink) =>
    page.drawText(s, { x, y, font: b ? bold : font, size, color });
  const txtR = (s: string, xr: number, y: number, size = 9, b = false, color = ink) =>
    page.drawText(s, { x: xr - (b ? bold : font).widthOfTextAtSize(s, size), y, font: b ? bold : font, size, color });
  const fit = (s: string, w: number, size: number) => {
    if (font.widthOfTextAtSize(s, size) <= w) return s;
    let t = s;
    while (t.length > 1 && font.widthOfTextAtSize(t + "…", size) > w) t = t.slice(0, -1);
    return t + "…";
  };

  let y = 742;
  txt("CONTROL SHEET", margin, y, 17, true, navy);
  txtR(opts.title, right, y + 2, 11, true, navy);
  y -= 16;
  txt("Every invoice sent to AvidXchange — tick each one off against Avid. Vendor LIKM4 · Account 1940-8501.", margin, y, 8.5, false, gray);
  y -= 10;
  page.drawRectangle({ x: margin, y, width: contentW, height: 2, color: navy });
  y -= 22;

  const cols = [
    { label: "✓",          x: 40,  w: 16, r: false },
    { label: "Invoice #",  x: 60,  w: 128, r: false },
    { label: "Date",       x: 188, w: 50, r: false },
    { label: "Tenant",     x: 238, w: 138, r: false },
    { label: "Property",   x: 376, w: 44, r: false },
    { label: "Suite",      x: 420, w: 36, r: false },
    { label: "Commission", x: 456, w: 54, r: true },
    { label: "Billed",     x: 510, w: 62, r: true },
  ];
  cols.forEach((c, i) => {
    if (i === 0) return;
    c.r ? txtR(c.label, c.x + c.w, y, 8, true, gray) : txt(c.label, c.x, y, 8, true, gray);
  });
  y -= 5;
  page.drawLine({ start: { x: margin, y }, end: { x: right, y }, thickness: 0.75, color: rule });
  y -= 14;

  const rows = [...opts.entries].sort((a, b) =>
    (a.building || "").localeCompare(b.building || "") || (a.suite || "").localeCompare(b.suite || "", undefined, { numeric: true }));
  let com = 0, billed = 0;
  rows.forEach((e, idx) => {
    if (y < 70) return; // one page holds ~40 invoices — far more than a quarter carries
    const c = Number(e.incentiveAmount) || 0;
    const b = Math.round(c * MARKUP * 100) / 100;
    com += c; billed += b;
    if (idx % 2 === 1) page.drawRectangle({ x: margin, y: y - 4, width: contentW, height: 15, color: shade });
    page.drawRectangle({ x: 42, y: y - 1, width: 8, height: 8, borderColor: gray, borderWidth: 0.75 });
    const no = commissionInvoiceNumber(e);
    const noSize = Math.min(8.5, 8.5 * (cols[1].w - 4) / Math.max(1, bold.widthOfTextAtSize(no, 8.5)));
    page.drawText(no, { x: cols[1].x, y, font: bold, size: noSize, color: ink });
    txt(commissionInvoiceDate(e) ?? "", cols[2].x, y, 8.5);
    txt(fit(e.tenant || "—", cols[3].w - 4, 8.5), cols[3].x, y, 8.5);
    txt(e.building || "—", cols[4].x, y, 8.5);
    txt(e.suite || "—", cols[5].x, y, 8.5);
    txtR(money(c), cols[6].x + cols[6].w, y, 8.5);
    txtR(money(b), cols[7].x + cols[7].w, y, 8.5, true);
    y -= 16;
  });

  page.drawRectangle({ x: margin, y: y - 7, width: contentW, height: 22, color: navy });
  txt(`${rows.length} invoice${rows.length === 1 ? "" : "s"}`, margin + 8, y, 10, true, white);
  txtR(money(com), cols[6].x + cols[6].w, y, 10, true, white);
  txtR(money(billed), cols[7].x + cols[7].w, y, 10, true, white);
  y -= 30;
  txt("Billed = commission × 1.2 (the 20% markup) — the amount on each AvidXchange invoice.", margin, y, 8.5, false, gray);
}

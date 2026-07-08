import jsPDF from "jspdf";
import { toMoney } from "../expenses/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

export type AllocLineItem = {
  accountCode: string;    // e.g. "8220-9301"
  accountName: string;
  accountSuffix: "9301" | "9302" | "9303";
  grossAmount: number;    // total GL net for this account code
  allocPct: number;       // 0..1
  allocAmount: number;    // grossAmount * allocPct (penny-rounded)
};

export type BuildAllocInvoicePdfArgs = {
  propertyId: string;
  propertyName: string;
  periodText: string;
  periodEndDate: string;   // YYYY-MM-DD
  statementMonth: string;  // YYYY-MM
  invoiceDate: string;     // YYYY-MM-DD
  invoiceId: string;
  lineItems: AllocLineItem[];
  grandTotal: number;
};

// ─── Colors ──────────────────────────────────────────────────────────────────

const TEAL        = { r: 10,  g: 70,  b: 85  };
const SUBTOTAL_BG = { r: 219, g: 237, b: 245 };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDateDisplay(yyyymmdd: string): string {
  const [y, m, d] = (yyyymmdd || "").split("-");
  if (!y || !m || !d) return yyyymmdd || "";
  return `${m}/${d}/${y}`;
}

function formatStatementMonth(yyyymm: string): string {
  const [y, m] = (yyyymm || "").split("-").map(Number);
  if (!y || !m) return yyyymm || "";
  return new Date(y, m - 1, 1).toLocaleString(undefined, { month: "long", year: "numeric" });
}

function truncate(s: string, maxChars: number): string {
  return s.length > maxChars ? s.slice(0, maxChars - 1) + "…" : s;
}

// ─── ID generator ────────────────────────────────────────────────────────────

export function makeAllocInvoiceId(propId: string): string {
  const n = Math.floor(10 + Math.random() * 90);
  const clean = String(propId || "ALI").replace(/[^A-Z0-9]/gi, "").toUpperCase();
  return `${clean}${n}`;
}

// ─── PDF builder ─────────────────────────────────────────────────────────────

export function buildAllocInvoicePdf(args: BuildAllocInvoicePdfArgs): Blob {
  const doc     = new jsPDF({ unit: "pt", format: "letter" });
  const margin  = 40;
  const pageW   = doc.internal.pageSize.getWidth();   // 612
  const pageH   = doc.internal.pageSize.getHeight();  // 792
  const contentW = pageW - margin * 2;                // 532

  // ── PAGE 1 — HEADER ────────────────────────────────────────────────────────

  // "INVOICE" heading (top-right, large teal)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.setTextColor(TEAL.r, TEAL.g, TEAL.b);
  doc.text("INVOICE", pageW - margin, 62, { align: "right" });

  // Company name / address (top-left)
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("LIK Management Inc", margin, 60);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("8 Neshaminy Interplex; Suite 400", margin, 78);
  doc.text("Trevose, PA  19053", margin, 92);

  // Meta box (top-right)
  const metaX = pageW - margin - 220;
  const metaY = 95;

  // Row 1 header: INVOICE # | DATE
  doc.setFillColor(TEAL.r, TEAL.g, TEAL.b);
  doc.rect(metaX, metaY, 220, 20, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("INVOICE #", metaX + 10, metaY + 14);
  doc.text("DATE",       metaX + 140, metaY + 14);

  // Row 1 values
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(args.invoiceId,                          metaX + 10,  metaY + 36);
  doc.text(formatDateDisplay(args.invoiceDate),     metaX + 140, metaY + 36);

  // Row 2 header: PROPERTY | STATEMENT PERIOD
  doc.setFillColor(TEAL.r, TEAL.g, TEAL.b);
  doc.rect(metaX, metaY + 48, 220, 20, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("PROPERTY",         metaX + 10,  metaY + 62);
  doc.text("GL EXPENSES",      metaX + 140, metaY + 62);

  // Row 2 values
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(args.propertyId,                         metaX + 10,  metaY + 84);
  doc.text(formatStatementMonth(args.statementMonth), metaX + 140, metaY + 84);

  // Bill To block (left)
  doc.setFillColor(TEAL.r, TEAL.g, TEAL.b);
  doc.rect(margin, 120, 260, 18, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("BILL TO", margin + 8, 133);

  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(truncate(args.propertyName, 38), margin + 8, 155);
  doc.setFont("helvetica", "normal");
  doc.text("8 Neshaminy Interplex", margin + 8, 170);
  doc.text("Suite 400",             margin + 8, 185);
  doc.text("Trevose, PA  19053",    margin + 8, 200);

  // Description / Period / Terms bar
  const barY = 225;
  doc.setFillColor(TEAL.r, TEAL.g, TEAL.b);
  doc.rect(margin, barY, contentW, 18, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  const periodX  = margin + 270;
  const termsX   = margin + contentW - 8;
  doc.text("DESCRIPTION", margin + 8,  barY + 13);
  doc.text("PERIOD",      periodX,      barY + 13);
  doc.text("TERMS",       termsX,       barY + 13, { align: "right" });

  const periodLabel = args.periodText || formatStatementMonth(args.statementMonth);
  const descMaxW    = periodX - margin - 16;
  const periodW     = termsX - 110 - periodX - 8;

  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`GL Allocated Expenses — ${args.propertyName}`, margin + 8, barY + 36, { maxWidth: descMaxW });
  doc.text(periodLabel, periodX, barY + 36, { maxWidth: periodW });
  doc.text("Due upon receipt", termsX, barY + 36, { align: "right" });

  // ── PAGE 1 — SUMMARY TABLE ─────────────────────────────────────────────────
  // Columns: ACC CODE (90) | ACCOUNT NAME (190) | GROSS AMT (80) | ALLOC % (70) | AMOUNT (102)
  // Total = 532

  const colAccCode   = 90;
  const colAccName   = 190;
  const colGross     = 80;
  const colAllocPct  = 70;
  const colAmount    = contentW - colAccCode - colAccName - colGross - colAllocPct; // 102

  const xAccCode  = margin;
  const xAccName  = xAccCode  + colAccCode;
  const xGross    = xAccName  + colAccName;
  const xAllocPct = xGross    + colGross;
  const xAmount   = xAllocPct + colAllocPct;

  const tableTop   = 280;
  const headerH    = 18;
  const rowH       = 20;
  const subRowH    = 20;
  const bottomMgn  = 110;

  const drawTableHeader = (yTop: number) => {
    doc.setFillColor(TEAL.r, TEAL.g, TEAL.b);
    doc.rect(margin, yTop, contentW, headerH, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text("ACC CODE",     xAccCode  + 6,               yTop + 13);
    doc.text("ACCOUNT NAME", xAccName  + 6,               yTop + 13);
    doc.text("GROSS AMOUNT", xGross    + colGross   - 6,  yTop + 13, { align: "right" });
    doc.text("ALLOC %",      xAllocPct + colAllocPct - 6, yTop + 13, { align: "right" });
    doc.text("AMOUNT",       xAmount   + colAmount   - 6, yTop + 13, { align: "right" });
    doc.setTextColor(0, 0, 0);
  };

  drawTableHeader(tableTop);
  let y = tableTop + headerH;

  // Group line items by base account code (7110, 8220, …). Within each group
  // list a row per allocation suffix (9301, 9302, …) and then an 8501 subtotal
  // — the property's payable account — so the total owed per account is easy to
  // read. (Previously this grouped by suffix, which listed every account twice.)
  const suffixRank: Record<string, number> = { "9301": 0, "9302": 1, "9303": 2 };
  const baseOf = (code: string) => code.replace(/-\d{3,4}$/, "");
  const byBase = new Map<string, AllocLineItem[]>();
  for (const item of args.lineItems) {
    const b = baseOf(item.accountCode);
    const g = byBase.get(b) ?? [];
    g.push(item);
    byBase.set(b, g);
  }
  const bases = [...byBase.keys()].sort((a, b) => a.localeCompare(b));

  const pageBreak = () => {
    drawPageFooter(doc, margin, pageH, contentW, args.grandTotal);
    doc.addPage();
    y = margin;
    drawTableHeader(y);
    y += headerH;
  };

  for (const base of bases) {
    const group = (byBase.get(base) ?? []).slice()
      .sort((a, b) => (suffixRank[a.accountSuffix] ?? 9) - (suffixRank[b.accountSuffix] ?? 9));
    const accName = group[0]?.accountName ?? "";

    // Keep an account's rows + its subtotal together on one page.
    const blockH = group.length * rowH + subRowH + 4;
    if (y + blockH > pageH - bottomMgn) pageBreak();

    for (const item of group) {
      // Row separator
      doc.setDrawColor(210, 210, 210);
      doc.line(margin, y, margin + contentW, y);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      doc.text(`${base}-${item.accountSuffix}`,               xAccCode  + 6,               y + 14);
      doc.text(truncate(item.accountName, 32),                 xAccName  + 6,               y + 14);
      doc.text(toMoney(item.grossAmount),                      xGross    + colGross   - 6,  y + 14, { align: "right" });
      doc.text((item.allocPct * 100).toFixed(2) + "%",        xAllocPct + colAllocPct - 6, y + 14, { align: "right" });
      doc.text(toMoney(item.allocAmount),                      xAmount   + colAmount   - 6, y + 14, { align: "right" });

      y += rowH;
    }

    // Subtotal row (the -8501 property payable account) summing this account's
    // allocated amounts.
    const groupTotal = group.reduce((a, r) => a + r.allocAmount, 0);
    doc.setFillColor(SUBTOTAL_BG.r, SUBTOTAL_BG.g, SUBTOTAL_BG.b);
    doc.rect(margin, y, contentW, subRowH, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(TEAL.r, TEAL.g, TEAL.b);
    doc.text(`${base}-8501`, xAccCode + 6, y + 14);
    doc.text(`${truncate(accName, 28)} Subtotal`, xAccName + 6, y + 14);
    doc.setTextColor(0, 0, 0);
    doc.text(toMoney(groupTotal), xAmount + colAmount - 6, y + 14, { align: "right" });
    y += subRowH + 4;
  }

  // Footer / TOTAL box on last page
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text("Payable to LIKM1",             margin, pageH - 88);
  doc.text("Korman Commercial Properties", margin, pageH - 72);

  doc.setFillColor(TEAL.r, TEAL.g, TEAL.b);
  doc.rect(margin + contentW - 220, pageH - 95, 220, 40, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.text("TOTAL",                                      margin + contentW - 210, pageH - 68);
  doc.text(toMoney(args.grandTotal).replace("$", "$ "), margin + contentW - 10,  pageH - 68, { align: "right" });
  doc.setTextColor(0, 0, 0);

  return doc.output("blob") as Blob;
}

function drawPageFooter(
  doc: jsPDF,
  margin: number,
  pageH: number,
  contentW: number,
  grandTotal: number
) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text("Payable to LIKM1",             margin, pageH - 88);
  doc.text("Korman Commercial Properties", margin, pageH - 72);

  doc.setFillColor(TEAL.r, TEAL.g, TEAL.b);
  doc.rect(margin + contentW - 220, pageH - 95, 220, 40, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.text("TOTAL",                                     margin + contentW - 210, pageH - 68);
  doc.text(toMoney(grandTotal).replace("$", "$ "),     margin + contentW - 10,  pageH - 68, { align: "right" });
  doc.setTextColor(0, 0, 0);
}

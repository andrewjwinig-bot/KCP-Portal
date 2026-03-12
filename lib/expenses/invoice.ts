import jsPDF from "jspdf";
import { toMoney } from "./utils";

/**
 * Invoice PDF builder — one invoice per property.
 *
 * Page 1: Summary — one light-blue subtotal row per (category, account-code)
 *                    group, grand total box at bottom.
 * Pages 2+: Detail — all individual charges grouped by category then account
 *                     code, with a light-blue subtotal row after each group.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

type Tx = {
  date: string;
  description: string;
  amount: number;
  category: string;
  suite: string;
  codedDescription: string;
  originalAmount?: number;
};

export type CategoryGroup = {
  category: string;
  items: Tx[];
};

export type BuildInvoicePdfArgs = {
  propertyName: string;
  propertyCode: string;
  categoryGroups: CategoryGroup[];
  invoiceDate: string;     // YYYY-MM-DD
  statementMonth: string;  // YYYY-MM
  periodText?: string;
  periodCompact?: string;  // MM/DD/YY-MM/DD/YY (short form for the header row)
  invoiceId?: string;
};

// ─── Lookup tables (mirrored from App.tsx) ──────────────────────────────────

const CATEGORY_ACC: Record<string, string> = {
  "MARKETING NR": "7110",
  "BUILDING MAINT.": "8220",
  TI: "1440",
  "OFFICE SUPPLIES": "9830",
  AUTO: "8980",
  TELEPHONE: "8940",
  "COMP & IT": "8400",
  "MEALS & ENT.": "8890",
  "TRAINING & EDU": "8330",
  "G&A": "8990",
  LANDSCAPING: "6330",
  "EQUIPMENT (CAP)": "1450",
  "BUILDINGS (CAP)": "1430",
};

const PROPERTY_ACC2: Record<string, string[]> = {
  "BP & SC": ["9301", "9302"],
  BP: ["9301"],
  SC: ["9302"],
  KH: ["8501"],
  PJV3: ["8501"],
  PNIPLX: ["8501"],
  PIIICO: ["8501"],
  "1100": ["8501"],
  "1500": ["8501"],
  "2000": ["9301", "9302"],
  "2010": ["8501"],
  "2040": ["8501"],
  "2070": ["8501"],
  "2080": ["8501"],
  "2300": ["8501"],
  "3610": ["8501"],
  "3620": ["8501"],
  "3640": ["8501"],
  "4050": ["8501"],
  "4060": ["8501"],
  "4070": ["8501"],
  "4080": ["8501"],
  "40A0": ["8501"],
  "40B0": ["8501"],
  "40C0": ["8501"],
  "4500": ["8501"],
  "4900": ["8501"],
  "5600": ["8501"],
  "7010": ["8501"],
  "7200": ["8501"],
  "7300": ["8501"],
  "8200": ["8501"],
  "9200": ["8501"],
  "9510": ["8501"],
  "9800": ["8501"],
  "9820": ["8501"],
  "9840": ["8501"],
  "9860": ["8501"],
  "0200": ["8501"],
  "0300": ["8501"],
  "0800": ["8501"],
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatStatementMonth(yyyymm: string) {
  const [y, m] = yyyymm.split("-").map((x) => Number(x));
  if (!y || !m) return yyyymm;
  return new Date(y, m - 1, 1).toLocaleString(undefined, { month: "long", year: "numeric" });
}

function formatDateDisplay(yyyymmdd: string): string {
  const [y, m, d] = (yyyymmdd || "").split("-");
  if (!y || !m || !d) return yyyymmdd || "";
  return `${m}/${d}/${y}`;
}

function cents(n: number) { return Math.round((Number(n) || 0) * 100); }
function dollarsFromCents(c: number) { return c / 100; }

function splitCentsEvenly(totalCents: number, n: number): number[] {
  if (n <= 1) return [totalCents];
  const base = Math.floor(totalCents / n);
  const rem = totalCents - base * n;
  const arr = Array(n).fill(base) as number[];
  for (let i = 0; i < rem; i++) arr[i] += 1;
  return arr;
}

function truncate(s: string, maxChars: number): string {
  return s.length > maxChars ? s.slice(0, maxChars - 1) + "…" : s;
}

// ─── Line builder ────────────────────────────────────────────────────────────

type InvoiceLine = {
  date: string;
  accountCode: string;
  description: string;
  amount: number;
  originalAmount?: number; // CC statement amount before allocation split
};

function buildLinesForCategory(
  category: string,
  propertyCode: string,
  items: Tx[]
): InvoiceLine[] {
  const suffixes = PROPERTY_ACC2[propertyCode] || [];

  return items.flatMap((t) => {
    const useDesc = (t.codedDescription || "").trim() || (t.description || "").trim() || "";
    const orig = t.originalAmount !== undefined ? t.originalAmount : Number(t.amount || 0);

    if (category === "EQUIPMENT (CAP)") {
      const amt = Number(t.amount || 0);
      return [{ date: t.date, accountCode: "1450-0000", description: useDesc, amount: amt, originalAmount: orig }];
    }
    if (category === "BUILDINGS (CAP)") {
      const amt = Number(t.amount || 0);
      return [{ date: t.date, accountCode: "1430-0000", description: useDesc, amount: amt, originalAmount: orig }];
    }

    const acc = CATEGORY_ACC[category] || "";
    if (!acc || suffixes.length === 0) {
      const amt = Number(t.amount || 0);
      return [{ date: t.date, accountCode: "", description: useDesc, amount: amt, originalAmount: orig }];
    }

    const split = splitCentsEvenly(cents(Number(t.amount || 0)), suffixes.length);
    return suffixes.map((suf, i) => ({
      date: t.date,
      accountCode: `${acc}-${suf}`,
      description: useDesc,
      amount: dollarsFromCents(split[i]),
      originalAmount: orig,
    }));
  });
}

// ─── ID generator ────────────────────────────────────────────────────────────

export function makeInvoiceId(prefix: string) {
  const n = Math.floor(10 + Math.random() * 90);
  const clean = String(prefix || "INV").replace(/[^A-Z0-9]/gi, "").toUpperCase();
  return `${clean}${n}`;
}

// ─── Colors ──────────────────────────────────────────────────────────────────

const TEAL        = { r: 10,  g: 70,  b: 85  };
const SUBTOTAL_BG = { r: 219, g: 237, b: 245 };

// ─── PDF builder ─────────────────────────────────────────────────────────────

export function buildInvoicePdf(args: BuildInvoicePdfArgs): Blob {
  const doc    = new jsPDF({ unit: "pt", format: "letter" });
  const margin = 40;
  const pageW  = doc.internal.pageSize.getWidth();   // 612
  const pageH  = doc.internal.pageSize.getHeight();  // 792
  const contentW = pageW - margin * 2;               // 532

  const invoiceId = args.invoiceId || makeInvoiceId(args.propertyCode);

  // ── Compute grand total up front (used on both pages) ──────────────────
  let grandTotal = 0;
  for (const cg of args.categoryGroups) {
    for (const t of cg.items) grandTotal += Number(t.amount || 0);
  }

  // ════════════════════════════════════════════════════════════════════════
  // PAGE 1 — HEADER BLOCK
  // ════════════════════════════════════════════════════════════════════════

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

  // Row 1: INVOICE # | DATE
  doc.setFillColor(TEAL.r, TEAL.g, TEAL.b);
  doc.rect(metaX, metaY, 220, 20, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("INVOICE #", metaX + 10, metaY + 14);
  doc.text("DATE",       metaX + 140, metaY + 14);

  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(invoiceId,                         metaX + 10,  metaY + 36);
  doc.text(formatDateDisplay(args.invoiceDate), metaX + 140, metaY + 36);

  // Row 2: PROPERTY | CC EXPENSES
  doc.setFillColor(TEAL.r, TEAL.g, TEAL.b);
  doc.rect(metaX, metaY + 48, 220, 20, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("PROPERTY",    metaX + 10,  metaY + 62);
  doc.text("CC EXPENSES", metaX + 140, metaY + 62);

  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(args.propertyCode,                         metaX + 10,  metaY + 84);
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
  doc.text(args.propertyName, margin + 8, 155);
  doc.setFont("helvetica", "normal");
  doc.text("8 Neshaminy Interplex", margin + 8, 170);
  doc.text("Suite 400",            margin + 8, 185);
  doc.text("Trevose, PA  19053",   margin + 8, 200);

  // Description / Period / Terms bar
  const barY = 225;
  doc.setFillColor(TEAL.r, TEAL.g, TEAL.b);
  doc.rect(margin, barY, contentW, 18, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  const periodX = margin + 270;
  doc.text("DESCRIPTION",                   margin + 8,            barY + 13);
  doc.text("PERIOD",                         periodX,               barY + 13);
  doc.text("TERMS",                          margin + contentW - 8, barY + 13, { align: "right" });

  const periodLabel = args.periodCompact
    || args.periodText
    || formatStatementMonth(args.statementMonth);
  // Right-align terms column; period column starts at periodX
  const termsX = margin + contentW - 8;
  const termsW = 110; // width reserved for "Due upon receipt"
  const periodW = termsX - termsW - periodX - 8;
  const descMaxW = periodX - margin - 16;

  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`Credit Card Expenses — ${args.propertyName}`, margin + 8, barY + 36, { maxWidth: descMaxW });
  doc.text(periodLabel, periodX, barY + 36, { maxWidth: periodW });
  doc.text("Due upon receipt", termsX, barY + 36, { align: "right" });

  // ════════════════════════════════════════════════════════════════════════
  // PAGE 1 — SUMMARY TABLE
  // Columns: CATEGORY (220) | ACC CODE (130) | SUBTOTAL (182, right-aligned)
  // ════════════════════════════════════════════════════════════════════════

  const sumColCat   = 220;
  const sumColAcc   = 130;
  const sumColTotal = contentW - sumColCat - sumColAcc; // 182
  const sumXCat     = margin;
  const sumXAcc     = sumXCat + sumColCat;
  const sumXTotal   = sumXAcc + sumColAcc;

  const sumTableTop = 280;
  const sumHeaderH  = 18;
  const sumRowH     = 22;

  // Header row
  doc.setFillColor(TEAL.r, TEAL.g, TEAL.b);
  doc.rect(margin, sumTableTop, contentW, sumHeaderH, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text("CATEGORY", sumXCat   + 8,                         sumTableTop + 13);
  doc.text("ACC CODE",  sumXAcc   + 8,                         sumTableTop + 13);
  doc.text("SUBTOTAL",  sumXTotal + sumColTotal - 8,            sumTableTop + 13, { align: "right" });

  let sumY = sumTableTop + sumHeaderH;

  for (const cg of args.categoryGroups) {
    const lines = buildLinesForCategory(cg.category, args.propertyCode, cg.items);

    // Aggregate by account code (preserve first-seen order)
    const byAcc = new Map<string, number>();
    for (const l of lines) {
      byAcc.set(l.accountCode, (byAcc.get(l.accountCode) ?? 0) + l.amount);
    }

    for (const [accCode, subtotal] of byAcc.entries()) {
      // Light-blue subtotal row
      doc.setFillColor(SUBTOTAL_BG.r, SUBTOTAL_BG.g, SUBTOTAL_BG.b);
      doc.rect(margin, sumY, contentW, sumRowH, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(TEAL.r, TEAL.g, TEAL.b);
      doc.text(cg.category, sumXCat + 8, sumY + 15);
      doc.text(accCode,     sumXAcc + 8, sumY + 15);

      doc.setTextColor(0, 0, 0);
      doc.text(toMoney(subtotal), sumXTotal + sumColTotal - 8, sumY + 15, { align: "right" });

      sumY += sumRowH;
    }
  }

  // Footer: payable-to text + TOTAL box
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text("Payable to LIKM1",              margin, pageH - 88);
  doc.text("Korman Commercial Properties",  margin, pageH - 72);

  doc.setFillColor(TEAL.r, TEAL.g, TEAL.b);
  doc.rect(margin + contentW - 220, pageH - 95, 220, 40, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.text("TOTAL",                                     margin + contentW - 210, pageH - 68);
  doc.text(toMoney(grandTotal).replace("$", "$ "),      margin + contentW - 10,  pageH - 68, { align: "right" });
  doc.setTextColor(0, 0, 0);

  // ════════════════════════════════════════════════════════════════════════
  // PAGES 2+ — DETAIL TABLE
  // Columns: DATE(56) | DESC(170) | CATEGORY(86) | ACC CODE(86) | AMOUNT(66) | PRICE(68)
  //          532 total = 56+170+86+86+66+68
  // AMOUNT = original CC statement amount; PRICE = allocated amount billed
  // ════════════════════════════════════════════════════════════════════════

  doc.addPage();

  const colDate  = 56;
  const colCat2  = 86;
  const colAcc2  = 86;
  const colAmt   = 66;  // original CC amount
  const colPrice = 68;  // allocated/billed price
  const colDesc  = contentW - colDate - colCat2 - colAcc2 - colAmt - colPrice; // 170

  const xDate2   = margin;
  const xDesc2   = xDate2  + colDate;
  const xCat2    = xDesc2  + colDesc;
  const xAcc2    = xCat2   + colCat2;
  const xAmt2    = xAcc2   + colAcc2;
  const xPrice2  = xAmt2   + colAmt;

  const detHeaderH   = 18;
  const detRowH      = 18;
  const detSubRowH   = 20;
  const detBottomMgn = 110;
  const maxDescChars = Math.max(12, Math.floor(colDesc / 5.8)); // ≈29 chars

  const drawDetailHeader = (yTop: number) => {
    doc.setFillColor(TEAL.r, TEAL.g, TEAL.b);
    doc.rect(margin, yTop, contentW, detHeaderH, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text("DATE",        xDate2  + 6,               yTop + 13);
    doc.text("DESCRIPTION", xDesc2  + 6,               yTop + 13);
    doc.text("CATEGORY",    xCat2   + 6,               yTop + 13);
    doc.text("ACC CODE",    xAcc2   + 6,               yTop + 13);
    doc.text("AMOUNT",      xAmt2   + colAmt   - 6,    yTop + 13, { align: "right" });
    doc.text("PRICE",       xPrice2 + colPrice - 6,    yTop + 13, { align: "right" });
    doc.setTextColor(0, 0, 0);
  };

  // Track current Y on detail pages
  let y = margin;
  drawDetailHeader(y);
  y += detHeaderH;

  for (const cg of args.categoryGroups) {
    const lines = buildLinesForCategory(cg.category, args.propertyCode, cg.items);

    // Group lines by account code (preserve order of first appearance)
    const accGroupMap = new Map<string, InvoiceLine[]>();
    for (const l of lines) {
      if (!accGroupMap.has(l.accountCode)) accGroupMap.set(l.accountCode, []);
      accGroupMap.get(l.accountCode)!.push(l);
    }

    for (const [accCode, accLines] of accGroupMap.entries()) {
      // ── Data rows ──
      for (const r of accLines) {
        if (y + detRowH > pageH - detBottomMgn) {
          doc.addPage();
          y = margin;
          drawDetailHeader(y);
          y += detHeaderH;
        }

        // Row separator
        doc.setDrawColor(210, 210, 210);
        doc.line(margin, y, margin + contentW, y);

        const origAmt = r.originalAmount !== undefined ? r.originalAmount : r.amount;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.text(String(r.date || ""),                   xDate2  + 6,               y + 13);
        doc.text(truncate(r.description, maxDescChars),   xDesc2  + 6,               y + 13);
        doc.text(cg.category,                             xCat2   + 6,               y + 13);
        doc.text(accCode,                                 xAcc2   + 6,               y + 13);
        doc.text(toMoney(origAmt),                        xAmt2   + colAmt   - 6,    y + 13, { align: "right" });
        doc.text(toMoney(r.amount),                       xPrice2 + colPrice - 6,    y + 13, { align: "right" });

        y += detRowH;
      }

      // ── Subtotal row (light blue) ──
      if (y + detSubRowH > pageH - detBottomMgn) {
        doc.addPage();
        y = margin;
        drawDetailHeader(y);
        y += detHeaderH;
      }

      const accTotal    = accLines.reduce((a, l) => a + l.amount, 0);
      const accOrigTotal = accLines.reduce((a, l) => a + (l.originalAmount !== undefined ? l.originalAmount : l.amount), 0);

      doc.setFillColor(SUBTOTAL_BG.r, SUBTOTAL_BG.g, SUBTOTAL_BG.b);
      doc.rect(margin, y, contentW, detSubRowH, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(TEAL.r, TEAL.g, TEAL.b);
      doc.text(`${cg.category} Subtotal`, xDesc2  + 6,               y + 14);
      doc.text(accCode,                    xAcc2   + 6,               y + 14);
      doc.setTextColor(0, 0, 0);
      doc.text(toMoney(accOrigTotal),       xAmt2   + colAmt   - 6,   y + 14, { align: "right" });
      doc.text(toMoney(accTotal),           xPrice2 + colPrice - 6,   y + 14, { align: "right" });

      y += detSubRowH + 4; // small gap between groups
    }
  }

  // Footer on last detail page
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
  doc.text("TOTAL",                                  margin + contentW - 210, pageH - 68);
  doc.text(toMoney(grandTotal).replace("$", "$ "),   margin + contentW - 10,  pageH - 68, { align: "right" });
  doc.setTextColor(0, 0, 0);

  return doc.output("blob") as Blob;
}

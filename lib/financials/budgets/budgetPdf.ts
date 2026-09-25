// Presentation-ready single-property budget PDF — landscape Letter,
// navy title band, KPI tiles, then the full section / line / subtotal
// table with automatic pagination and a repeating column header.
//
// Intentionally a summary view: sub-lines, notes, rent roster,
// allocation detail and CIP detail are not rendered here. Staff who
// want that depth use the Excel download where every detail lives on
// its own tab. The PDF is for printing / sharing the headline numbers.

import "server-only";
import { PDFDocument, rgb, StandardFonts, type PDFPage, type PDFFont } from "pdf-lib";
import type { BudgetLine, BudgetWorkbook, PropertyBudget } from "./types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

// US Letter landscape.
const PAGE_W = 792;
const PAGE_H = 612;
const MARGIN = 36;
const CONTENT_W = PAGE_W - MARGIN * 2; // 720

// Column layout — GL | Line | Jan–Dec | Total = 720 total.
const COL = {
  gl:    { x: MARGIN,                        w: 50 },
  line:  { x: MARGIN + 50,                   w: 175 },
  // Months start at MARGIN + 225 and each is 33 wide → 12 * 33 = 396.
  monthW: 33,
  monthsX: MARGIN + 225,
  total: { x: MARGIN + 225 + 33 * 12,        w: 99 }, // 99 left after months
};

// Brand palette — same navy as the Excel export / page header.
const NAVY = rgb(0.043, 0.290, 0.490);          // #0B4A7D
const NAVY_DARK = rgb(0.039, 0.243, 0.412);     // #0A3E69
const NAVY_TINT = rgb(0.902, 0.933, 0.961);     // #E6EEF5
const ROLLUP_FILL = rgb(0.851, 0.894, 0.933);   // #D9E4EE
const SUBTOTAL_FILL = rgb(0.953, 0.965, 0.976); // #F3F6F9
const BAND_FILL = rgb(0.980, 0.984, 0.988);     // #FAFBFC
const TEXT = rgb(0.10, 0.10, 0.10);
const MUTED = rgb(0.40, 0.40, 0.40);
const WHITE = rgb(1, 1, 1);
const LINE_GRAY = rgb(0.72, 0.76, 0.80);
const RED = rgb(0.70, 0.13, 0.10);

function py(page: PDFPage, topY: number): number {
  return page.getHeight() - topY;
}

function isEmpty(line: BudgetLine): boolean {
  return !line.isSubtotal && line.total === 0 && line.months.every((m) => m === 0);
}

function fmtMoney(n: number | null | undefined): { text: string; color: ReturnType<typeof rgb> } {
  const v = n ?? 0;
  if (v === 0) return { text: "—", color: MUTED };
  const abs = Math.abs(Math.round(v)).toLocaleString("en-US");
  return v < 0
    ? { text: `($${abs})`, color: RED }
    : { text: `$${abs}`, color: TEXT };
}

function drawText(
  page: PDFPage,
  str: string,
  x: number,
  topY: number,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof rgb>,
  opts: { maxWidth?: number; align?: "left" | "right" | "center" } = {},
) {
  let draw = str;
  // Truncate to maxWidth with ellipsis when it would overflow.
  if (opts.maxWidth != null) {
    while (draw.length > 1 && font.widthOfTextAtSize(draw, size) > opts.maxWidth) {
      draw = draw.slice(0, -2) + "…";
    }
  }
  let drawX = x;
  if (opts.align === "right" && opts.maxWidth != null) {
    drawX = x + opts.maxWidth - font.widthOfTextAtSize(draw, size);
  } else if (opts.align === "center" && opts.maxWidth != null) {
    drawX = x + (opts.maxWidth - font.widthOfTextAtSize(draw, size)) / 2;
  }
  page.drawText(draw, { x: drawX, y: py(page, topY + size * 0.85), font, size, color });
}

function fillRect(
  page: PDFPage,
  x: number,
  topY: number,
  w: number,
  h: number,
  color: ReturnType<typeof rgb>,
) {
  page.drawRectangle({ x, y: py(page, topY + h), width: w, height: h, color });
}

function drawHLine(page: PDFPage, x: number, topY: number, w: number, color = LINE_GRAY) {
  page.drawLine({
    start: { x, y: py(page, topY) },
    end:   { x: x + w, y: py(page, topY) },
    thickness: 0.5,
    color,
  });
}

/** Header band drawn at the very top of every page so reprints stay
 *  oriented when staff flip through the printout. */
function drawColumnHeader(page: PDFPage, topY: number, bold: PDFFont) {
  fillRect(page, MARGIN, topY, CONTENT_W, 22, NAVY);
  drawText(page, "GL", COL.gl.x + 4, topY + 6, bold, 9, WHITE);
  drawText(page, "Line", COL.line.x + 4, topY + 6, bold, 9, WHITE);
  for (let m = 0; m < 12; m++) {
    drawText(page, MONTHS[m], COL.monthsX + m * COL.monthW, topY + 6, bold, 9, WHITE, {
      maxWidth: COL.monthW - 2, align: "right",
    });
  }
  drawText(page, "Total", COL.total.x, topY + 6, bold, 9, WHITE, {
    maxWidth: COL.total.w - 4, align: "right",
  });
}

function groupHeaderFor(sectionName: string): string | null {
  const n = sectionName.toLowerCase();
  if (/^revenues?$/.test(n)) return "REVENUES";
  if (/^reimbursable expenses?$/.test(n)) return "OPERATING EXPENSES";
  if (/^capital/.test(n)) return "CAPITAL IMPROVEMENTS";
  if (/^debt service$/.test(n)) return "DEBT SERVICE";
  return null;
}

function subtotalKeysAfter(sectionName: string, hasDebt: boolean, hasCapital: boolean): string[] {
  const n = sectionName.toLowerCase();
  if (/reimburs/.test(n) && !/expense/.test(n) && !/non/.test(n)) return ["TOTAL REVENUES"];
  if (/non-reimbursable/.test(n)) {
    const out = ["TOTAL OPERATING EXPENSES", "NET OPERATING INCOME"];
    if (!hasCapital) out.push(hasDebt ? "CASH FLOW BEFORE DEBT SERVICE" : "CASH FLOW");
    return out;
  }
  if (/capital/.test(n)) return [hasDebt ? "CASH FLOW BEFORE DEBT SERVICE" : "CASH FLOW"];
  if (/debt service/.test(n)) return ["CASH FLOW AFTER DEBT SERVICE"];
  return [];
}

export async function generateBudgetDownloadPdf(
  wb: BudgetWorkbook,
  property: PropertyBudget,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${wb.year} Operating Budget — ${property.propertyCode} ${property.propertyName}`);
  pdf.setProducer("KCP Portal");

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold    = await pdf.embedFont(StandardFonts.HelveticaBold);

  // First page hosts the title band + KPI tiles before the table.
  // Subsequent pages are pure table continuation.
  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = 0;

  // ── Title band ─────────────────────────────────────────────────────
  fillRect(page, 0, 0, PAGE_W, 34, NAVY_DARK);
  drawText(page, `${property.propertyCode}  —  ${property.propertyName}`, 0, 8, bold, 16, WHITE, {
    maxWidth: PAGE_W, align: "center",
  });
  fillRect(page, 0, 34, PAGE_W, 22, NAVY);
  drawText(page, `${wb.year} Operating Budget  ·  ${wb.category}`, 0, 39, bold, 11, WHITE, {
    maxWidth: PAGE_W, align: "center",
  });

  // Meta line.
  y = 64;
  const metaParts: string[] = [];
  if (property.rentableSqft) metaParts.push(`Rentable SF: ${property.rentableSqft.toLocaleString("en-US")}`);
  if (wb.source?.opExGrowthPct != null) metaParts.push(`OpEx defaulted at ${wb.source.opExGrowthPct}% over prior`);
  metaParts.push(`Generated ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}`);
  drawText(page, metaParts.join("    ·    "), 0, y, regular, 9, MUTED, {
    maxWidth: PAGE_W, align: "center",
  });

  // ── KPI tiles ──────────────────────────────────────────────────────
  y = 82;
  const rollupByName = new Map(property.rollups.map((r) => [r.name.toUpperCase().trim(), r]));
  const hasDebt = property.sections.some(
    (s) => /debt service/i.test(s.name) && s.lines.some((l) => !l.isSubtotal && l.total !== 0),
  );
  const get = (n: string) => rollupByName.get(n);
  const headlinePills: { name: string; value: number }[] = [];
  if (get("TOTAL REVENUES")) headlinePills.push({ name: "TOTAL REVENUES", value: get("TOTAL REVENUES")!.total });
  if (get("TOTAL OPERATING EXPENSES")) headlinePills.push({ name: "TOTAL OPERATING EXPENSES", value: get("TOTAL OPERATING EXPENSES")!.total });
  if (get("NET OPERATING INCOME")) headlinePills.push({ name: "NET OPERATING INCOME", value: get("NET OPERATING INCOME")!.total });
  if (hasDebt && get("CASH FLOW AFTER DEBT SERVICE")) {
    headlinePills.push({ name: "CASH FLOW AFTER DEBT SERVICE", value: get("CASH FLOW AFTER DEBT SERVICE")!.total });
  } else if (get("CASH FLOW BEFORE DEBT SERVICE")) {
    headlinePills.push({ name: "CASH FLOW", value: get("CASH FLOW BEFORE DEBT SERVICE")!.total });
  }
  if (headlinePills.length > 0) {
    const tileW = CONTENT_W / headlinePills.length;
    headlinePills.forEach((p, i) => {
      const x = MARGIN + i * tileW;
      // Label band.
      fillRect(page, x, y, tileW, 14, NAVY);
      drawText(page, p.name, x, y + 3, bold, 7.5, WHITE, { maxWidth: tileW, align: "center" });
      // Value band.
      fillRect(page, x, y + 14, tileW, 28, WHITE);
      const { text, color } = fmtMoney(p.value);
      drawText(page, text, x, y + 19, bold, 16, color, { maxWidth: tileW, align: "center" });
      // Border around the tile.
      page.drawRectangle({
        x, y: py(page, y + 42), width: tileW, height: 42,
        borderColor: LINE_GRAY, borderWidth: 0.5,
      });
    });
    y += 42;
  }

  // ── Table body ─────────────────────────────────────────────────────
  y += 14;
  drawColumnHeader(page, y, bold);
  y += 22;

  const BOTTOM_LIMIT = PAGE_H - MARGIN; // give the footer some room

  const ensureRoom = (rowH: number) => {
    if (y + rowH > BOTTOM_LIMIT) {
      // Page break — start a fresh page with the column header
      // repeated so staff can still read row context.
      drawPageFooter(page, regular, pdf);
      page = pdf.addPage([PAGE_W, PAGE_H]);
      y = MARGIN;
      drawColumnHeader(page, y, bold);
      y += 22;
    }
  };

  const drawLineRow = (
    line: BudgetLine,
    opts: { band: boolean; depth: number },
  ) => {
    const rowH = 16;
    ensureRoom(rowH);
    if (opts.band) fillRect(page, MARGIN, y, CONTENT_W, rowH, BAND_FILL);
    // Borders top + bottom of each row (subtle).
    drawHLine(page, MARGIN, y + rowH, CONTENT_W);
    // GL.
    if (line.glAccount) {
      drawText(page, line.glAccount, COL.gl.x + 3, y + 4, regular, 8, MUTED, { maxWidth: COL.gl.w - 4 });
    }
    // Label with depth-based indent.
    let label = line.label;
    if (line.feePercent != null) label += ` (${line.feePercent}%)`;
    else if (line.feePercentRange) label += ` (${line.feePercentRange[0]}–${line.feePercentRange[1]}%)`;
    drawText(page, label, COL.line.x + 3 + opts.depth * 8, y + 4, regular, 9, TEXT, {
      maxWidth: COL.line.w - 6 - opts.depth * 8,
    });
    // Months.
    for (let m = 0; m < 12; m++) {
      const { text, color } = fmtMoney(line.months[m]);
      drawText(page, text, COL.monthsX + m * COL.monthW, y + 4, regular, 8, color, {
        maxWidth: COL.monthW - 2, align: "right",
      });
    }
    // Total.
    const { text, color } = fmtMoney(line.total);
    drawText(page, text, COL.total.x, y + 4, regular, 9, color, {
      maxWidth: COL.total.w - 4, align: "right",
    });
    y += rowH;
  };

  const drawSubtotalRow = (label: string, months: number[], total: number) => {
    const rowH = 18;
    ensureRoom(rowH);
    fillRect(page, MARGIN, y, CONTENT_W, rowH, SUBTOTAL_FILL);
    drawHLine(page, MARGIN, y, CONTENT_W, NAVY);
    drawHLine(page, MARGIN, y + rowH, CONTENT_W, NAVY);
    drawText(page, label, COL.line.x + 3, y + 5, bold, 9, NAVY_DARK, { maxWidth: COL.line.w + COL.gl.w - 6 });
    for (let m = 0; m < 12; m++) {
      const { text, color } = fmtMoney(months[m]);
      drawText(page, text, COL.monthsX + m * COL.monthW, y + 5, bold, 8, color, {
        maxWidth: COL.monthW - 2, align: "right",
      });
    }
    const { text, color } = fmtMoney(total);
    drawText(page, text, COL.total.x, y + 5, bold, 9, color, {
      maxWidth: COL.total.w - 4, align: "right",
    });
    y += rowH;
  };

  const drawCrossSectionRow = (label: string, months: number[], total: number) => {
    y += 4;
    const rowH = 22;
    ensureRoom(rowH);
    fillRect(page, MARGIN, y, CONTENT_W, rowH, ROLLUP_FILL);
    drawHLine(page, MARGIN, y, CONTENT_W, NAVY);
    drawHLine(page, MARGIN, y + rowH, CONTENT_W, NAVY);
    drawText(page, label, COL.line.x + 3, y + 7, bold, 10, NAVY_DARK, {
      maxWidth: COL.line.w + COL.gl.w - 6,
    });
    for (let m = 0; m < 12; m++) {
      const { text, color } = fmtMoney(months[m]);
      drawText(page, text, COL.monthsX + m * COL.monthW, y + 7, bold, 8, color, {
        maxWidth: COL.monthW - 2, align: "right",
      });
    }
    const { text, color } = fmtMoney(total);
    drawText(page, text, COL.total.x, y + 7, bold, 10, color, {
      maxWidth: COL.total.w - 4, align: "right",
    });
    y += rowH;
  };

  const drawGroupBanner = (label: string) => {
    y += 6;
    const rowH = 20;
    ensureRoom(rowH);
    fillRect(page, MARGIN, y, CONTENT_W, rowH, NAVY_DARK);
    drawText(page, label, MARGIN + 8, y + 6, bold, 11, WHITE);
    y += rowH;
  };

  const drawSectionHeader = (label: string) => {
    const rowH = 16;
    ensureRoom(rowH);
    fillRect(page, MARGIN, y, CONTENT_W, rowH, NAVY_TINT);
    drawHLine(page, MARGIN, y, CONTENT_W, NAVY);
    drawHLine(page, MARGIN, y + rowH, CONTENT_W, NAVY);
    drawText(page, label, MARGIN + 8, y + 4, bold, 9, NAVY_DARK);
    y += rowH;
  };

  const visibleSections = property.sections.filter(
    (s) => hasDebt || !/debt service/i.test(s.name),
  );
  const hasCapital = property.sections.some((s) => /^capital/i.test(s.name));

  for (const sec of visibleSections) {
    const groupHeader = groupHeaderFor(sec.name);
    if (groupHeader) drawGroupBanner(groupHeader);
    drawSectionHeader(sec.name);
    let band = false;
    for (const line of sec.lines) {
      if (line.isSubtotal) {
        if (isEmpty(line)) continue;
        drawSubtotalRow(line.label, line.months, line.total);
        band = false;
        continue;
      }
      if (isEmpty(line)) continue;
      drawLineRow(line, { band, depth: 0 });
      band = !band;
    }
    for (const key of subtotalKeysAfter(sec.name, hasDebt, hasCapital)) {
      const rollup =
        key === "CASH FLOW" ? rollupByName.get("CASH FLOW BEFORE DEBT SERVICE") : rollupByName.get(key);
      if (!rollup) continue;
      drawCrossSectionRow(key, rollup.months, rollup.total);
    }
  }

  drawPageFooter(page, regular, pdf);
  // Stamp page numbers across every page now that the total is known.
  const pages = pdf.getPages();
  for (let i = 0; i < pages.length; i++) {
    drawText(
      pages[i],
      `Page ${i + 1} of ${pages.length}`,
      0,
      PAGE_H - 20,
      regular, 8, MUTED,
      { maxWidth: PAGE_W, align: "center" },
    );
  }

  return await pdf.save();
}

function drawPageFooter(_page: PDFPage, _font: PDFFont, _pdf: PDFDocument) {
  // Placeholder — page numbers are stamped at the end once the page
  // count is known. Kept as a hook in case future revisions add a
  // per-page footer (e.g. confidentiality stamp).
}

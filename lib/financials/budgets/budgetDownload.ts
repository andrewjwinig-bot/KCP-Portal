// Presentation-ready full-budget .xlsx export. Mirrors what the
// /financials/budgets page renders for the selected property — title
// block + KPI band, group headers, section names, line items with their
// sub-line breakdowns indented underneath, in-section subtotals, and the
// big cross-section subtotals (TOTAL REVENUES, NOI, CASH FLOW, …).
// Empty rows are skipped so the file reads clean.
//
// Built with exceljs so cells carry real fonts, fills, borders, number
// formats, merged ranges and frozen panes — the output matches the
// look-and-feel of the source workbook files staff are used to.

import ExcelJS from "exceljs";
import type { BudgetLine, BudgetWorkbook, PropertyBudget } from "./types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const MONEY_FMT = '_("$"* #,##0_);[Red]_("$"* (#,##0);_("$"* "—"_);_(@_)';

// Brand palette — matches the portal's --brand / --brand2 navy.
const BRAND = "FF0B4A7D";       // deep navy
const BRAND_DARK = "FF0A3E69";  // darker shade for top banner
const BRAND_TINT = "FFE6EEF5";  // very light navy wash for section header
const ROLLUP_FILL = "FFD9E4EE"; // slightly stronger wash for cross-section subtotals
const SUBTOTAL_FILL = "FFF3F6F9"; // soft gray for in-section subtotals
const DETAIL_BANNER = "FFEEF3F8"; // banner above each rent / allocation / cip detail block
const DETAIL_HEADER = "FFDDE6EF"; // column header inside detail tables
const DETAIL_BAND = "FFFBFCFD";   // alternating band inside detail tables
const BORDER_GRAY = "FFB7C2CC";

const N_COLS = 15; // A: GL, B: Line, C–N: months, O: Total

function isEmpty(line: BudgetLine): boolean {
  return !line.isSubtotal && line.total === 0 && line.months.every((m) => m === 0);
}

/** Cross-section subtotal labels appended after a given section name.
 *  Mirrors the page's BudgetTable subtotalsAfter() logic so the
 *  download lays out top-to-bottom in the same order as the screen.
 *  When the property has no Capital section (JV III office sheets),
 *  CASH FLOW BEFORE DEBT SERVICE slides up to sit after Non-Reimbursable. */
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

function groupHeaderFor(sectionName: string): string | null {
  const n = sectionName.toLowerCase();
  if (/^revenues?$/.test(n)) return "REVENUES";
  if (/^reimbursable expenses?$/.test(n)) return "OPERATING EXPENSES";
  if (/^capital/.test(n)) return "CAPITAL IMPROVEMENTS";
  if (/^debt service$/.test(n)) return "DEBT SERVICE";
  return null;
}

// Thin gray border applied around every body cell.
const THIN_BORDER = {
  top: { style: "thin" as const, color: { argb: BORDER_GRAY } },
  left: { style: "thin" as const, color: { argb: BORDER_GRAY } },
  bottom: { style: "thin" as const, color: { argb: BORDER_GRAY } },
  right: { style: "thin" as const, color: { argb: BORDER_GRAY } },
};

function applyMoneyFmt(row: ExcelJS.Row, startCol: number, endCol: number) {
  for (let c = startCol; c <= endCol; c++) {
    row.getCell(c).numFmt = MONEY_FMT;
  }
}

function applyBorder(row: ExcelJS.Row, startCol: number, endCol: number) {
  for (let c = startCol; c <= endCol; c++) {
    row.getCell(c).border = THIN_BORDER;
  }
}

function emitLine(
  ws: ExcelJS.Worksheet,
  line: BudgetLine,
  depth: number,
  bandIdx: { v: number },
): void {
  if (isEmpty(line)) return;
  const indent = "    ".repeat(depth);
  // Annotate the label with the management-fee percent the screen
  // shows ("Management Fee (6%)" / "(4–6%)") so the export carries the
  // same context.
  let label = indent + line.label;
  if (line.feePercent != null) label += ` (${line.feePercent}%)`;
  else if (line.feePercentRange) label += ` (${line.feePercentRange[0]}–${line.feePercentRange[1]}%)`;
  const row = ws.addRow([line.glAccount ?? "", label, ...line.months, line.total]);
  row.height = 16;
  row.getCell(1).font = { name: "Calibri", size: 10, color: { argb: "FF555555" } };
  row.getCell(2).font = { name: "Calibri", size: 10 };
  row.getCell(2).alignment = { vertical: "middle", indent: depth };
  row.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
  applyMoneyFmt(row, 3, N_COLS);
  applyBorder(row, 1, N_COLS);
  // Band every other "leaf" row very subtly for readability.
  if (bandIdx.v % 2 === 1) {
    for (let c = 1; c <= N_COLS; c++) {
      row.getCell(c).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFAFBFC" },
      };
    }
  }
  bandIdx.v += 1;
  // Inline notes from column T (workbook input) so staff don't lose
  // the context attached to a line.
  if (line.notes && line.notes.trim()) {
    const noteRow = ws.addRow(["", `${indent}    ↳ ${line.notes.trim()}`]);
    ws.mergeCells(noteRow.number, 2, noteRow.number, N_COLS);
    noteRow.getCell(2).font = { name: "Calibri", size: 9, italic: true, color: { argb: "FF666666" } };
    noteRow.getCell(2).alignment = { vertical: "middle", wrapText: true, indent: depth + 1 };
    noteRow.height = 14;
  }
  // Allocation block detail — render under the line so staff can see
  // exactly how a portfolio-wide expense was split.
  if (line.allocations && line.allocations.length > 0) {
    for (const alloc of line.allocations) emitAllocationDetail(ws, alloc, depth + 1);
  }
  if (line.subLines) {
    for (const sub of line.subLines) emitLine(ws, sub, depth + 1, bandIdx);
  }
}

function emitAllocationDetail(
  ws: ExcelJS.Worksheet,
  alloc: NonNullable<BudgetLine["allocations"]>[number],
  depth: number,
): void {
  const indent = "    ".repeat(depth);
  // Banner row that names the allocation block + summarizes basis.
  const summaryParts = [
    `${alloc.sharePct.toFixed(1)}% share`,
    alloc.basis === "sqft" ? "SF-weighted" : alloc.basis === "annual" ? "annual amount" : "other basis",
  ];
  if (alloc.sourceNote) summaryParts.push(alloc.sourceNote);
  const bannerLabel = `${indent}▸ Allocation · ${alloc.blockLabel}${alloc.glAccount ? `  (${alloc.glAccount})` : ""}  —  ${summaryParts.join(" · ")}`;
  const banner = ws.addRow([
    "",
    bannerLabel,
    ...Array(11).fill(""),
    "Portfolio:",
    alloc.portfolioTotal,
  ]);
  banner.height = 16;
  ws.mergeCells(banner.number, 2, banner.number, N_COLS - 2);
  banner.getCell(2).font = { name: "Calibri", size: 9, bold: true, italic: true, color: { argb: BRAND_DARK } };
  banner.getCell(2).alignment = { vertical: "middle", indent: depth };
  banner.getCell(N_COLS - 1).font = { name: "Calibri", size: 9, italic: true, color: { argb: "FF666666" } };
  banner.getCell(N_COLS - 1).alignment = { vertical: "middle", horizontal: "right" };
  banner.getCell(N_COLS).numFmt = MONEY_FMT;
  banner.getCell(N_COLS).font = { name: "Calibri", size: 9, bold: true, color: { argb: BRAND_DARK } };
  for (let c = 1; c <= N_COLS; c++) {
    banner.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: DETAIL_BANNER } };
  }

  if (!alloc.rows || alloc.rows.length === 0) return;

  // Column header: Property | Basis (SF/share) | Jan–Dec | Total
  const header = ws.addRow(["Property", `${indent}Basis`, ...MONTHS, "Total"]);
  header.height = 16;
  for (let c = 1; c <= N_COLS; c++) {
    const cell = header.getCell(c);
    cell.font = { name: "Calibri", size: 9, bold: true, color: { argb: BRAND_DARK } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DETAIL_HEADER } };
    cell.alignment = { vertical: "middle", horizontal: c <= 2 ? "left" : "right", indent: c <= 2 ? 1 : 0 };
    cell.border = THIN_BORDER;
  }

  alloc.rows.forEach((r, i) => {
    const basisLabel = alloc.basis === "sqft"
      ? `${r.sqft.toLocaleString("en-US")} SF · ${r.sharePct.toFixed(1)}%`
      : alloc.basis === "annual"
        ? `${r.sharePct.toFixed(1)}%`
        : `${r.sharePct.toFixed(1)}%`;
    const row = ws.addRow([r.propertyCode, basisLabel, ...r.months, r.total]);
    row.height = 14;
    row.getCell(1).font = { name: "Calibri", size: 9, color: { argb: "FF555555" } };
    row.getCell(2).font = { name: "Calibri", size: 9, color: { argb: "FF555555" } };
    row.getCell(2).alignment = { vertical: "middle", indent: 1 };
    applyMoneyFmt(row, 3, N_COLS);
    applyBorder(row, 1, N_COLS);
    if (i % 2 === 1) {
      for (let c = 1; c <= N_COLS; c++) {
        row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: DETAIL_BAND } };
      }
    }
  });
}

function emitRentRosterDetail(
  ws: ExcelJS.Worksheet,
  line: BudgetLine,
): void {
  const detail = line.rentDetail;
  if (!detail || detail.entries.length === 0) return;
  const banner = ws.addRow([`▸ Rent Roster — ${detail.entries.length} tenants  ·  ties to "${line.label}"`]);
  ws.mergeCells(banner.number, 1, banner.number, N_COLS);
  banner.height = 18;
  banner.getCell(1).font = { name: "Calibri", size: 10, bold: true, italic: true, color: { argb: BRAND_DARK } };
  banner.getCell(1).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  banner.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: DETAIL_BANNER } };

  const header = ws.addRow(["Suite", "Tenant · Category · Lease · SF", ...MONTHS, "Total"]);
  header.height = 16;
  for (let c = 1; c <= N_COLS; c++) {
    const cell = header.getCell(c);
    cell.font = { name: "Calibri", size: 9, bold: true, color: { argb: BRAND_DARK } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DETAIL_HEADER } };
    cell.alignment = { vertical: "middle", horizontal: c <= 2 ? "left" : "right", indent: c <= 2 ? 1 : 0 };
    cell.border = THIN_BORDER;
  }

  // Sort: in-place first, then renewal, then new, then vacant; within
  // each bucket alphabetical by tenant.
  const order = { "in-place": 0, renewal: 1, new: 2, vacant: 3 } as const;
  const sorted = [...detail.entries].sort((a, b) => {
    const c = order[a.category] - order[b.category];
    return c !== 0 ? c : a.tenantName.localeCompare(b.tenantName);
  });
  sorted.forEach((e, i) => {
    const meta: string[] = [e.tenantName];
    meta.push(e.category === "in-place" ? "In Place"
      : e.category === "renewal" ? "Renewal"
      : e.category === "new" ? "New Lease"
      : "Vacant");
    if (e.leaseFrom || e.leaseTo) meta.push(`${e.leaseFrom ?? "?"} → ${e.leaseTo ?? "?"}`);
    if (e.sqft) meta.push(`${e.sqft.toLocaleString("en-US")} SF`);
    const row = ws.addRow([e.unitRef, meta.join("  ·  "), ...e.months, e.total]);
    row.height = 14;
    row.getCell(1).font = { name: "Calibri", size: 9, color: { argb: "FF555555" } };
    row.getCell(2).font = { name: "Calibri", size: 9 };
    row.getCell(2).alignment = { vertical: "middle", indent: 1 };
    applyMoneyFmt(row, 3, N_COLS);
    applyBorder(row, 1, N_COLS);
    if (i % 2 === 1) {
      for (let c = 1; c <= N_COLS; c++) {
        row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: DETAIL_BAND } };
      }
    }
  });

  // Subtotal row tying back to the parent line.
  const totalMonths = Array(12).fill(0);
  for (const e of sorted) for (let m = 0; m < 12; m++) totalMonths[m] += e.months[m] ?? 0;
  const totalRow = ws.addRow(["", "Roster Total", ...totalMonths, detail.total]);
  totalRow.height = 16;
  applyMoneyFmt(totalRow, 3, N_COLS);
  for (let c = 1; c <= N_COLS; c++) {
    totalRow.getCell(c).font = { name: "Calibri", size: 9, bold: true, color: { argb: BRAND_DARK } };
    totalRow.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: SUBTOTAL_FILL } };
    totalRow.getCell(c).border = {
      top: { style: "thin", color: { argb: BRAND } },
      bottom: { style: "thin", color: { argb: BRAND } },
      left: { style: "thin", color: { argb: BORDER_GRAY } },
      right: { style: "thin", color: { argb: BORDER_GRAY } },
    };
  }
  totalRow.getCell(2).alignment = { vertical: "middle", indent: 1 };
}

function emitCipDetail(ws: ExcelJS.Worksheet, line: BudgetLine): void {
  const detail = line.cipDetail;
  if (!detail || detail.tenants.length === 0) return;
  const banner = ws.addRow([`▸ CIP Members — ${detail.tenants.length} active  ·  ties to "${line.label}"`]);
  ws.mergeCells(banner.number, 1, banner.number, N_COLS);
  banner.height = 18;
  banner.getCell(1).font = { name: "Calibri", size: 10, bold: true, italic: true, color: { argb: BRAND_DARK } };
  banner.getCell(1).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  banner.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: DETAIL_BANNER } };

  const header = ws.addRow(["", "Member", ...MONTHS, "Total"]);
  header.height = 16;
  for (let c = 1; c <= N_COLS; c++) {
    const cell = header.getCell(c);
    cell.font = { name: "Calibri", size: 9, bold: true, color: { argb: BRAND_DARK } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DETAIL_HEADER } };
    cell.alignment = { vertical: "middle", horizontal: c <= 2 ? "left" : "right", indent: c <= 2 ? 1 : 0 };
    cell.border = THIN_BORDER;
  }

  const sorted = [...detail.tenants].sort((a, b) => a.name.localeCompare(b.name));
  sorted.forEach((t, i) => {
    const row = ws.addRow(["", t.name, ...t.months, t.total]);
    row.height = 14;
    row.getCell(2).font = { name: "Calibri", size: 9 };
    row.getCell(2).alignment = { vertical: "middle", indent: 1 };
    applyMoneyFmt(row, 3, N_COLS);
    applyBorder(row, 1, N_COLS);
    if (i % 2 === 1) {
      for (let c = 1; c <= N_COLS; c++) {
        row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: DETAIL_BAND } };
      }
    }
  });

  const totalMonths = Array(12).fill(0);
  for (const t of sorted) for (let m = 0; m < 12; m++) totalMonths[m] += t.months[m] ?? 0;
  const totalRow = ws.addRow(["", "CIP Total", ...totalMonths, detail.total]);
  totalRow.height = 16;
  applyMoneyFmt(totalRow, 3, N_COLS);
  for (let c = 1; c <= N_COLS; c++) {
    totalRow.getCell(c).font = { name: "Calibri", size: 9, bold: true, color: { argb: BRAND_DARK } };
    totalRow.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: SUBTOTAL_FILL } };
    totalRow.getCell(c).border = {
      top: { style: "thin", color: { argb: BRAND } },
      bottom: { style: "thin", color: { argb: BRAND } },
      left: { style: "thin", color: { argb: BORDER_GRAY } },
      right: { style: "thin", color: { argb: BORDER_GRAY } },
    };
  }
  totalRow.getCell(2).alignment = { vertical: "middle", indent: 1 };
}

export async function generateBudgetDownloadXlsx(
  wb: BudgetWorkbook,
  property: PropertyBudget,
): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  book.creator = "KCP Portal";
  book.created = new Date();
  const ws = book.addWorksheet(`${property.propertyCode} ${wb.year}`, {
    views: [{ state: "frozen", xSplit: 2, ySplit: 0 }],
    pageSetup: {
      orientation: "landscape",
      paperSize: 5, // Legal — fits all 12 months comfortably
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
      horizontalCentered: true,
    },
    properties: { defaultRowHeight: 15 },
  });

  // Column widths up front so merged cells size properly.
  ws.columns = [
    { width: 12 },                                       // A — GL
    { width: 44 },                                       // B — Line
    ...Array.from({ length: 12 }, () => ({ width: 11 })),// C–N — months
    { width: 14 },                                       // O — Total
  ];

  // ── Title block ─────────────────────────────────────────────────────
  const titleRow = ws.addRow([`${property.propertyCode}  —  ${property.propertyName}`]);
  ws.mergeCells(titleRow.number, 1, titleRow.number, N_COLS);
  titleRow.height = 30;
  titleRow.getCell(1).font = { name: "Calibri", size: 18, bold: true, color: { argb: "FFFFFFFF" } };
  titleRow.getCell(1).alignment = { vertical: "middle", horizontal: "center" };
  titleRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_DARK } };

  const subtitleRow = ws.addRow([`${wb.year} Operating Budget  ·  ${wb.category}`]);
  ws.mergeCells(subtitleRow.number, 1, subtitleRow.number, N_COLS);
  subtitleRow.height = 20;
  subtitleRow.getCell(1).font = { name: "Calibri", size: 12, bold: true, color: { argb: "FFFFFFFF" } };
  subtitleRow.getCell(1).alignment = { vertical: "middle", horizontal: "center" };
  subtitleRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };

  const meta: string[] = [];
  if (property.rentableSqft) meta.push(`Rentable SF: ${property.rentableSqft.toLocaleString("en-US")}`);
  if (wb.source?.opExGrowthPct != null) meta.push(`OpEx defaulted at ${wb.source.opExGrowthPct}% over prior`);
  meta.push(`Generated ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}`);
  const metaRow = ws.addRow([meta.join("    ·    ")]);
  ws.mergeCells(metaRow.number, 1, metaRow.number, N_COLS);
  metaRow.height = 18;
  metaRow.getCell(1).font = { name: "Calibri", size: 10, italic: true, color: { argb: "FF555555" } };
  metaRow.getCell(1).alignment = { vertical: "middle", horizontal: "center" };

  ws.addRow([]); // spacer

  // ── KPI band ───────────────────────────────────────────────────────
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

  if (headlinePills.length) {
    // Lay each KPI across an equal share of the 15 columns.
    const span = Math.floor(N_COLS / headlinePills.length);
    const labelRow = ws.addRow([]);
    labelRow.height = 18;
    const valueRow = ws.addRow([]);
    valueRow.height = 26;
    headlinePills.forEach((pill, i) => {
      const startCol = i * span + 1;
      const endCol = i === headlinePills.length - 1 ? N_COLS : (i + 1) * span;
      ws.mergeCells(labelRow.number, startCol, labelRow.number, endCol);
      ws.mergeCells(valueRow.number, startCol, valueRow.number, endCol);
      const lc = labelRow.getCell(startCol);
      lc.value = pill.name;
      lc.font = { name: "Calibri", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
      lc.alignment = { vertical: "middle", horizontal: "center" };
      lc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
      const vc = valueRow.getCell(startCol);
      vc.value = pill.value;
      vc.numFmt = MONEY_FMT;
      vc.font = { name: "Calibri", size: 16, bold: true, color: { argb: BRAND_DARK } };
      vc.alignment = { vertical: "middle", horizontal: "center" };
      vc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
      vc.border = {
        top: { style: "thin", color: { argb: BORDER_GRAY } },
        left: { style: "thin", color: { argb: BORDER_GRAY } },
        right: { style: "thin", color: { argb: BORDER_GRAY } },
        bottom: { style: "medium", color: { argb: BRAND } },
      };
    });
    ws.addRow([]); // spacer
  }

  // ── Column headers ─────────────────────────────────────────────────
  const headerRow = ws.addRow(["GL", "Line", ...MONTHS, "Total"]);
  headerRow.height = 22;
  for (let c = 1; c <= N_COLS; c++) {
    const cell = headerRow.getCell(c);
    cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
    cell.alignment = { vertical: "middle", horizontal: c <= 2 ? "left" : "right", indent: c <= 2 ? 1 : 0 };
    cell.border = {
      top: { style: "medium", color: { argb: BRAND_DARK } },
      bottom: { style: "medium", color: { argb: BRAND_DARK } },
      left: { style: "thin", color: { argb: BRAND_DARK } },
      right: { style: "thin", color: { argb: BRAND_DARK } },
    };
  }
  // Re-freeze so the title + KPI block AND the column header stay pinned.
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: headerRow.number }];

  // ── Sections + subtotals ───────────────────────────────────────────
  const visibleSections = property.sections.filter(
    (s) => hasDebt || !/debt service/i.test(s.name),
  );
  const hasCapital = property.sections.some((s) => /^capital/i.test(s.name));

  const writeGroupBanner = (label: string) => {
    ws.addRow([]);
    const row = ws.addRow([label]);
    ws.mergeCells(row.number, 1, row.number, N_COLS);
    row.height = 22;
    const cell = row.getCell(1);
    cell.font = { name: "Calibri", size: 12, bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_DARK } };
  };

  const writeSectionHeader = (label: string) => {
    const row = ws.addRow([label]);
    ws.mergeCells(row.number, 1, row.number, N_COLS);
    row.height = 18;
    const cell = row.getCell(1);
    cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: BRAND_DARK } };
    cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_TINT } };
    cell.border = {
      top: { style: "thin", color: { argb: BRAND } },
      bottom: { style: "thin", color: { argb: BRAND } },
    };
  };

  const writeCrossSectionSubtotal = (label: string, months: number[], total: number) => {
    ws.addRow([]);
    const row = ws.addRow(["", label, ...months, total]);
    row.height = 20;
    row.getCell(2).font = { name: "Calibri", size: 11, bold: true, color: { argb: BRAND_DARK } };
    row.getCell(2).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    applyMoneyFmt(row, 3, N_COLS);
    for (let c = 1; c <= N_COLS; c++) {
      row.getCell(c).font = row.getCell(c).font ?? {};
      row.getCell(c).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: ROLLUP_FILL },
      };
      row.getCell(c).border = {
        top: { style: "medium", color: { argb: BRAND } },
        bottom: { style: "medium", color: { argb: BRAND } },
        left: { style: "thin", color: { argb: BORDER_GRAY } },
        right: { style: "thin", color: { argb: BORDER_GRAY } },
      };
      if (c >= 3) {
        row.getCell(c).font = { name: "Calibri", size: 11, bold: true, color: { argb: BRAND_DARK } };
      }
    }
  };

  for (const sec of visibleSections) {
    const groupHeader = groupHeaderFor(sec.name);
    if (groupHeader) writeGroupBanner(groupHeader);
    writeSectionHeader(sec.name);
    const bandIdx = { v: 0 };
    for (const line of sec.lines) {
      // In-section subtotal rows get bolder styling.
      if (line.isSubtotal) {
        if (isEmpty(line)) continue;
        const row = ws.addRow(["", line.label, ...line.months, line.total]);
        row.height = 18;
        applyMoneyFmt(row, 3, N_COLS);
        for (let c = 1; c <= N_COLS; c++) {
          row.getCell(c).font = { name: "Calibri", size: 10, bold: true };
          row.getCell(c).fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: SUBTOTAL_FILL },
          };
          row.getCell(c).border = {
            top: { style: "thin", color: { argb: BRAND } },
            bottom: { style: "thin", color: { argb: BRAND } },
            left: { style: "thin", color: { argb: BORDER_GRAY } },
            right: { style: "thin", color: { argb: BORDER_GRAY } },
          };
        }
        row.getCell(2).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
        // Rent roster sits on the "Total Rental and Other" subtotal.
        if (line.rentDetail) emitRentRosterDetail(ws, line);
        bandIdx.v = 0;
        continue;
      }
      emitLine(ws, line, 0, bandIdx);
      // CIP detail sits on the "CIP Memberships" leaf line.
      if (line.cipDetail) emitCipDetail(ws, line);
    }
    for (const key of subtotalKeysAfter(sec.name, hasDebt, hasCapital)) {
      const rollup =
        key === "CASH FLOW" ? rollupByName.get("CASH FLOW BEFORE DEBT SERVICE") : rollupByName.get(key);
      if (!rollup) continue;
      writeCrossSectionSubtotal(key, rollup.months, rollup.total);
    }
  }

  // Header repeats on every printed page.
  ws.pageSetup.printTitlesRow = `${headerRow.number}:${headerRow.number}`;

  const buf = await book.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}

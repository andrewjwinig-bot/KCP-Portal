// Presentation-ready full-budget .xlsx export. The main "Budget" sheet
// mirrors what the /financials/budgets page renders for the selected
// property — title block + KPI band, group headers, section names, line
// items with their sub-line breakdowns indented underneath, in-section
// subtotals, and the big cross-section subtotals (TOTAL REVENUES, NOI,
// CASH FLOW, …). Empty rows are skipped so the file reads clean.
//
// The page's click-through modals (rent roster, allocation breakdowns,
// CIP roster) are emitted as standalone tabs in the same workbook so
// the main sheet stays uncluttered while the full audit trail still
// travels with the file.
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

/** Title block (navy banner + subtitle + meta line) used at the top of
 *  every tab so each one stands on its own when staff print or share it. */
function writeTabHeader(
  ws: ExcelJS.Worksheet,
  cols: number,
  title: string,
  subtitle: string,
  metaParts: string[],
): void {
  const titleRow = ws.addRow([title]);
  ws.mergeCells(titleRow.number, 1, titleRow.number, cols);
  titleRow.height = 30;
  titleRow.getCell(1).font = { name: "Calibri", size: 18, bold: true, color: { argb: "FFFFFFFF" } };
  titleRow.getCell(1).alignment = { vertical: "middle", horizontal: "center" };
  titleRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_DARK } };

  const subtitleRow = ws.addRow([subtitle]);
  ws.mergeCells(subtitleRow.number, 1, subtitleRow.number, cols);
  subtitleRow.height = 20;
  subtitleRow.getCell(1).font = { name: "Calibri", size: 12, bold: true, color: { argb: "FFFFFFFF" } };
  subtitleRow.getCell(1).alignment = { vertical: "middle", horizontal: "center" };
  subtitleRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };

  if (metaParts.length > 0) {
    const metaRow = ws.addRow([metaParts.join("    ·    ")]);
    ws.mergeCells(metaRow.number, 1, metaRow.number, cols);
    metaRow.height = 18;
    metaRow.getCell(1).font = { name: "Calibri", size: 10, italic: true, color: { argb: "FF555555" } };
    metaRow.getCell(1).alignment = { vertical: "middle", horizontal: "center" };
  }
  ws.addRow([]); // spacer
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
  // shows ("Management Fee (6%)" / "(4–6%)").
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
  if (bandIdx.v % 2 === 1) {
    for (let c = 1; c <= N_COLS; c++) {
      row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFAFBFC" } };
    }
  }
  bandIdx.v += 1;
  if (line.notes && line.notes.trim()) {
    const noteRow = ws.addRow(["", `${indent}    ↳ ${line.notes.trim()}`]);
    ws.mergeCells(noteRow.number, 2, noteRow.number, N_COLS);
    noteRow.getCell(2).font = { name: "Calibri", size: 9, italic: true, color: { argb: "FF666666" } };
    noteRow.getCell(2).alignment = { vertical: "middle", wrapText: true, indent: depth + 1 };
    noteRow.height = 14;
  }
  if (line.subLines) {
    for (const sub of line.subLines) emitLine(ws, sub, depth + 1, bandIdx);
  }
}

/** Walk every line + sub-line in the property to find the lines that
 *  carry rent / allocation / CIP detail. The "lineLabel" cell on the
 *  detail tabs cross-references back to the budget tab so staff can
 *  trace where the numbers landed. */
function collectLinesWithDetail(property: PropertyBudget) {
  const rent: { line: BudgetLine; section: string }[] = [];
  const cip: { line: BudgetLine; section: string }[] = [];
  const allocLines: { line: BudgetLine; section: string; path: string }[] = [];
  for (const sec of property.sections) {
    const visit = (line: BudgetLine, parentPath: string) => {
      const path = parentPath ? `${parentPath} ▸ ${line.label}` : line.label;
      if (line.rentDetail) rent.push({ line, section: sec.name });
      if (line.cipDetail) cip.push({ line, section: sec.name });
      if (line.allocations && line.allocations.length > 0) {
        allocLines.push({ line, section: sec.name, path });
      }
      if (line.subLines) line.subLines.forEach((s) => visit(s, path));
    };
    sec.lines.forEach((l) => visit(l, ""));
  }
  return { rent, cip, allocLines };
}

/** Rent Roster tab — one row per tenant across all "Total Rental and
 *  Other" subtotals in the property. */
function buildRentRosterTab(book: ExcelJS.Workbook, wb: BudgetWorkbook, property: PropertyBudget): void {
  const { rent } = collectLinesWithDetail(property);
  const totalEntries = rent.reduce((s, r) => s + (r.line.rentDetail?.entries.length ?? 0), 0);
  if (totalEntries === 0) return;

  const COLS_RR = 18; // Suite | Tenant | Category | Lease From | Lease To | SF | Jan-Dec | Total
  const ws = book.addWorksheet("Rent Roster", {
    views: [{ state: "frozen", xSplit: 2, ySplit: 0 }],
    pageSetup: {
      orientation: "landscape",
      paperSize: 5,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    },
  });
  ws.columns = [
    { width: 12 },                                       // Suite
    { width: 32 },                                       // Tenant
    { width: 11 },                                       // Category
    { width: 11 },                                       // Lease From
    { width: 11 },                                       // Lease To
    { width: 10 },                                       // SF
    ...Array.from({ length: 12 }, () => ({ width: 11 })),// Jan–Dec
    { width: 14 },                                       // Total
  ];

  writeTabHeader(
    ws,
    COLS_RR,
    `Rent Roster — ${property.propertyCode}  ${property.propertyName}`,
    `${wb.year} Operating Budget  ·  ${totalEntries} tenant${totalEntries === 1 ? "" : "s"}`,
    [`Generated ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}`],
  );

  const order = { "in-place": 0, renewal: 1, new: 2, vacant: 3 } as const;
  const friendly: Record<typeof order extends Record<infer K, number> ? K : never, string> = {
    "in-place": "In Place",
    renewal: "Renewal",
    new: "New Lease",
    vacant: "Vacant",
  };

  for (const { line } of rent) {
    const detail = line.rentDetail!;
    // Section label tying back to the budget tab.
    const banner = ws.addRow([`Source: ${line.label}  —  ${detail.entries.length} tenant${detail.entries.length === 1 ? "" : "s"}`]);
    ws.mergeCells(banner.number, 1, banner.number, COLS_RR);
    banner.height = 20;
    banner.getCell(1).font = { name: "Calibri", size: 11, bold: true, color: { argb: BRAND_DARK } };
    banner.getCell(1).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    banner.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_TINT } };

    const header = ws.addRow(["Suite", "Tenant", "Category", "Lease From", "Lease To", "SF", ...MONTHS, "Total"]);
    header.height = 22;
    for (let c = 1; c <= COLS_RR; c++) {
      const cell = header.getCell(c);
      cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
      cell.alignment = {
        vertical: "middle",
        horizontal: c === 1 || c === 2 || c === 3 ? "left" : "right",
        indent: c <= 3 ? 1 : 0,
      };
      cell.border = {
        top: { style: "medium", color: { argb: BRAND_DARK } },
        bottom: { style: "medium", color: { argb: BRAND_DARK } },
        left: { style: "thin", color: { argb: BRAND_DARK } },
        right: { style: "thin", color: { argb: BRAND_DARK } },
      };
    }
    // Anchor the frozen pane onto the latest header so this tab's table
    // header is what stays pinned when scrolling.
    ws.views = [{ state: "frozen", xSplit: 2, ySplit: header.number }];

    const sorted = [...detail.entries].sort((a, b) => {
      const c = order[a.category] - order[b.category];
      return c !== 0 ? c : a.tenantName.localeCompare(b.tenantName);
    });
    sorted.forEach((e, i) => {
      const row = ws.addRow([
        e.unitRef,
        e.tenantName,
        friendly[e.category],
        e.leaseFrom ?? "",
        e.leaseTo ?? "",
        e.sqft ?? "",
        ...e.months,
        e.total,
      ]);
      row.height = 16;
      row.getCell(1).font = { name: "Calibri", size: 10, color: { argb: "FF555555" } };
      row.getCell(2).font = { name: "Calibri", size: 10 };
      row.getCell(2).alignment = { vertical: "middle", indent: 1 };
      row.getCell(3).font = { name: "Calibri", size: 9, color: { argb: BRAND_DARK }, bold: true };
      row.getCell(3).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
      row.getCell(4).alignment = { vertical: "middle", horizontal: "right" };
      row.getCell(5).alignment = { vertical: "middle", horizontal: "right" };
      row.getCell(6).numFmt = "#,##0";
      row.getCell(6).alignment = { vertical: "middle", horizontal: "right" };
      applyMoneyFmt(row, 7, COLS_RR);
      applyBorder(row, 1, COLS_RR);
      if (i % 2 === 1) {
        for (let c = 1; c <= COLS_RR; c++) {
          row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: DETAIL_BAND } };
        }
      }
    });

    // Subtotal row that ties back to the parent line on the budget tab.
    const totalMonths = Array(12).fill(0);
    for (const e of sorted) for (let m = 0; m < 12; m++) totalMonths[m] += e.months[m] ?? 0;
    const totalRow = ws.addRow(["", "Roster Total", "", "", "", "", ...totalMonths, detail.total]);
    totalRow.height = 18;
    applyMoneyFmt(totalRow, 7, COLS_RR);
    for (let c = 1; c <= COLS_RR; c++) {
      totalRow.getCell(c).font = { name: "Calibri", size: 10, bold: true, color: { argb: BRAND_DARK } };
      totalRow.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: SUBTOTAL_FILL } };
      totalRow.getCell(c).border = {
        top: { style: "medium", color: { argb: BRAND } },
        bottom: { style: "medium", color: { argb: BRAND } },
        left: { style: "thin", color: { argb: BORDER_GRAY } },
        right: { style: "thin", color: { argb: BORDER_GRAY } },
      };
    }
    totalRow.getCell(2).alignment = { vertical: "middle", indent: 1 };

    ws.addRow([]); // spacer between source blocks
  }

  ws.pageSetup.printTitlesRow = "1:4";
}

/** Allocations tab — one block per (line, allocation) pair laid out
 *  with its banner, per-property breakdown table, and a portfolio total
 *  row. Multiple blocks rolling into the same line each get their own
 *  table so staff can see exactly how the portfolio-wide expense split. */
function buildAllocationsTab(book: ExcelJS.Workbook, wb: BudgetWorkbook, property: PropertyBudget): void {
  const { allocLines } = collectLinesWithDetail(property);
  const totalBlocks = allocLines.reduce((s, l) => s + (l.line.allocations?.length ?? 0), 0);
  if (totalBlocks === 0) return;

  const COLS_AL = 15; // Property | Basis | Jan-Dec | Total
  const ws = book.addWorksheet("Allocations", {
    views: [{ state: "frozen", xSplit: 2, ySplit: 0 }],
    pageSetup: {
      orientation: "landscape",
      paperSize: 5,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    },
  });
  ws.columns = [
    { width: 12 },                                       // Property
    { width: 32 },                                       // Basis (SF · share %)
    ...Array.from({ length: 12 }, () => ({ width: 11 })),// Jan–Dec
    { width: 14 },                                       // Total
  ];

  writeTabHeader(
    ws,
    COLS_AL,
    `Allocated Expenses — ${property.propertyCode}  ${property.propertyName}`,
    `${wb.year} Operating Budget  ·  ${totalBlocks} allocation block${totalBlocks === 1 ? "" : "s"}`,
    [`Generated ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}`],
  );

  for (const { line, path } of allocLines) {
    for (const alloc of line.allocations!) {
      const summaryParts: string[] = [];
      summaryParts.push(`This property: ${alloc.propertyAmount < 0 ? `-$${Math.abs(alloc.propertyAmount).toLocaleString("en-US")}` : `$${alloc.propertyAmount.toLocaleString("en-US")}`}`);
      summaryParts.push(`${alloc.sharePct.toFixed(1)}% share`);
      summaryParts.push(alloc.basis === "sqft" ? "SF-weighted" : alloc.basis === "annual" ? "annual amount" : "other basis");
      if (alloc.sourceNote) summaryParts.push(alloc.sourceNote);
      const banner = ws.addRow([`Source line: ${path}${alloc.glAccount ? `  (${alloc.glAccount})` : ""}  ·  Block: ${alloc.blockLabel}`]);
      ws.mergeCells(banner.number, 1, banner.number, COLS_AL);
      banner.height = 20;
      banner.getCell(1).font = { name: "Calibri", size: 11, bold: true, color: { argb: BRAND_DARK } };
      banner.getCell(1).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
      banner.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_TINT } };

      const sub = ws.addRow([summaryParts.join("    ·    ")]);
      ws.mergeCells(sub.number, 1, sub.number, COLS_AL);
      sub.height = 16;
      sub.getCell(1).font = { name: "Calibri", size: 9, italic: true, color: { argb: "FF555555" } };
      sub.getCell(1).alignment = { vertical: "middle", horizontal: "left", indent: 1 };

      const header = ws.addRow(["Property", "Basis", ...MONTHS, "Total"]);
      header.height = 20;
      for (let c = 1; c <= COLS_AL; c++) {
        const cell = header.getCell(c);
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
      ws.views = [{ state: "frozen", xSplit: 2, ySplit: header.number }];

      const rows = alloc.rows ?? [];
      if (rows.length === 0) {
        const empty = ws.addRow(["", "(per-property breakdown not captured)"]);
        ws.mergeCells(empty.number, 2, empty.number, COLS_AL);
        empty.getCell(2).font = { name: "Calibri", size: 9, italic: true, color: { argb: "FF888888" } };
      } else {
        rows.forEach((r, i) => {
          const basisLabel = alloc.basis === "sqft"
            ? `${r.sqft.toLocaleString("en-US")} SF · ${r.sharePct.toFixed(1)}%`
            : `${r.sharePct.toFixed(1)}%`;
          const isThisProperty = r.propertyCode.toUpperCase() === property.propertyCode.toUpperCase();
          const row = ws.addRow([r.propertyCode, basisLabel, ...r.months, r.total]);
          row.height = 16;
          row.getCell(1).font = {
            name: "Calibri", size: 10,
            color: { argb: isThisProperty ? BRAND_DARK : "FF555555" },
            bold: isThisProperty,
          };
          row.getCell(2).font = { name: "Calibri", size: 10, color: { argb: "FF555555" } };
          row.getCell(2).alignment = { vertical: "middle", indent: 1 };
          applyMoneyFmt(row, 3, COLS_AL);
          applyBorder(row, 1, COLS_AL);
          if (isThisProperty) {
            // Highlight this property's slice so the line ties out.
            for (let c = 1; c <= COLS_AL; c++) {
              row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_TINT } };
            }
          } else if (i % 2 === 1) {
            for (let c = 1; c <= COLS_AL; c++) {
              row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: DETAIL_BAND } };
            }
          }
        });

        // Portfolio total row.
        const totalMonths = Array(12).fill(0);
        for (const r of rows) for (let m = 0; m < 12; m++) totalMonths[m] += r.months[m] ?? 0;
        const totalRow = ws.addRow(["", "Portfolio Total", ...totalMonths, alloc.portfolioTotal]);
        totalRow.height = 18;
        applyMoneyFmt(totalRow, 3, COLS_AL);
        for (let c = 1; c <= COLS_AL; c++) {
          totalRow.getCell(c).font = { name: "Calibri", size: 10, bold: true, color: { argb: BRAND_DARK } };
          totalRow.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: SUBTOTAL_FILL } };
          totalRow.getCell(c).border = {
            top: { style: "medium", color: { argb: BRAND } },
            bottom: { style: "medium", color: { argb: BRAND } },
            left: { style: "thin", color: { argb: BORDER_GRAY } },
            right: { style: "thin", color: { argb: BORDER_GRAY } },
          };
        }
        totalRow.getCell(2).alignment = { vertical: "middle", indent: 1 };
      }
      ws.addRow([]); // spacer between blocks
    }
  }

  ws.pageSetup.printTitlesRow = "1:4";
}

/** CIP Members tab — per-member monthly billing for any CIP roster
 *  attached to lines in this property (today only Office Works'
 *  "CIP Memberships" line carries one). */
function buildCipTab(book: ExcelJS.Workbook, wb: BudgetWorkbook, property: PropertyBudget): void {
  const { cip } = collectLinesWithDetail(property);
  const totalMembers = cip.reduce((s, c) => s + (c.line.cipDetail?.tenants.length ?? 0), 0);
  if (totalMembers === 0) return;

  const COLS_CIP = 14; // Member | Jan-Dec | Total
  const ws = book.addWorksheet("CIP Members", {
    views: [{ state: "frozen", xSplit: 1, ySplit: 0 }],
    pageSetup: {
      orientation: "landscape",
      paperSize: 5,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    },
  });
  ws.columns = [
    { width: 40 },                                       // Member
    ...Array.from({ length: 12 }, () => ({ width: 11 })),// Jan–Dec
    { width: 14 },                                       // Total
  ];

  writeTabHeader(
    ws,
    COLS_CIP,
    `CIP Members — ${property.propertyCode}  ${property.propertyName}`,
    `${wb.year} Operating Budget  ·  ${totalMembers} active member${totalMembers === 1 ? "" : "s"}`,
    [`Generated ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}`],
  );

  for (const { line } of cip) {
    const detail = line.cipDetail!;
    const banner = ws.addRow([`Source: ${line.label}  —  ${detail.tenants.length} member${detail.tenants.length === 1 ? "" : "s"}`]);
    ws.mergeCells(banner.number, 1, banner.number, COLS_CIP);
    banner.height = 20;
    banner.getCell(1).font = { name: "Calibri", size: 11, bold: true, color: { argb: BRAND_DARK } };
    banner.getCell(1).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    banner.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_TINT } };

    const header = ws.addRow(["Member", ...MONTHS, "Total"]);
    header.height = 22;
    for (let c = 1; c <= COLS_CIP; c++) {
      const cell = header.getCell(c);
      cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
      cell.alignment = { vertical: "middle", horizontal: c === 1 ? "left" : "right", indent: c === 1 ? 1 : 0 };
      cell.border = {
        top: { style: "medium", color: { argb: BRAND_DARK } },
        bottom: { style: "medium", color: { argb: BRAND_DARK } },
        left: { style: "thin", color: { argb: BRAND_DARK } },
        right: { style: "thin", color: { argb: BRAND_DARK } },
      };
    }
    ws.views = [{ state: "frozen", xSplit: 1, ySplit: header.number }];

    const sorted = [...detail.tenants].sort((a, b) => a.name.localeCompare(b.name));
    sorted.forEach((t, i) => {
      const row = ws.addRow([t.name, ...t.months, t.total]);
      row.height = 16;
      row.getCell(1).font = { name: "Calibri", size: 10 };
      row.getCell(1).alignment = { vertical: "middle", indent: 1 };
      applyMoneyFmt(row, 2, COLS_CIP);
      applyBorder(row, 1, COLS_CIP);
      if (i % 2 === 1) {
        for (let c = 1; c <= COLS_CIP; c++) {
          row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: DETAIL_BAND } };
        }
      }
    });

    const totalMonths = Array(12).fill(0);
    for (const t of sorted) for (let m = 0; m < 12; m++) totalMonths[m] += t.months[m] ?? 0;
    const totalRow = ws.addRow(["CIP Total", ...totalMonths, detail.total]);
    totalRow.height = 18;
    applyMoneyFmt(totalRow, 2, COLS_CIP);
    for (let c = 1; c <= COLS_CIP; c++) {
      totalRow.getCell(c).font = { name: "Calibri", size: 10, bold: true, color: { argb: BRAND_DARK } };
      totalRow.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: SUBTOTAL_FILL } };
      totalRow.getCell(c).border = {
        top: { style: "medium", color: { argb: BRAND } },
        bottom: { style: "medium", color: { argb: BRAND } },
        left: { style: "thin", color: { argb: BORDER_GRAY } },
        right: { style: "thin", color: { argb: BORDER_GRAY } },
      };
    }
    totalRow.getCell(1).alignment = { vertical: "middle", indent: 1 };
    ws.addRow([]);
  }

  ws.pageSetup.printTitlesRow = "1:4";
}

function buildMainBudgetTab(book: ExcelJS.Workbook, wb: BudgetWorkbook, property: PropertyBudget): void {
  const ws = book.addWorksheet("Budget", {
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
  // Hint at sibling tabs so staff know where the rent / alloc / CIP
  // detail moved to.
  const { rent, allocLines, cip } = collectLinesWithDetail(property);
  const tabs: string[] = [];
  if (rent.length > 0) tabs.push("Rent Roster tab");
  if (allocLines.length > 0) tabs.push("Allocations tab");
  if (cip.length > 0) tabs.push("CIP Members tab");
  if (tabs.length > 0) meta.push(`See ${tabs.join(" · ")}`);
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
      row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: ROLLUP_FILL } };
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
      if (line.isSubtotal) {
        if (isEmpty(line)) continue;
        const row = ws.addRow(["", line.label, ...line.months, line.total]);
        row.height = 18;
        applyMoneyFmt(row, 3, N_COLS);
        for (let c = 1; c <= N_COLS; c++) {
          row.getCell(c).font = { name: "Calibri", size: 10, bold: true };
          row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: SUBTOTAL_FILL } };
          row.getCell(c).border = {
            top: { style: "thin", color: { argb: BRAND } },
            bottom: { style: "thin", color: { argb: BRAND } },
            left: { style: "thin", color: { argb: BORDER_GRAY } },
            right: { style: "thin", color: { argb: BORDER_GRAY } },
          };
        }
        row.getCell(2).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
        bandIdx.v = 0;
        continue;
      }
      emitLine(ws, line, 0, bandIdx);
    }
    for (const key of subtotalKeysAfter(sec.name, hasDebt, hasCapital)) {
      const rollup =
        key === "CASH FLOW" ? rollupByName.get("CASH FLOW BEFORE DEBT SERVICE") : rollupByName.get(key);
      if (!rollup) continue;
      writeCrossSectionSubtotal(key, rollup.months, rollup.total);
    }
  }

  ws.pageSetup.printTitlesRow = `${headerRow.number}:${headerRow.number}`;
}

export async function generateBudgetDownloadXlsx(
  wb: BudgetWorkbook,
  property: PropertyBudget,
): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  book.creator = "KCP Portal";
  book.created = new Date();

  buildMainBudgetTab(book, wb, property);
  buildRentRosterTab(book, wb, property);
  buildAllocationsTab(book, wb, property);
  buildCipTab(book, wb, property);

  const buf = await book.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}

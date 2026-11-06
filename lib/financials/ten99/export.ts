// The workbook handed to the accountants.
//
// Two sheets, because they answer two different questions:
//   "1099 Register" — one row per vendor per filing entity, which is the list
//   they work from, with a live per-entity subtotal and a grand total.
//   "Payment Detail" — every underlying payment, so any figure on the register
//   can be traced to a check without coming back to ask.
//
// Every total is a live =SUM() over the exact rows above it (project rule), so
// the accountant can delete a vendor they know is a corporation and watch the
// subtotal follow rather than having to redo the arithmetic. On the shared
// workbook theme, so what reaches an outside firm carries the letterhead and
// the basis line rather than arriving as a bare grid.

import ExcelJS from "exceljs";
import {
  newWorkbook, titleBlock, headerBand, footNote, freezeAbove, repeatHeader,
  liveSum, liveAdd, totalEmphasis, COLOR, FMT, FONT_NAME, PRINT_WIDE,
} from "@/lib/excel/theme";
import type { Ten99Entity } from "./register";

const money = (n: number) => Math.round(n * 100) / 100;

export type Ten99ExportInput = {
  year: number;
  threshold: number;
  entities: Ten99Entity[];
  /** Rendered into the letterhead so the file says what it is on its face. */
  generatedBy?: string | null;
};

const BASIS =
  "Prepared from the general ledger. Cash disbursements only — what was actually PAID in the calendar year, " +
  "not what was expensed. Does NOT include taxpayer IDs, addresses, or an exemption determination: corporations " +
  "are generally exempt (except attorneys and medical), which is the accountant's call. A worksheet, not a filing.";

export async function exportTen99Xlsx(i: Ten99ExportInput): Promise<void> {
  const wb = newWorkbook();
  registerSheet(wb, i);
  detailSheet(wb, i);

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `1099-register-${i.year}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Write one body cell with the house body styling. */
function put(row: ExcelJS.Row, col: number, value: ExcelJS.CellValue, fmt?: string) {
  const cell = row.getCell(col);
  cell.value = value;
  cell.font = { name: FONT_NAME, size: 10, color: { argb: COLOR.text } };
  if (fmt) { cell.numFmt = fmt; cell.alignment = { horizontal: "right" }; }
  return cell;
}

/** One row per reportable vendor, grouped by filing entity, with live subtotals. */
function registerSheet(wb: ExcelJS.Workbook, i: Ten99ExportInput) {
  const HEAD = ["Filing entity", "EIN", "Vendor (as it appears in the ledger)", "Payments", "Total paid"];
  const ws = wb.addWorksheet("1099 Register", { pageSetup: { ...PRINT_WIDE } });
  ws.columns = [{ width: 32 }, { width: 13 }, { width: 42 }, { width: 10 }, { width: 14 }];

  const headerRow = titleBlock(ws, {
    entity: `1099 Register — ${i.year}`,
    document: `Vendors paid $${i.threshold.toLocaleString()} or more during the calendar year, by filing entity`,
    meta: [i.generatedBy ? `Prepared by ${i.generatedBy} on ${new Date().toLocaleDateString("en-US")}` : null],
    width: HEAD.length,
  });
  headerBand(ws, headerRow, HEAD);

  let r = headerRow + 1;
  // Where each subtotal lands, so the grand total sums the SUBTOTALS rather
  // than the vendor rows — re-summing the rows would double-count.
  const marks: { row: number; total: number; count: number }[] = [];
  const withVendors = i.entities.filter((e) => e.vendors.length > 0);

  for (const e of withVendors) {
    const firstRow = r;
    for (const v of e.vendors) {
      const row = ws.getRow(r);
      put(row, 1, e.name);
      put(row, 2, e.ein ?? "— not on file —");
      put(row, 3, v.name);
      put(row, 4, v.count, FMT.number);
      put(row, 5, money(v.total), FMT.money);
      r++;
    }
    const lastRow = r - 1;

    const sub = ws.getRow(r);
    const label = sub.getCell(1);
    label.value = `${e.name} — ${e.vendors.length} vendor${e.vendors.length === 1 ? "" : "s"}`;
    for (let c = 1; c <= HEAD.length; c++) {
      totalEmphasis(sub.getCell(c));
      sub.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.brandTint } };
    }
    const count = e.vendors.reduce((s, v) => s + v.count, 0);
    const total = money(e.vendors.reduce((s, v) => s + v.total, 0));
    sub.getCell(4).value = liveSum(`D${firstRow}:D${lastRow}`, count, e.vendors.map((v) => v.count));
    sub.getCell(4).numFmt = FMT.number;
    sub.getCell(5).value = liveSum(`E${firstRow}:E${lastRow}`, total, e.vendors.map((v) => money(v.total)));
    sub.getCell(5).numFmt = FMT.money;
    marks.push({ row: r, total, count });
    r += 2; // a blank line between entities
  }

  const grand = ws.getRow(r);
  grand.getCell(1).value = "GRAND TOTAL";
  for (let c = 1; c <= HEAD.length; c++) totalEmphasis(grand.getCell(c), { grand: true });
  if (marks.length) {
    grand.getCell(4).value = liveAdd(marks.map((m) => `D${m.row}`), marks.reduce((s, m) => s + m.count, 0), marks.map((m) => m.count));
    grand.getCell(4).numFmt = FMT.number;
    grand.getCell(5).value = liveAdd(marks.map((m) => `E${m.row}`), money(marks.reduce((s, m) => s + m.total, 0)), marks.map((m) => m.total));
    grand.getCell(5).numFmt = FMT.money;
  }

  freezeAbove(ws, headerRow);
  repeatHeader(ws, headerRow);
  footNote(ws, r + 2, BASIS, HEAD.length, 44);
}

/** Every payment behind the register, so a figure can be traced to a check. */
function detailSheet(wb: ExcelJS.Workbook, i: Ten99ExportInput) {
  const HEAD = ["Filing entity", "EIN", "Vendor", "Property", "Date", "Check / ref", "GL account", "Amount"];
  const ws = wb.addWorksheet("Payment Detail", { pageSetup: { ...PRINT_WIDE } });
  ws.columns = [{ width: 30 }, { width: 13 }, { width: 36 }, { width: 26 }, { width: 12 }, { width: 14 }, { width: 26 }, { width: 13 }];

  const headerRow = titleBlock(ws, {
    entity: `Payment Detail — ${i.year}`,
    document: "Every cash disbursement behind the register · one row per ledger line",
    width: HEAD.length,
  });
  headerBand(ws, headerRow, HEAD);

  let r = headerRow + 1;
  const firstDataRow = r;
  const amounts: number[] = [];
  let band = 0;
  for (const e of i.entities) {
    for (const v of e.vendors) {
      for (const p of v.payments) {
        const row = ws.getRow(r);
        put(row, 1, e.name);
        put(row, 2, e.ein ?? null);
        put(row, 3, v.name);
        put(row, 4, p.propertyName);
        put(row, 5, p.date ?? null);
        put(row, 6, p.ref);
        put(row, 7, `${p.account}${p.accountName ? ` ${p.accountName}` : ""}`);
        put(row, 8, money(p.amount), FMT.money);
        if (band % 2 === 1) for (let c = 1; c <= HEAD.length; c++) {
          row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.zebra } };
        }
        amounts.push(money(p.amount));
        band++;
        r++;
      }
    }
  }
  const lastDataRow = r - 1;

  const total = ws.getRow(r);
  total.getCell(1).value = "TOTAL";
  for (let c = 1; c <= HEAD.length; c++) totalEmphasis(total.getCell(c), { grand: true });
  if (lastDataRow >= firstDataRow) {
    // This total must equal the register's grand total; if it doesn't, a payment
    // is being counted in one place and not the other.
    total.getCell(8).value = liveSum(`H${firstDataRow}:H${lastDataRow}`, money(amounts.reduce((s, v) => s + v, 0)), amounts);
    total.getCell(8).numFmt = FMT.money;
  }

  freezeAbove(ws, headerRow);
  repeatHeader(ws, headerRow);
  footNote(
    ws, r + 2,
    "This total must equal the register's GRAND TOTAL. If it does not, a payment is being counted in one place and not the other.",
    HEAD.length, 16,
  );
}

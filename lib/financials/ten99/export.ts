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
// subtotal follow rather than having to redo the arithmetic.

import * as XLSX from "xlsx";
import type { Ten99Entity } from "./register";

type Cell = string | number | "";

const money = (n: number) => Math.round(n * 100) / 100;

export type Ten99ExportInput = {
  year: number;
  threshold: number;
  entities: Ten99Entity[];
  /** Rendered into the subtitle so the file says what it is on its face. */
  generatedBy?: string | null;
};

export function exportTen99Xlsx(i: Ten99ExportInput): void {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, registerSheet(i), "1099 Register");
  XLSX.utils.book_append_sheet(wb, detailSheet(i), "Payment Detail");
  XLSX.writeFile(wb, `1099-register-${i.year}.xlsx`);
}

/** One row per reportable vendor, grouped by filing entity, with live subtotals. */
function registerSheet(i: Ten99ExportInput): XLSX.WorkSheet {
  const HEAD = ["Filing entity", "EIN", "Vendor (as it appears in the ledger)", "Payments", "Total paid"];
  const aoa: Cell[][] = [
    [`1099 Register — ${i.year}`],
    [
      `Vendors paid $${i.threshold.toLocaleString()} or more during the calendar year, by filing entity. ` +
      `Cash disbursements only — what was actually paid in ${i.year}, not what was expensed.`,
    ],
    [
      "Prepared from the general ledger. Does NOT include taxpayer IDs, addresses, or an exemption determination — " +
      "corporations are generally exempt (except attorneys and medical), which is the accountant's call.",
    ],
    ...(i.generatedBy ? [[`Prepared by ${i.generatedBy} on ${new Date().toLocaleDateString("en-US")}`] as Cell[]] : []),
    [],
    HEAD,
  ];

  // Track where each subtotal lands so the grand total sums the subtotals rather
  // than the vendor rows — otherwise editing a subtotal formula double-counts.
  const marks: { row: number; firstRow: number; lastRow: number }[] = [];
  const withVendors = i.entities.filter((e) => e.vendors.length > 0);

  for (const e of withVendors) {
    const firstRow = aoa.length + 1; // 1-based sheet row of this entity's first vendor
    for (const v of e.vendors) {
      aoa.push([e.name, e.ein ?? "— not on file —", v.name, v.count, money(v.total)]);
    }
    const lastRow = aoa.length;
    aoa.push([`${e.name} — ${e.vendors.length} vendor${e.vendors.length === 1 ? "" : "s"}`, "", "", "", ""]);
    marks.push({ row: aoa.length, firstRow, lastRow });
    aoa.push([]);
  }
  aoa.push(["GRAND TOTAL", "", "", "", ""]);
  const grandRow = aoa.length;

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Subtotals: =SUM over that entity's vendor rows.
  marks.forEach((m, idx) => {
    const total = money(withVendors[idx].vendors.reduce((s, v) => s + v.total, 0));
    const count = withVendors[idx].vendors.reduce((s, v) => s + v.count, 0);
    ws[`D${m.row}`] = { t: "n", f: `SUM(D${m.firstRow}:D${m.lastRow})`, v: count };
    ws[`E${m.row}`] = { t: "n", f: `SUM(E${m.firstRow}:E${m.lastRow})`, v: total };
  });

  // Grand total: the subtotals added, not the vendor rows re-summed.
  if (marks.length) {
    const refs = marks.map((m) => `E${m.row}`).join(",");
    const countRefs = marks.map((m) => `D${m.row}`).join(",");
    const grand = money(withVendors.reduce((s, e) => s + e.vendors.reduce((t, v) => t + v.total, 0), 0));
    const grandCount = withVendors.reduce((s, e) => s + e.vendors.reduce((t, v) => t + v.count, 0), 0);
    ws[`D${grandRow}`] = { t: "n", f: `SUM(${countRefs})`, v: grandCount };
    ws[`E${grandRow}`] = { t: "n", f: `SUM(${refs})`, v: grand };
  }

  ws["!cols"] = [{ wch: 32 }, { wch: 13 }, { wch: 42 }, { wch: 10 }, { wch: 14 }];
  return ws;
}

/** Every payment behind the register, so a figure can be traced to a check. */
function detailSheet(i: Ten99ExportInput): XLSX.WorkSheet {
  const aoa: Cell[][] = [
    [`Payment Detail — ${i.year}`],
    ["Every cash disbursement behind the register. One row per ledger line."],
    [],
    ["Filing entity", "EIN", "Vendor", "Property", "Date", "Check / ref", "GL account", "Amount"],
  ];
  const firstDataRow = aoa.length + 1;
  for (const e of i.entities) {
    for (const v of e.vendors) {
      for (const p of v.payments) {
        aoa.push([
          e.name, e.ein ?? "", v.name, p.propertyName,
          p.date ?? "", p.ref, `${p.account}${p.accountName ? ` ${p.accountName}` : ""}`,
          money(p.amount),
        ]);
      }
    }
  }
  const lastDataRow = aoa.length;
  aoa.push(["TOTAL", "", "", "", "", "", "", ""]);
  const totalRow = aoa.length;

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  if (lastDataRow >= firstDataRow) {
    // This total must equal the register's grand total; if it doesn't, a payment
    // is being counted in one place and not the other.
    const v = money(
      i.entities.reduce((s, e) => s + e.vendors.reduce((t, x) => t + x.payments.reduce((a, p) => a + p.amount, 0), 0), 0),
    );
    ws[`H${totalRow}`] = { t: "n", f: `SUM(H${firstDataRow}:H${lastDataRow})`, v };
  }
  ws["!cols"] = [{ wch: 30 }, { wch: 13 }, { wch: 36 }, { wch: 26 }, { wch: 12 }, { wch: 14 }, { wch: 26 }, { wch: 13 }];
  return ws;
}

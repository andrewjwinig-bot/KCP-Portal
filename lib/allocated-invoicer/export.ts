import * as XLSX from "xlsx";

// Whole-dollar currency: comma thousands, no decimals, negatives in parens.
// Display-only — the underlying values keep full precision so SUM formulas tie.
const MONEY_FMT = '$#,##0;($#,##0)';

/** Apply a number format to every numeric cell in a column over a row range. */
function formatColumn(
  ws: XLSX.WorkSheet,
  colIdx: number,
  firstRow0: number,
  lastRow0: number,
  fmt: string,
): void {
  for (let r = firstRow0; r <= lastRow0; r++) {
    const cell = ws[XLSX.utils.encode_cell({ r, c: colIdx })] as XLSX.CellObject | undefined;
    if (cell && cell.t === "n") cell.z = fmt;
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type AllocExportRow = {
  propertyId: string;
  propertyName: string;
  accountCode: string;
  accountName: string;
  accountSuffix: "9301" | "9302" | "9303";
  grossAmount: number;
  allocPct: number;    // 0..1
  allocAmount: number;
};

export type BuildAllocExportArgs = {
  periodText: string;
  rows: AllocExportRow[];
  propertyOrder: { id: string; name: string }[];
  accountCodes: string[];  // ordered list of all account codes in the data
};

// ─── Builder ─────────────────────────────────────────────────────────────────

export function buildAllocExportXlsx(args: BuildAllocExportArgs): Blob {
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Allocations ─────────────────────────────────────────────────
  // Flat table — one row per (property × account code) combination

  const sorted = [...args.rows].sort((a, b) =>
    a.propertyId.localeCompare(b.propertyId) || a.accountCode.localeCompare(b.accountCode)
  );

  const allocAoa: (string | number | null)[][] = [
    ["Property", "Property Name", "Account Suffix", "Account Code", "Account Name", "Gross Amount", "Allocation %", "Allocated Amount"],
    ...sorted.map((r) => [
      r.propertyId,
      r.propertyName,
      r.accountSuffix,
      r.accountCode,
      r.accountName,
      r.grossAmount,
      parseFloat((r.allocPct * 100).toFixed(4)),
      r.allocAmount,
    ]),
  ];

  const allocSheet = XLSX.utils.aoa_to_sheet(allocAoa);
  allocSheet["!cols"] = [
    { wch: 10 }, // Property
    { wch: 30 }, // Property Name
    { wch: 14 }, // Account Suffix
    { wch: 14 }, // Account Code
    { wch: 32 }, // Account Name
    { wch: 16 }, // Gross Amount
    { wch: 14 }, // Allocation %
    { wch: 18 }, // Allocated Amount
  ];
  // Whole-dollar formatting on the money columns (Gross Amount, Allocated Amount).
  formatColumn(allocSheet, 5, 1, sorted.length, MONEY_FMT);
  formatColumn(allocSheet, 7, 1, sorted.length, MONEY_FMT);
  XLSX.utils.book_append_sheet(wb, allocSheet, "Allocations");

  // ── Sheet 2: Summary ─────────────────────────────────────────────────────
  // Pivot: properties as rows, account codes as columns. Two-row header
  // (account NAME above account CODE). The TOTAL column and the TOTAL row are
  // live SUM formulas so the workbook recalculates if a figure is edited.

  // Build totals map (propertyId → accountCode → allocAmount) + code→name.
  const totalsMap = new Map<string, Map<string, number>>();
  const codeName = new Map<string, string>();
  for (const r of args.rows) {
    const propMap = totalsMap.get(r.propertyId) ?? new Map<string, number>();
    propMap.set(r.accountCode, (propMap.get(r.accountCode) ?? 0) + r.allocAmount);
    totalsMap.set(r.propertyId, propMap);
    if (!codeName.has(r.accountCode)) codeName.set(r.accountCode, r.accountName);
  }

  const activeProps = args.propertyOrder.filter((p) => totalsMap.has(p.id));
  const accCodes = args.accountCodes;

  const totalColIdx = 2 + accCodes.length;          // 0-based: after the code columns
  const colLetter = (i: number) => XLSX.utils.encode_col(i);
  const totalColL = colLetter(totalColIdx);
  const firstCodeL = colLetter(2);
  const lastCodeL = colLetter(2 + Math.max(0, accCodes.length - 1));

  // Row 1: account names over their codes. Row 2: Property / codes / TOTAL.
  const nameHeader = ["", "", ...accCodes.map((ac) => codeName.get(ac) ?? ""), ""];
  const codeHeader = ["Property", "Property Name", ...accCodes, "TOTAL"];

  const dataRows = activeProps.map((p) => {
    const propMap = totalsMap.get(p.id)!;
    const amounts = accCodes.map((ac) => {
      const v = propMap.get(ac) ?? 0;
      return v === 0 ? null : v;
    });
    return [p.id, p.name, ...amounts, null]; // TOTAL filled with a formula below
  });

  const totalsRow = ["TOTAL", "", ...accCodes.map(() => null), null];

  const summaryAoa = [nameHeader, codeHeader, ...dataRows, totalsRow];
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryAoa);

  // Excel rows are 1-based: name=1, code=2, data 3..(2+N), TOTAL row last.
  const firstDataRow = 3;
  const lastDataRow = 2 + activeProps.length;
  const totalRowNum = lastDataRow + 1;
  const haveData = activeProps.length > 0;

  // TOTAL column — per-row SUM across the account-code columns.
  if (haveData && accCodes.length > 0) {
    for (let i = 0; i < activeProps.length; i++) {
      const R = firstDataRow + i;
      const propMap = totalsMap.get(activeProps[i].id)!;
      const cached = accCodes.reduce((a, ac) => a + (propMap.get(ac) ?? 0), 0);
      summarySheet[`${totalColL}${R}`] = { t: "n", f: `SUM(${firstCodeL}${R}:${lastCodeL}${R})`, v: cached };
    }
  }

  // TOTAL row — per-column SUM down the data rows, then a grand total.
  for (let k = 0; k < accCodes.length; k++) {
    const L = colLetter(2 + k);
    const cached = activeProps.reduce((a, p) => a + (totalsMap.get(p.id)?.get(accCodes[k]) ?? 0), 0);
    summarySheet[`${L}${totalRowNum}`] = haveData
      ? { t: "n", f: `SUM(${L}${firstDataRow}:${L}${lastDataRow})`, v: cached }
      : { t: "n", v: 0 };
  }
  const grandCached = activeProps.reduce(
    (a, p) => a + accCodes.reduce((b, ac) => b + (totalsMap.get(p.id)?.get(ac) ?? 0), 0), 0);
  summarySheet[`${totalColL}${totalRowNum}`] = haveData && accCodes.length > 0
    ? { t: "n", f: `SUM(${totalColL}${firstDataRow}:${totalColL}${lastDataRow})`, v: grandCached }
    : { t: "n", v: grandCached };

  // Make sure the worksheet range covers the formula cells we set by address.
  summarySheet["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: totalRowNum - 1, c: totalColIdx } });

  // Whole-dollar formatting on every money cell (data + TOTAL row + TOTAL col).
  for (let c = 2; c <= totalColIdx; c++) {
    formatColumn(summarySheet, c, firstDataRow - 1, totalRowNum - 1, MONEY_FMT);
  }

  summarySheet["!cols"] = [
    { wch: 10 },
    { wch: 30 },
    ...accCodes.map(() => ({ wch: 16 })),
    { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");

  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Blob([wbout], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

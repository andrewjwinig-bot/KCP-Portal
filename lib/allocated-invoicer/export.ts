import * as XLSX from "xlsx";

// ─── Number formats ──────────────────────────────────────────────────────────
// Whole-dollar accounting: comma thousands, no decimals, negatives in parens.
// Registered at a valid custom numFmt id (>=164) so Excel never falls back to a
// reserved built-in format (which renders the cell incorrectly). Percent maps
// to an Excel built-in, so no registration is needed.
const MONEY_FMT = '"$"#,##0;("$"#,##0)';
const MONEY_FMT_ID = 164;
const PCT_FMT = "0.00%";

function registerFormats(): void {
  // Idempotent — pins MONEY_FMT to a stable custom id across builds.
  XLSX.SSF.load(MONEY_FMT, MONEY_FMT_ID);
}

function setFmt(ws: XLSX.WorkSheet, addr: string, fmt: string): void {
  const cell = ws[addr] as XLSX.CellObject | undefined;
  if (cell) cell.z = fmt;
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
//
// The workbook is built to be fully editable + traceable: every derived figure
// is a live formula.
//   • Allocations tab: Allocated Amount = Gross × Allocation %.
//   • Summary tab: each property×account cell SUMIFS back into the Allocations
//     tab (follow the trail); TOTAL column/row + grand total are SUM formulas.
// Source inputs (Gross Amount, Allocation %) stay as values; cached results are
// stored alongside each formula so non-Excel viewers still show numbers.

export function buildAllocExportXlsx(args: BuildAllocExportArgs): Blob {
  registerFormats();
  const wb = XLSX.utils.book_new();
  const col = (i: number) => XLSX.utils.encode_col(i);

  // ── Sheet 1: Allocations ─────────────────────────────────────────────────
  // One row per (property × account code). Allocated Amount is a formula.
  const sorted = [...args.rows].sort((a, b) =>
    a.propertyId.localeCompare(b.propertyId) || a.accountCode.localeCompare(b.accountCode),
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
      r.allocPct,   // stored as a fraction (0..1) so the % format + formulas work
      null,         // Allocated Amount — filled with a formula below
    ]),
  ];

  const allocSheet = XLSX.utils.aoa_to_sheet(allocAoa);
  for (let i = 0; i < sorted.length; i++) {
    const R = i + 2; // 1-based Excel row (row 1 = header)
    // Allocated Amount = Gross Amount × Allocation %
    allocSheet[`H${R}`] = { t: "n", f: `F${R}*G${R}`, v: sorted[i].allocAmount };
    setFmt(allocSheet, `F${R}`, MONEY_FMT); // Gross Amount
    setFmt(allocSheet, `G${R}`, PCT_FMT);   // Allocation %
    setFmt(allocSheet, `H${R}`, MONEY_FMT); // Allocated Amount
  }
  allocSheet["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: sorted.length, c: 7 } });
  allocSheet["!cols"] = [
    { wch: 10 }, { wch: 30 }, { wch: 14 }, { wch: 14 },
    { wch: 32 }, { wch: 16 }, { wch: 14 }, { wch: 18 },
  ];
  XLSX.utils.book_append_sheet(wb, allocSheet, "Allocations");

  // Allocations data extent + ranges used by the Summary's SUMIFS formulas.
  const allocLastRow = sorted.length + 1; // last data row (1-based)
  const propRange = `Allocations!$A$2:$A$${allocLastRow}`;
  const codeRange = `Allocations!$D$2:$D$${allocLastRow}`;
  const amtRange = `Allocations!$H$2:$H$${allocLastRow}`;

  // ── Sheet 2: Summary ─────────────────────────────────────────────────────
  // Pivot: properties as rows, account codes as columns. Two-row header
  // (account NAME above account CODE). Every cell is a live formula.

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

  const totalColIdx = 2 + accCodes.length;             // 0-based col after the codes
  const totalColL = col(totalColIdx);
  const firstCodeL = col(2);
  const lastCodeL = col(2 + Math.max(0, accCodes.length - 1));

  const nameHeader = ["", "", ...accCodes.map((ac) => codeName.get(ac) ?? ""), ""];
  const codeHeader = ["Property", "Property Name", ...accCodes, "TOTAL"];
  const dataRows = activeProps.map((p) => [p.id, p.name, ...accCodes.map(() => null), null]);
  const totalsRow = ["TOTAL", "", ...accCodes.map(() => null), null];

  const summarySheet = XLSX.utils.aoa_to_sheet([nameHeader, codeHeader, ...dataRows, totalsRow]);

  const firstDataRow = 3;                       // 1-based: name=1, code=2, data=3..
  const lastDataRow = 2 + activeProps.length;
  const totalRowNum = lastDataRow + 1;
  const haveData = activeProps.length > 0;

  // Data cells: SUMIFS back into the Allocations tab (matched on property + code).
  for (let pi = 0; pi < activeProps.length; pi++) {
    const R = firstDataRow + pi;
    const propMap = totalsMap.get(activeProps[pi].id)!;
    for (let k = 0; k < accCodes.length; k++) {
      const L = col(2 + k);
      const cached = propMap.get(accCodes[k]) ?? 0;
      summarySheet[`${L}${R}`] = {
        t: "n",
        f: `SUMIFS(${amtRange},${propRange},$A${R},${codeRange},${L}$2)`,
        v: cached,
      };
      setFmt(summarySheet, `${L}${R}`, MONEY_FMT);
    }
    // TOTAL column = SUM across this row's account-code columns.
    if (accCodes.length > 0) {
      const cachedRow = accCodes.reduce((a, ac) => a + (propMap.get(ac) ?? 0), 0);
      summarySheet[`${totalColL}${R}`] = { t: "n", f: `SUM(${firstCodeL}${R}:${lastCodeL}${R})`, v: cachedRow };
      setFmt(summarySheet, `${totalColL}${R}`, MONEY_FMT);
    }
  }

  // TOTAL row = SUM down each account-code column, then a grand total.
  for (let k = 0; k < accCodes.length; k++) {
    const L = col(2 + k);
    const cached = activeProps.reduce((a, p) => a + (totalsMap.get(p.id)?.get(accCodes[k]) ?? 0), 0);
    summarySheet[`${L}${totalRowNum}`] = haveData
      ? { t: "n", f: `SUM(${L}${firstDataRow}:${L}${lastDataRow})`, v: cached }
      : { t: "n", v: 0 };
    setFmt(summarySheet, `${L}${totalRowNum}`, MONEY_FMT);
  }
  const grand = activeProps.reduce(
    (a, p) => a + accCodes.reduce((b, ac) => b + (totalsMap.get(p.id)?.get(ac) ?? 0), 0), 0);
  summarySheet[`${totalColL}${totalRowNum}`] = haveData && accCodes.length > 0
    ? { t: "n", f: `SUM(${totalColL}${firstDataRow}:${totalColL}${lastDataRow})`, v: grand }
    : { t: "n", v: grand };
  setFmt(summarySheet, `${totalColL}${totalRowNum}`, MONEY_FMT);

  summarySheet["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: totalRowNum - 1, c: totalColIdx } });
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

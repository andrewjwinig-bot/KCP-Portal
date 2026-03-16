import * as XLSX from "xlsx";

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
  XLSX.utils.book_append_sheet(wb, allocSheet, "Allocations");

  // ── Sheet 2: Summary ─────────────────────────────────────────────────────
  // Pivot: properties as rows, account codes as columns

  // Build totals map: propertyId → accountCode → allocAmount
  const totalsMap = new Map<string, Map<string, number>>();
  for (const r of args.rows) {
    const propMap = totalsMap.get(r.propertyId) ?? new Map<string, number>();
    propMap.set(r.accountCode, (propMap.get(r.accountCode) ?? 0) + r.allocAmount);
    totalsMap.set(r.propertyId, propMap);
  }

  const activeProps = args.propertyOrder.filter((p) => totalsMap.has(p.id));
  const accCodes = args.accountCodes;

  const summaryHeader = ["Property", "Property Name", ...accCodes, "TOTAL"];

  const summaryRows = activeProps.map((p) => {
    const propMap = totalsMap.get(p.id)!;
    const amounts = accCodes.map((ac) => {
      const v = propMap.get(ac) ?? 0;
      return v === 0 ? null : v;
    });
    const rowTotal = accCodes.reduce((a, ac) => a + (propMap.get(ac) ?? 0), 0);
    return [p.id, p.name, ...amounts, rowTotal];
  });

  const colTotals = accCodes.map((ac) =>
    activeProps.reduce((a, p) => a + (totalsMap.get(p.id)?.get(ac) ?? 0), 0)
  );
  const grandTotal = colTotals.reduce((a, v) => a + v, 0);
  const totalsRow = ["TOTAL", "", ...colTotals.map((v) => (v === 0 ? null : v)), grandTotal];

  const summaryAoa = [summaryHeader, ...summaryRows, totalsRow];
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryAoa);
  summarySheet["!cols"] = [
    { wch: 10 },
    { wch: 30 },
    ...accCodes.map(() => ({ wch: 14 })),
    { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");

  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Blob([wbout], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

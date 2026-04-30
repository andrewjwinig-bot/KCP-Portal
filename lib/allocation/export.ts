import * as XLSX from "xlsx";
import { PROPERTY_DEFS } from "../properties/data";

export type AllocExportEmployee = {
  name: string;
  employeeNumber?: string;
  recoverable: boolean;
  allocations: Record<string, number>; // fractions 0..1
};

const GROUP_ORDER = [
  { label: "Business Parks",   match: (id: string) => PROPERTY_DEFS.find((p) => p.id === id)?.allocGroup === "BP" },
  { label: "Shopping Centers", match: (id: string) => PROPERTY_DEFS.find((p) => p.id === id)?.allocGroup === "SC" },
  { label: "Misc / Other",     match: () => true }, // catch-all
];

function propName(id: string): string {
  return PROPERTY_DEFS.find((p) => p.id === id)?.name ?? id;
}

function pctCell(v: number): XLSX.CellObject {
  return { v, t: "n", z: "0.00%" };
}

export function buildAllocationTemplateXlsx(employees: AllocExportEmployee[]): Blob {
  const usedKeys = Array.from(
    new Set(employees.flatMap((e) => Object.keys(e.allocations ?? {})))
  );

  // Assign each key to a group, preserving PROPERTY_DEFS order within each group
  const assigned = new Set<string>();
  const grouped: Array<{ label: string; keys: string[] }> = [];

  for (const group of GROUP_ORDER) {
    const keys: string[] = [];
    for (const def of PROPERTY_DEFS) {
      if (usedKeys.includes(def.id) && group.match(def.id) && !assigned.has(def.id)) {
        keys.push(def.id);
        assigned.add(def.id);
      }
    }
    // Catch-all: keys not in PROPERTY_DEFS (e.g. "Marketing")
    if (group.label === "Misc / Other") {
      for (const key of usedKeys) {
        if (!assigned.has(key)) { keys.push(key); assigned.add(key); }
      }
    }
    if (keys.length) grouped.push({ label: group.label, keys });
  }

  const orderedKeys = grouped.flatMap((g) => g.keys);
  const FIXED = 3; // Emp #, Employee Name, REC/NR

  // ── Row 0: group span headers ──────────────────────────────────────────────
  const row0: (string | XLSX.CellObject)[] = ["", "", ""];
  for (const g of grouped) {
    row0.push(g.label);
    for (let i = 1; i < g.keys.length; i++) row0.push("");
  }
  row0.push(""); // above Total % column

  // ── Row 1: property column headers (code — name) ───────────────────────────
  const row1: string[] = ["Emp #", "Employee Name", "REC/NR"];
  for (const key of orderedKeys) row1.push(`${key} — ${propName(key)}`);
  row1.push("Total %");

  // ── Employee rows ──────────────────────────────────────────────────────────
  const dataRows = employees.map((e) => {
    const row: (string | XLSX.CellObject)[] = [
      e.employeeNumber ?? "",
      e.name,
      e.recoverable ? "REC" : "NR",
    ];
    let rowTotal = 0;
    for (const key of orderedKeys) {
      const v = e.allocations[key] ?? 0;
      row.push(v > 0 ? pctCell(v) : "");
      rowTotal += v;
    }
    row.push(rowTotal > 0 ? pctCell(rowTotal) : "");
    return row;
  });

  // ── Totals row ─────────────────────────────────────────────────────────────
  const totalsRow: (string | XLSX.CellObject)[] = ["", "TOTAL", ""];
  for (const key of orderedKeys) {
    const sum = employees.reduce((s, e) => s + (e.allocations[key] ?? 0), 0);
    totalsRow.push(sum > 0 ? pctCell(sum) : "");
  }
  totalsRow.push("");

  const aoa = [row0, row1, ...dataRows, totalsRow];
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Merge group header cells across their property columns
  const merges: XLSX.Range[] = [];
  let mc = FIXED;
  for (const g of grouped) {
    if (g.keys.length > 1) {
      merges.push({ s: { r: 0, c: mc }, e: { r: 0, c: mc + g.keys.length - 1 } });
    }
    mc += g.keys.length;
  }
  ws["!merges"] = merges;

  // Column widths
  ws["!cols"] = [
    { wch: 8 },  // Emp #
    { wch: 26 }, // Employee Name
    { wch: 7 },  // REC/NR
    ...orderedKeys.map((k) => ({ wch: Math.max(14, Math.min(24, propName(k).length + 2)) })),
    { wch: 9 },  // Total %
  ];

  // Freeze first 2 header rows and first 3 fixed columns
  ws["!sheetViews"] = [{ state: "frozen", xSplit: FIXED, ySplit: 2 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Allocations");

  // ── Sheet 2: upload-ready template (matches parseAllocationWorkbook format) ─
  const uploadKeys = [...usedKeys].sort();
  const uploadHeader = ["EmployeeID", "EmployeeName", "Recoverable", ...uploadKeys];
  const uploadRows = employees.map((e) => [
    e.employeeNumber ?? "",
    e.name,
    e.recoverable ? "REC" : "NR",
    ...uploadKeys.map((k) => {
      const v = e.allocations[k] ?? 0;
      return v > 0 ? Math.round(v * 10000) / 100 : "";
    }),
  ]);
  const ws2 = XLSX.utils.aoa_to_sheet([uploadHeader, ...uploadRows]);
  ws2["!cols"] = [
    { wch: 12 }, { wch: 30 }, { wch: 12 },
    ...uploadKeys.map(() => ({ wch: 10 })),
  ];
  ws2["!sheetViews"] = [{ state: "frozen", xSplit: 0, ySplit: 1 }];
  XLSX.utils.book_append_sheet(wb, ws2, "Upload Template");

  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

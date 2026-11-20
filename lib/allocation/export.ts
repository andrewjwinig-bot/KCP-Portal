import {
  newWorkbook, headerBand, footNote, freezeAbove, repeatHeader,
  liveSum, totalEmphasis, COLOR, FMT, FONT_NAME, PRINT_WIDE, KORMAN_TEXT,
} from "@/lib/excel/theme";
import { PROPERTY_DEFS } from "../properties/data";

// TWO sheets, and only ONE of them is a document.
//
// "Allocations" is the grid Nancy and the controller READ and edit — grouped by
// Business Parks / Shopping Centers, percentages down each property column.
// That one carries the house look.
//
// "Upload Template" does NOT. It is parsed straight back by
// `parseAllocationWorkbook`, which expects its header on row 1 and its columns
// where they are. A letterhead would shift every row and break the re-import.
// It stays a bare grid deliberately.

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

export async function buildAllocationTemplateXlsx(employees: AllocExportEmployee[]): Promise<Blob> {
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
  const nCols = FIXED + orderedKeys.length + 1;

  const wb = newWorkbook();
  const ws = wb.addWorksheet("Allocations", { pageSetup: { ...PRINT_WIDE } });
  ws.columns = [
    { width: 8 },  // Emp #
    { width: 26 }, // Employee Name
    { width: 7 },  // REC/NR
    ...orderedKeys.map((k) => ({ width: Math.max(14, Math.min(24, propName(k).length + 2)) })),
    { width: 9 },  // Total %
  ];

  // A one-line letterhead rather than the full titleBlock: this sheet is very
  // wide and already spends two rows on its own group/column headers, so a
  // three-band block would push the grid off the first screen.
  const brand = ws.getCell(1, 1);
  brand.value = `${KORMAN_TEXT}   ·   Payroll Allocation by Property`;
  brand.font = { name: FONT_NAME, size: 10, bold: true, color: { argb: COLOR.white } };
  for (let c = 1; c <= nCols; c++) {
    ws.getCell(1, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.brandDark } };
  }
  ws.getRow(1).height = 20;

  // ── Row 2: group span headers ─────────────────────────────────────────────
  const GROUP_ROW = 2, HEAD_ROW = 3;
  let gc = FIXED + 1;
  for (const g of grouped) {
    const cell = ws.getCell(GROUP_ROW, gc);
    cell.value = g.label;
    cell.font = { name: FONT_NAME, size: 10, bold: true, color: { argb: COLOR.brand } };
    cell.alignment = { horizontal: "center" };
    for (let c = gc; c < gc + g.keys.length; c++) {
      ws.getCell(GROUP_ROW, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.brandTint } };
    }
    if (g.keys.length > 1) ws.mergeCells(GROUP_ROW, gc, GROUP_ROW, gc + g.keys.length - 1);
    gc += g.keys.length;
  }

  // ── Row 3: property column headers (code — name) ──────────────────────────
  headerBand(ws, HEAD_ROW, [
    "Emp #", "Employee Name", "REC/NR",
    ...orderedKeys.map((k) => `${k} — ${propName(k)}`),
    "Total %",
  ]);

  // ── Employee rows ─────────────────────────────────────────────────────────
  const firstBody = HEAD_ROW + 1;
  employees.forEach((e, i) => {
    const r = firstBody + i;
    const row = ws.getRow(r);
    const text = (c: number, v: string) => {
      row.getCell(c).value = v;
      row.getCell(c).font = { name: FONT_NAME, size: 10, color: { argb: COLOR.text } };
    };
    text(1, e.employeeNumber ?? "");
    text(2, e.name);
    text(3, e.recoverable ? "REC" : "NR");

    const fractions: number[] = [];
    orderedKeys.forEach((key, k) => {
      const v = e.allocations[key] ?? 0;
      fractions.push(v);
      const cell = row.getCell(FIXED + 1 + k);
      cell.value = v > 0 ? v : null;
      cell.numFmt = FMT.percent2;
      cell.font = { name: FONT_NAME, size: 10, color: { argb: COLOR.text } };
      cell.alignment = { horizontal: "right" };
    });

    // Total % = SUM across that row's property columns, so an edited percentage
    // flows through. This is the column the dashboard's allocation-gap warning
    // reads against — a person's row is meant to reach 100%.
    const rowTotal = fractions.reduce((s, v) => s + v, 0);
    const tc = row.getCell(nCols);
    const firstL = ws.getColumn(FIXED + 1).letter, lastL = ws.getColumn(FIXED + orderedKeys.length).letter;
    tc.value = rowTotal > 0 ? liveSum(`${firstL}${r}:${lastL}${r}`, rowTotal, fractions) : null;
    tc.numFmt = FMT.percent2;
    totalEmphasis(tc);

    if (i % 2 === 1) for (let c = 1; c <= nCols; c++) {
      row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.zebra } };
    }
  });

  // ── Totals row ────────────────────────────────────────────────────────────
  const lastBody = firstBody + employees.length - 1;
  const totalsRow = ws.getRow(lastBody + 1);
  totalsRow.getCell(2).value = "TOTAL";
  for (let c = 1; c <= nCols; c++) totalEmphasis(totalsRow.getCell(c), { grand: true });
  if (employees.length > 0) orderedKeys.forEach((key, k) => {
    const col = FIXED + 1 + k;
    const L = ws.getColumn(col).letter;
    const sources = employees.map((e) => e.allocations[key] ?? 0);
    const sum = sources.reduce((s, v) => s + v, 0);
    const cell = totalsRow.getCell(col);
    cell.value = sum > 0 ? liveSum(`${L}${firstBody}:${L}${lastBody}`, sum, sources) : null;
    cell.numFmt = FMT.percent2;
  });

  // The three identifying columns and the two header rows stay put while a wide
  // grid scrolls sideways.
  freezeAbove(ws, HEAD_ROW, FIXED);
  repeatHeader(ws, GROUP_ROW, HEAD_ROW);
  footNote(
    ws, lastBody + 3,
    "Each employee's row should total 100%. A column total is the share of all payroll carried by that property, " +
    "not a percentage of anything — it is shown so a keying error stands out.",
    nCols, 30,
  );

  // ── Sheet 2: upload-ready template (matches parseAllocationWorkbook format) ─
  // DELIBERATELY UNSTYLED. `parseAllocationWorkbook` reads this back with its
  // header on row 1; a letterhead here would break the re-import.
  const uploadKeys = [...usedKeys].sort();
  const ws2 = wb.addWorksheet("Upload Template");
  ws2.columns = [
    { width: 12 }, { width: 30 }, { width: 12 },
    ...uploadKeys.map(() => ({ width: 10 })),
  ];
  ws2.addRow(["EmployeeID", "EmployeeName", "Recoverable", ...uploadKeys]);
  for (const e of employees) {
    ws2.addRow([
      e.employeeNumber ?? "",
      e.name,
      e.recoverable ? "REC" : "NR",
      ...uploadKeys.map((k) => {
        const v = e.allocations[k] ?? 0;
        return v > 0 ? Math.round(v * 10000) / 100 : "";
      }),
    ]);
  }
  ws2.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

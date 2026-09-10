// Cash Sheet export — a complete Excel workbook and a landscape PDF of the
// current snapshot. Both are built client-side from the rows already on the page
// (no re-fetch), so the export is exactly what's displayed. Excel is flat +
// filterable (a Group column + a Portfolio Total row); the PDF is grouped with
// subtotals to mirror the on-screen layout.

import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";

export type ExportTotals = {
  opening: number | null;
  byBucket: Record<number, number>;
  ending: number | null;
  bills: number;
  reserves: number;
  estAvail: number | null;
};
export type ExportLine = ExportTotals & { code: string; name: string };
export type ExportGroup = { group: string; rows: ExportLine[]; subtotal: ExportTotals };
export type CashSheetExportInput = {
  title: string;
  subtitle: string;
  buckets: { code: number; label: string }[];
  openLabel: string;
  endLabel: string;
  estLabel: string;
  showBills: boolean;
  showReserves: boolean;
  showEst: boolean;
  groups: ExportGroup[];
  total: ExportTotals;
  fileBase: string;
};

const round = (n: number | null): number | "" => (n == null ? "" : Math.round(n));
const fmt = (n: number | null): string =>
  n == null ? "—" : (n < 0 ? "-" : "") + "$" + Math.abs(Math.round(n)).toLocaleString("en-US");

function columnHeader(i: CashSheetExportInput): string[] {
  const head = ["Group", "Code", "Entity", `Opening (${i.openLabel})`, ...i.buckets.map((b) => b.label), `Ending (${i.endLabel})`];
  if (i.showBills) head.push("Avid Bills");
  if (i.showReserves) head.push("Reserves");
  if (i.showEst) head.push(`Est. Available (${i.estLabel})`);
  return head;
}

function numericCells(i: CashSheetExportInput, t: ExportTotals): (number | "")[] {
  const cells: (number | "")[] = [round(t.opening), ...i.buckets.map((b) => t.byBucket[b.code] ?? 0), round(t.ending)];
  if (i.showBills) cells.push(Math.round(t.bills || 0));
  if (i.showReserves) cells.push(Math.round(t.reserves || 0));
  if (i.showEst) cells.push(round(t.estAvail));
  return cells;
}

/** Build + download the Excel workbook (flat rows + a Portfolio Total). */
export function exportCashSheetXlsx(i: CashSheetExportInput): void {
  const head = columnHeader(i);
  const aoa: (string | number | "")[][] = [[i.title], [i.subtitle], [], head];
  for (const g of i.groups) {
    for (const l of g.rows) aoa.push([g.group, l.code, l.name, ...numericCells(i, l)]);
  }
  aoa.push(["Portfolio Total", "", "", ...numericCells(i, i.total)]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Make the Portfolio Total a live =SUM() of every entity row per numeric column
  // so the workbook stays accurate if a figure is edited. Cached value = the JS
  // total already computed; a non-numeric total (—) stays as text.
  const dataCount = i.groups.reduce((n, g) => n + g.rows.length, 0);
  if (dataCount > 0) {
    const firstDataRow = 5; // rows 1–4 = title, subtitle, blank, header
    const lastDataRow = 4 + dataCount;
    const totalRow = lastDataRow + 1;
    const firstNumCol = 3; // 0-based → column D (Group, Code, Entity, then numerics)
    numericCells(i, i.total).forEach((val, k) => {
      if (typeof val !== "number") return;
      const L = XLSX.utils.encode_col(firstNumCol + k);
      ws[`${L}${totalRow}`] = { t: "n", f: `SUM(${L}${firstDataRow}:${L}${lastDataRow})`, v: val };
    });
  }

  const widths = [{ wch: 22 }, { wch: 12 }, { wch: 30 }, { wch: 14 }, ...i.buckets.map(() => ({ wch: 13 })), { wch: 14 }];
  if (i.showBills) widths.push({ wch: 12 });
  if (i.showReserves) widths.push({ wch: 11 });
  if (i.showEst) widths.push({ wch: 15 });
  ws["!cols"] = widths;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Cash Analysis");
  XLSX.writeFile(wb, `${i.fileBase}.xlsx`);
}

/** Build + download the landscape PDF (grouped, with subtotals + total). */
export function exportCashSheetPdf(i: CashSheetExportInput): void {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 32;

  // Columns: Entity (wide, left) + the numeric columns (right-aligned).
  const numHeads = [`Opening`, ...i.buckets.map((b) => b.label), `Ending`];
  if (i.showBills) numHeads.push("Avid Bills");
  if (i.showReserves) numHeads.push("Reserves");
  if (i.showEst) numHeads.push("Est. Avail");
  const entityW = 150;
  const numW = (pageW - margin * 2 - entityW) / numHeads.length;
  const colX = (idx: number) => margin + entityW + idx * numW + numW; // right edge of numeric col idx

  let y = margin;

  const drawTitle = () => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(13);
    doc.text(i.title, margin, y + 4); y += 16;
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(110);
    doc.text(i.subtitle, margin, y + 2); doc.setTextColor(0); y += 14;
  };
  const drawHead = () => {
    doc.setFillColor(11, 74, 125); doc.rect(margin, y, pageW - margin * 2, 16, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(255);
    doc.text("Entity", margin + 3, y + 11);
    numHeads.forEach((h, idx) => doc.text(h, colX(idx) - 2, y + 11, { align: "right" }));
    doc.setTextColor(0); y += 16;
  };
  const ensure = (h: number) => { if (y + h > pageH - margin) { doc.addPage(); y = margin; drawHead(); } };

  const drawNums = (t: ExportTotals, bold: boolean) => {
    doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(6.5);
    const cells = [t.opening, ...i.buckets.map((b) => t.byBucket[b.code] ?? 0), t.ending,
      ...(i.showBills ? [t.bills] : []), ...(i.showReserves ? [t.reserves] : []), ...(i.showEst ? [t.estAvail] : [])];
    cells.forEach((v, idx) => doc.text(fmt(typeof v === "number" || v === null ? v : 0), colX(idx) - 2, y + 9, { align: "right" }));
  };

  drawTitle();
  drawHead();
  for (const g of i.groups) {
    ensure(13);
    doc.setFillColor(238, 242, 247); doc.rect(margin, y, pageW - margin * 2, 13, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(7);
    doc.text(g.group, margin + 3, y + 9);
    drawNums(g.subtotal, true);
    y += 13;
    for (const l of g.rows) {
      ensure(11);
      doc.setFont("helvetica", "normal"); doc.setFontSize(6.5);
      const label = `${l.code}  ${l.name}`;
      doc.text(label.length > 38 ? label.slice(0, 37) + "…" : label, margin + 6, y + 8);
      drawNums(l, false);
      y += 11;
    }
  }
  ensure(15);
  doc.setDrawColor(11, 74, 125); doc.setLineWidth(1); doc.line(margin, y, pageW - margin, y);
  y += 3;
  doc.setFont("helvetica", "bold"); doc.setFontSize(7);
  doc.text("Portfolio Total", margin + 3, y + 9);
  drawNums(i.total, true);

  doc.save(`${i.fileBase}.pdf`);
}

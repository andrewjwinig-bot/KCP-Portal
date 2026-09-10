import * as XLSX from "xlsx";
import type { RentRollSnapshotSummary } from "./snapshot";
import { TREND_GROUPS } from "./snapshot";

/**
 * Build a two-sheet workbook with month-over-month trend:
 *  Sheet 1 — Sq Ft Occupied: integers, comma separators
 *  Sheet 2 — % Occupied: 2-decimal percentages
 * Rows = months (oldest first). Columns = groups (Total, JV III LLC, NI LLC, Shopping Centers, Korman Homes).
 */
export function buildRentRollTrendXlsx(snapshots: RentRollSnapshotSummary[]): Buffer {
  const sorted = snapshots.slice().sort((a, b) => a.month.localeCompare(b.month));
  const headers = ["Month", ...TREND_GROUPS.map((g) => g.label)];

  // ── Sheet 1: Sq Ft Occupied ──
  const occupiedRows = sorted.map((s) => [s.month, ...TREND_GROUPS.map((g) => s.totals[g.key]?.occupied ?? 0)]);
  const occupiedAoa = [headers, ...occupiedRows];
  const occupiedWs  = XLSX.utils.aoa_to_sheet(occupiedAoa);
  applyNumberFormat(occupiedWs, occupiedAoa.length, headers.length, 1, "#,##0");
  occupiedWs["!cols"] = [{ wch: 12 }, ...TREND_GROUPS.map(() => ({ wch: 18 }))];

  // ── Sheet 2: % Occupied ──
  const pctRows = sorted.map((s) => [s.month, ...TREND_GROUPS.map((g) => round2(s.totals[g.key]?.pct ?? 0))]);
  const pctAoa = [headers, ...pctRows];
  const pctWs  = XLSX.utils.aoa_to_sheet(pctAoa);
  applyNumberFormat(pctWs, pctAoa.length, headers.length, 1, "0.00\"%\"");
  pctWs["!cols"] = [{ wch: 12 }, ...TREND_GROUPS.map(() => ({ wch: 18 }))];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, occupiedWs, "Sq Ft Occupied");
  XLSX.utils.book_append_sheet(wb, pctWs, "% Occupied");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

function applyNumberFormat(ws: XLSX.WorkSheet, rows: number, cols: number, startCol: number, fmt: string) {
  for (let r = 1; r < rows; r++) {
    for (let c = startCol; c < cols; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr];
      if (cell && typeof cell.v === "number") {
        cell.t = "n";
        cell.z = fmt;
      }
    }
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

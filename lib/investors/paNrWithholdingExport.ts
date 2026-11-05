// The calculator as a workbook — the owner's own layout, on the shared theme,
// with every derived cell a live formula off the distribution cell and the
// keyed payments, so changing the distribution in Excel flows through.

import ExcelJS from "exceljs";
import { COLOR, FMT, FONT_NAME, PRINT_WIDE, footNote, freezeAbove, headerBand, liveFormula, liveSum, newWorkbook, titleBlock, totalEmphasis } from "../excel/theme";
import type { WithholdingResult } from "./paNrWithholding";

export async function buildWithholdingXlsx(o: { entity: string; year: number; result: WithholdingResult }): Promise<Buffer> {
  const { result, year } = o;
  const wb = newWorkbook();
  const ws: ExcelJS.Worksheet = wb.addWorksheet("PA NR Withholding", { pageSetup: PRINT_WIDE });
  const W = 10;
  ws.columns = [{ width: 26 }, { width: 46 }, { width: 14 }, { width: 10 }, { width: 10 }, { width: 14 }, { width: 14 }, { width: 15 }, { width: 14 }, { width: 15 }];
  let r = titleBlock(ws, { entity: o.entity, document: "PA Nonresident Withholding", asOf: `${year} Distribution`, width: W });
  r++;
  const distRow = r;
  ws.getCell(r, 1).value = "Total distribution";
  ws.getCell(r, 1).font = { name: FONT_NAME, bold: true };
  const dc = ws.getCell(r, 3);
  dc.value = result.distribution;
  dc.numFmt = FMT.moneyCents;
  dc.font = { name: FONT_NAME, bold: true, color: { argb: "FF1D4ED8" } };
  dc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
  ws.getCell(r, 4).value = "← change here";
  ws.getCell(r, 4).font = { name: FONT_NAME, italic: true, size: 9, color: { argb: COLOR.muted } };
  r += 2;
  headerBand(ws, r, ["Partner", "Held as", "State", "%", "PA NR %", `${year - 1} PA NR payment`, `${year} NR estimate`, "Gross distribution", "Withholding", "Net cash"]);
  ws.getCell(r, 2).alignment = { horizontal: "left", vertical: "middle", wrapText: true };
  ws.getCell(r, 3).alignment = { horizontal: "left", vertical: "middle" };
  freezeAbove(ws, r + 1);
  const first = r + 1, last = r + result.rows.length, totalRow = last + 1;
  const D = `$C$${distRow}`;
  result.rows.forEach((x, i) => {
    const row = first + i;
    ws.getCell(row, 1).value = x.name;
    ws.getCell(row, 2).value = x.heldAs ?? "";
    ws.getCell(row, 3).value = x.state ?? "";
    ws.getCell(row, 4).value = x.pct;
    ws.getCell(row, 5).value = liveFormula(`IF($F$${totalRow}=0,0,F${row}/$F$${totalRow})`, x.nrPct, result.totals.paid ? x.paid / result.totals.paid : 0, 1e-9);
    ws.getCell(row, 6).value = x.paid;
    ws.getCell(row, 7).value = x.estimate;
    ws.getCell(row, 8).value = liveFormula(`D${row}*${D}`, x.gross, x.pct * result.distribution, 0.01);
    ws.getCell(row, 9).value = liveFormula(`F${row}+G${row}`, x.withholding, x.paid + x.estimate, 0.01);
    ws.getCell(row, 10).value = liveFormula(`H${row}-I${row}`, x.net, x.gross - x.withholding, 0.01);
    for (let c = 1; c <= W; c++) {
      ws.getCell(row, c).font = { name: FONT_NAME, size: 10 };
      if (i % 2) ws.getCell(row, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.zebra } };
    }
    ws.getCell(row, 4).numFmt = "0.0000%";
    ws.getCell(row, 5).numFmt = "0.00%";
    for (const c of [6, 7, 8, 9, 10]) ws.getCell(row, c).numFmt = FMT.moneyCents;
  });
  const col = (c: string) => `${c}${first}:${c}${last}`;
  const t = result.totals;
  ws.getCell(totalRow, 1).value = "Total";
  ws.getCell(totalRow, 4).value = liveSum(col("D"), t.pct, result.rows.map((x) => x.pct), 1e-6);
  ws.getCell(totalRow, 6).value = liveSum(col("F"), t.paid, result.rows.map((x) => x.paid), 0.01);
  ws.getCell(totalRow, 7).value = liveSum(col("G"), t.estimate, result.rows.map((x) => x.estimate), 0.01);
  ws.getCell(totalRow, 8).value = liveSum(col("H"), t.gross, result.rows.map((x) => x.gross), 0.05);
  ws.getCell(totalRow, 9).value = liveSum(col("I"), t.withholding, result.rows.map((x) => x.withholding), 0.05);
  ws.getCell(totalRow, 10).value = liveSum(col("J"), t.net, result.rows.map((x) => x.net), 0.05);
  for (let c = 1; c <= W; c++) totalEmphasis(ws.getCell(totalRow, c), { grand: true });
  ws.getCell(totalRow, 4).numFmt = "0.0000%";
  for (const c of [6, 7, 8, 9, 10]) ws.getCell(totalRow, c).numFmt = FMT.moneyCents;
  footNote(ws, totalRow + 2,
    `Gross distribution = ownership % × the total distribution. Withholding = the ${year - 1} PA nonresident tax payment plus the ${year} estimate the partnership paid on the partner's behalf; Net cash = gross − withholding. Ownership % from the partner roster. Internal worksheet — not a tax filing.`, W);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

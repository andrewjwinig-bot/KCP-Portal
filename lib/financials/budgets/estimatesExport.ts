// The CAM estimates table as a workbook — what goes to the property manager
// writing the January estimate letters, and what is open on the desk when a
// tenant calls about theirs. Built in the browser on the shared theme; every
// derived figure is a live formula (recoveries = CAM + INS + RET, the change,
// the whole bill, every total), so a figure keyed over in Excel flows through.

import type ExcelJS from "exceljs";
import { newWorkbook, titleBlock, headerBand, totalEmphasis, footNote, freezeAbove, repeatHeader, liveSum, COLOR, FMT, FONT_NAME, PRINT_WIDE } from "@/lib/excel/theme";
import type { EstimateRow } from "./estimatesByTenant";

const HEAD = [
  "Suite", "Tenant", "SF",
  "Today CAM", "Today INS", "Today RET", "Today recoveries",
  "Budget CAM", "Budget INS", "Budget RET", "Budget recoveries",
  "Change / mo", "Change %",
  "Today rent", "Today total bill", "Budget rent", "Budget total bill", "Bill change / mo",
];

export async function buildEstimatesXlsx(o: { propertyName: string; propertyCode: string; year: number; rows: EstimateRow[] }): Promise<ArrayBuffer> {
  const wb = newWorkbook();
  const ws = wb.addWorksheet("CAM estimates", { pageSetup: PRINT_WIDE });
  const width = HEAD.length;
  let r = titleBlock(ws, {
    entity: o.propertyName, document: `${o.year} CAM / INS / RET estimates by tenant`,
    subtitle: o.propertyCode, asOf: `Today's billing vs the ${o.year} budget, per month`, width,
  });
  headerBand(ws, r, HEAD);
  const headRow = r;
  repeatHeader(ws, headRow);
  freezeAbove(ws, headRow, 2);
  r++;
  const first = r;
  const money = (c: ExcelJS.Cell) => { c.numFmt = FMT.money; c.font = { name: FONT_NAME, size: 10 }; };
  for (const e of o.rows) {
    const n = e.now;
    const row = ws.getRow(r);
    row.getCell(1).value = e.unitRef;
    row.getCell(2).value = e.tenant || "(unnamed)";
    row.getCell(3).value = e.sqft || null; row.getCell(3).numFmt = FMT.sqft;
    const put = (col: number, v: number | null) => { const c = row.getCell(col); c.value = v; money(c); };
    put(4, n?.cam ?? 0); put(5, n?.ins ?? 0); put(6, n?.ret ?? 0);
    row.getCell(7).value = { formula: `SUM(D${r}:F${r})`, result: n?.recoveries ?? 0 }; money(row.getCell(7));
    put(8, e.next.cam); put(9, e.next.ins); put(10, e.next.ret);
    row.getCell(11).value = { formula: `SUM(H${r}:J${r})`, result: e.next.recoveries }; money(row.getCell(11));
    row.getCell(12).value = { formula: `K${r}-G${r}`, result: e.change }; money(row.getCell(12));
    row.getCell(13).value = { formula: `IF(G${r}=0,"",L${r}/G${r})`, result: e.changePct == null ? "" : e.changePct / 100 };
    row.getCell(13).numFmt = FMT.percent;
    put(14, n?.rent ?? 0);
    row.getCell(15).value = { formula: `N${r}+G${r}`, result: n?.total ?? 0 }; money(row.getCell(15));
    put(16, e.next.rent);
    row.getCell(17).value = { formula: `P${r}+K${r}`, result: e.next.total }; money(row.getCell(17));
    row.getCell(18).value = { formula: `Q${r}-O${r}`, result: e.next.total - (n?.total ?? 0) }; money(row.getCell(18));
    if (e.jump) for (const c of [12, 13]) row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.warnTint } };
    r++;
  }
  const last = r - 1;
  const tot = ws.getRow(r);
  tot.getCell(2).value = "Total";
  const col = (i: number) => String.fromCharCode(64 + i);
  const sums: Record<number, number[]> = {};
  for (const i of [4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18]) {
    const vals = o.rows.map((e) => {
      const n = e.now;
      switch (i) {
        case 4: return n?.cam ?? 0; case 5: return n?.ins ?? 0; case 6: return n?.ret ?? 0; case 7: return n?.recoveries ?? 0;
        case 8: return e.next.cam; case 9: return e.next.ins; case 10: return e.next.ret; case 11: return e.next.recoveries;
        case 12: return e.change; case 14: return n?.rent ?? 0; case 15: return n?.total ?? 0;
        case 16: return e.next.rent; case 17: return e.next.total; default: return e.next.total - (n?.total ?? 0);
      }
    });
    sums[i] = vals;
    const c = tot.getCell(i);
    c.value = o.rows.length ? liveSum(`${col(i)}${first}:${col(i)}${last}`, vals.reduce((a, b) => a + b, 0), vals) : 0;
    c.numFmt = FMT.money;
    totalEmphasis(c, { grand: true });
  }
  const tr = r;
  const nowRec = sums[7].reduce((a, b) => a + b, 0), chg = sums[12].reduce((a, b) => a + b, 0);
  tot.getCell(13).value = { formula: `IF(G${tr}=0,"",L${tr}/G${tr})`, result: nowRec ? chg / nowRec : "" };
  tot.getCell(13).numFmt = FMT.percent;
  totalEmphasis(tot.getCell(2), { grand: true });
  r += 2;
  footNote(ws, r, `Today = the monthly CAM (Operating Expense), INS (Other Expense) and RET billed per the current rent roll. Budget = each category's ${o.year} budgeted recovery averaged over the months it is billed — the monthly estimate. Budget rent is the first month of ${o.year} rent. Highlighted: an increase of 15% or more AND $100+/month. Prepared from the Budget Draft; unaudited.`, width);
  ws.columns = [{ width: 12 }, { width: 30 }, { width: 9 }, ...Array.from({ length: width - 3 }, () => ({ width: 13 }))];
  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

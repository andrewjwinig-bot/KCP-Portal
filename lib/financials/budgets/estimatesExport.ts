// The CAM estimates review as a workbook — today's monthly estimates, the last
// reconciliation's actual, the budget, the change and why, per tenant. Built in
// the browser on the shared theme; every derived figure is a live formula so a
// figure keyed over in Excel flows through. (The Skyline IMPORT is a separate,
// bare CSV — `skylineEstimateRows` — because a machine import is not a document.)

import type ExcelJS from "exceljs";
import { newWorkbook, titleBlock, headerBand, totalEmphasis, footNote, freezeAbove, repeatHeader, liveSum, COLOR, FMT, FONT_NAME, PRINT_WIDE } from "@/lib/excel/theme";
import type { EstimateRow } from "./estimatesByTenant";

export async function buildEstimatesXlsx(o: { propertyName: string; propertyCode: string; year: number; reconYear: number | null; rows: EstimateRow[] }): Promise<ArrayBuffer> {
  const ry = o.reconYear ?? o.year - 2;
  const HEAD = [
    "Suite", "Tenant", "SF",
    "Today CAM", "Today INS", "Today RET", "Today total",
    `${ry} actual / mo`,
    `${o.year} CAM`, `${o.year} INS`, `${o.year} RET`, `${o.year} total`,
    "Change / mo", "Change %", "Why",
  ];
  const wb = newWorkbook();
  const ws = wb.addWorksheet("CAM estimates", { pageSetup: PRINT_WIDE });
  const width = HEAD.length;
  let r = titleBlock(ws, {
    entity: o.propertyName, document: `${o.year} CAM / INS / RET estimates by tenant`,
    subtitle: o.propertyCode, asOf: `Monthly — billed today, the ${ry} reconciled actual, and the ${o.year} budget`, width,
  });
  headerBand(ws, r, HEAD);
  repeatHeader(ws, r);
  freezeAbove(ws, r, 2);
  r++;
  const first = r;
  const moneyCell = (c: ExcelJS.Cell) => { c.numFmt = FMT.money; c.font = { name: FONT_NAME, size: 10 }; };
  for (const e of o.rows) {
    const n = e.now;
    const row = ws.getRow(r);
    row.getCell(1).value = e.unitRef;
    row.getCell(2).value = e.tenant || "(unnamed)";
    row.getCell(3).value = e.sqft || null; row.getCell(3).numFmt = FMT.sqft;
    const put = (col: number, v: number | null) => { const c = row.getCell(col); c.value = v; moneyCell(c); };
    put(4, n?.cam ?? 0); put(5, n?.ins ?? 0); put(6, n?.ret ?? 0);
    row.getCell(7).value = { formula: `SUM(D${r}:F${r})`, result: n?.total ?? 0 }; moneyCell(row.getCell(7));
    put(8, e.recon?.total ?? null);
    put(9, e.next.cam); put(10, e.next.ins); put(11, e.next.ret);
    row.getCell(12).value = { formula: `SUM(I${r}:K${r})`, result: e.next.total }; moneyCell(row.getCell(12));
    row.getCell(13).value = { formula: `L${r}-G${r}`, result: e.change }; moneyCell(row.getCell(13));
    row.getCell(14).value = { formula: `IF(G${r}=0,"",M${r}/G${r})`, result: e.changePct == null ? "" : e.changePct / 100 };
    row.getCell(14).numFmt = FMT.percent;
    row.getCell(15).value = e.reason;
    row.getCell(15).font = { name: FONT_NAME, size: 9, color: { argb: COLOR.muted } };
    if (e.jump) for (const c of [13, 14]) row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.warnTint } };
    if (e.overridden) for (const c of [9, 10, 11, 12]) row.getCell(c).font = { name: FONT_NAME, size: 10, bold: true, color: { argb: COLOR.brand } };
    r++;
  }
  const last = r - 1;
  const tot = ws.getRow(r);
  tot.getCell(2).value = "Total";
  totalEmphasis(tot.getCell(2), { grand: true });
  const col = (i: number) => String.fromCharCode(64 + i);
  const pick: Record<number, (e: EstimateRow) => number> = {
    4: (e) => e.now?.cam ?? 0, 5: (e) => e.now?.ins ?? 0, 6: (e) => e.now?.ret ?? 0, 7: (e) => e.now?.total ?? 0,
    8: (e) => e.recon?.total ?? 0,
    9: (e) => e.next.cam, 10: (e) => e.next.ins, 11: (e) => e.next.ret, 12: (e) => e.next.total, 13: (e) => e.change,
  };
  for (const [k, f] of Object.entries(pick)) {
    const i = Number(k);
    const vals = o.rows.map(f);
    const c = tot.getCell(i);
    c.value = o.rows.length ? liveSum(`${col(i)}${first}:${col(i)}${last}`, vals.reduce((a, b) => a + b, 0), vals) : 0;
    c.numFmt = FMT.money;
    totalEmphasis(c, { grand: true });
  }
  const nowT = o.rows.reduce((a, e) => a + (e.now?.total ?? 0), 0), chg = o.rows.reduce((a, e) => a + e.change, 0);
  tot.getCell(14).value = { formula: `IF(G${r}=0,"",M${r}/G${r})`, result: nowT ? chg / nowT : "" };
  tot.getCell(14).numFmt = FMT.percent;
  r += 2;
  footNote(ws, r, `Today = the monthly Operating Expense (CAM), Other Expense (INS) and Real Estate Tax each tenant is billed on the current rent roll. ${ry} actual = the tenant's reconciled ${ry} amount due ÷ 12. ${o.year} = the budget's recovery for each category averaged over the months billed, or the figure set by hand (bold blue). Why splits the change into the catch-up to the ${ry} actual and the ${o.year} budget's pool change. Highlighted: up 15%+ and $100+/month. Prepared from the Budget Draft; unaudited.`, width);
  ws.columns = [{ width: 12 }, { width: 28 }, { width: 9 }, ...Array.from({ length: 11 }, () => ({ width: 12 })), { width: 60 }];
  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

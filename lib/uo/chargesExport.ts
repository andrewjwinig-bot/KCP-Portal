// U&O BY TENANT — the workbook that replaces the team's "Retail U&O No
// Exemptions" sheet: every suite's monthly U&O for the month, what the
// statement bills them today, and the change to key in Skyline (January's
// reassessment moves every charge). A document a person reads — themed, with
// live totals.

import "server-only";
import { COLOR, FMT, FONT_NAME, footNote, freezeAbove, headerBand, liveSum, newWorkbook, sectionBar, titleBlock, totalEmphasis } from "@/lib/excel/theme";
import type { UoMonthView } from "./load";

const STATUS: Record<string, string> = { taxable: "Taxable", vacant: "Vacant", exempt: "Exempt", delinquent: "Delinquent", common: "Common area" };

export async function chargesWorkbook(view: UoMonthView, monthLabel: string): Promise<Buffer> {
  const wb = newWorkbook();
  const ws = wb.addWorksheet("U&O by Tenant");
  const HEAD = ["Suite", "Tenant", "SF", "Monthly U&O", "Billed today", "Change", "Status"];
  ws.columns = [{ width: 14 }, { width: 34 }, { width: 10 }, { width: 14 }, { width: 14 }, { width: 12 }, { width: 22 }];
  let r = titleBlock(ws, { entity: "Korman Commercial Properties", document: "Philadelphia U&O by Tenant", asOf: monthLabel, width: HEAD.length });
  headerBand(ws, r, HEAD);
  freezeAbove(ws, r);
  r++;
  for (const p of view.properties) {
    const rows = p.returns.flatMap((x) => x.rows);
    if (!rows.length) continue;
    sectionBar(ws, r++, `${p.code} · ${p.name}`, HEAD.length, { strong: false });
    const first = r;
    const billed = new Map(p.billed.map((b) => [b.unitRef, b.billed]));
    for (const row of rows) {
      const b = row.unitRef ? billed.get(row.unitRef) ?? null : null;
      const owes = row.status === "taxable" || row.status === "delinquent";
      const vals = [row.unitRef ?? "", row.tenant, row.sqft, row.share, owes ? b : null, owes && b != null ? row.share - b : null, row.reason ? `${STATUS[row.status]} — ${row.reason}` : STATUS[row.status]];
      vals.forEach((v, i) => {
        const c = ws.getCell(r, i + 1);
        c.value = v as never;
        c.font = { name: FONT_NAME, size: 10, color: { argb: row.status === "taxable" || row.status === "delinquent" ? COLOR.text : COLOR.muted } };
        if (i === 2) c.numFmt = FMT.sqft;
        if (i >= 3 && i <= 5) c.numFmt = FMT.money;
      });
      if (owes && b != null) ws.getCell(r, 6).value = { formula: `D${r}-E${r}`, result: row.share - b };
      r++;
    }
    const last = r - 1;
    ws.getCell(r, 2).value = "Total";
    ws.getCell(r, 3).value = liveSum(`C${first}:C${last}`, rows.reduce((s, x) => s + x.sqft, 0), rows.map((x) => x.sqft));
    ws.getCell(r, 4).value = liveSum(`D${first}:D${last}`, rows.reduce((s, x) => s + x.share, 0), rows.map((x) => x.share));
    ws.getCell(r, 3).numFmt = FMT.sqft;
    ws.getCell(r, 4).numFmt = FMT.money;
    for (let c = 2; c <= 4; c++) totalEmphasis(ws.getCell(r, c));
    r += 2;
  }
  footNote(ws, r, "Each suite's monthly U&O is the parcel's maximum tax (the City's assessed value × 1.21% ÷ 12) × its square feet ÷ every square foot on the City's allocation, vacant space and common area included. Billed today is the U&O line on the tenant's newest laser statement; blank where it shows none (paid, or not billed).", HEAD.length);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

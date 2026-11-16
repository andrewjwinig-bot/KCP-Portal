// The reclass worksheet: the entry by property (debit 6220-8501, credit
// 6220-8502) and every GL line behind it. Shared theme, live totals.

import { FMT, FONT_NAME, footNote, freezeAbove, headerBand, liveSum, newWorkbook, PRINT_WIDE, titleBlock, totalEmphasis } from "@/lib/excel/theme";
import { FROM_ACCOUNT, TO_ACCOUNT, reclassByProperty, type ReclassLine } from "./ccReclass";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export async function buildReclassXlsx(year: number, lines: ReclassLine[], names: Record<string, string>): Promise<Buffer> {
  const wb = newWorkbook();
  const byProp = reclassByProperty(lines);

  // ── Sheet 1: the entry ──
  const ws = wb.addWorksheet("Reclass Entry", { pageSetup: PRINT_WIDE });
  ws.columns = [{ width: 10 }, { width: 38 }, { width: 10 }, { width: 14 }, { width: 18 }, { width: 18 }];
  let r = titleBlock(ws, {
    entity: "Korman Commercial Properties",
    document: "Credit Card Building Maintenance Reclass",
    asOf: `${year}`,
    meta: [`From ${FROM_ACCOUNT} (recoverable) to ${TO_ACCOUNT} (non-recoverable)`, `Prepared ${new Date().toLocaleDateString("en-US")}`],
    width: 6,
  });
  r++;
  headerBand(ws, r, ["Property", "Name", "Lines", "Account", `Debit ${TO_ACCOUNT}`, `Credit ${FROM_ACCOUNT}`]);
  const first = ++r;
  for (const p of byProp) {
    const row = ws.getRow(r++);
    row.values = [p.key, names[p.key] ?? "", p.count, "6220", p.amount, p.amount];
    row.font = { name: FONT_NAME, size: 10 };
    row.getCell(5).numFmt = FMT.moneyCents;
    row.getCell(6).numFmt = FMT.moneyCents;
  }
  const last = r - 1;
  const total = byProp.reduce((a, p) => a + p.amount, 0);
  const tr = ws.getRow(r);
  tr.getCell(1).value = "Total";
  tr.getCell(3).value = byProp.length ? liveSum(`C${first}:C${last}`, lines.length, byProp.map((p) => p.count)) : 0;
  tr.getCell(5).value = byProp.length ? liveSum(`E${first}:E${last}`, total, byProp.map((p) => p.amount)) : 0;
  tr.getCell(6).value = byProp.length ? liveSum(`F${first}:F${last}`, total, byProp.map((p) => p.amount)) : 0;
  for (const c of [1, 3, 5, 6]) totalEmphasis(tr.getCell(c), { grand: true });
  tr.getCell(5).numFmt = FMT.moneyCents;
  tr.getCell(6).numFmt = FMT.moneyCents;
  r += 2;
  footNote(ws, r, `Credit card Building Maint. charges were coded to ${FROM_ACCOUNT}, the Reimbursable Expenses line, so they sat in the CAM pool billed to tenants. From 11/2026 they code to ${TO_ACCOUNT}. A line is a card charge when its vendor is LIKM1 or it carries a CC invoice number. Check each property's lines on the Charges sheet before posting.`, 6, 54);
  freezeAbove(ws, first);

  // ── Sheet 2: every line ──
  const ds = wb.addWorksheet("Charges", { pageSetup: PRINT_WIDE });
  ds.columns = [{ width: 10 }, { width: 30 }, { width: 8 }, { width: 12 }, { width: 22 }, { width: 44 }, { width: 16 }, { width: 14 }, { width: 26 }];
  let d = titleBlock(ds, { entity: "Korman Commercial Properties", document: `Card Charges on ${FROM_ACCOUNT}`, asOf: `${year}`, width: 9 });
  d++;
  headerBand(ds, d, ["Property", "Name", "Month", "Date", "Vendor", "Description", "Ref", "Amount", "Why"]);
  const dFirst = ++d;
  for (const l of lines) {
    const row = ds.getRow(d++);
    row.values = [l.key, names[l.key] ?? "", MONTHS[l.month - 1] ?? "", l.date ?? "", l.vendor, l.description, l.ref, l.amount, l.why];
    row.font = { name: FONT_NAME, size: 10 };
    row.getCell(8).numFmt = FMT.moneyCents;
  }
  const dLast = d - 1;
  const dt = ds.getRow(d);
  dt.getCell(1).value = "Total";
  dt.getCell(8).value = lines.length ? liveSum(`H${dFirst}:H${dLast}`, total, lines.map((l) => l.amount)) : 0;
  totalEmphasis(dt.getCell(1), { grand: true });
  totalEmphasis(dt.getCell(8), { grand: true });
  dt.getCell(8).numFmt = FMT.moneyCents;
  freezeAbove(ds, dFirst);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// The fill-in workbook for tenants with no email on file, and its import back.
// A person fills the blue Email column and the file comes back through
// "Import Filled Sheet" on Tenant Emails to Add. The import finds its header
// row by name (Unit Ref + Email), so the letterhead above it does not matter
// and columns may be reordered.

import type ExcelJS from "exceljs";
import { COLOR, FONT_NAME, freezeAbove, headerBand, newWorkbook, titleBlock } from "@/lib/excel/theme";

export type FillRow = {
  unitRef: string; propertyCode: string; propertyName: string; suite: string; tenantName: string;
  skylineContact: string | null; skylinePhone: string | null;
};

const HEAD = ["Unit Ref", "Property", "Suite", "Tenant", "Skyline Contact", "Skyline Phone", "Email (fill in)", "Contact Name (optional)", "Notes"];

export async function buildFillSheet(rows: FillRow[], o: { who: string; asOf: string }): Promise<Uint8Array> {
  const wb = newWorkbook();
  const ws = wb.addWorksheet("Tenant Emails");
  ws.columns = [{ width: 13 }, { width: 30 }, { width: 9 }, { width: 34 }, { width: 22 }, { width: 16 }, { width: 34 }, { width: 24 }, { width: 28 }];
  let r = titleBlock(ws, {
    entity: "Korman Commercial Properties", document: "Tenant Emails to Add", subtitle: o.who,
    asOf: `Tenants with no email on file as of ${o.asOf}`,
    meta: ["Type each tenant's billing email in the blue column (several? separate with ;). Save, and import it on the portal's Tenant Emails to Add page."],
    width: HEAD.length,
  });
  r++;
  headerBand(ws, r, HEAD, { align: "left" });
  freezeAbove(ws, r + 1);
  const headRow = r;
  for (const x of rows) {
    r++;
    const vals = [x.unitRef, x.propertyName, x.suite, x.tenantName, x.skylineContact ?? "", x.skylinePhone ?? "", "", "", ""];
    vals.forEach((v, i) => {
      const c = ws.getCell(r, i + 1);
      c.value = v;
      c.font = { name: FONT_NAME, size: 10 };
      c.border = { bottom: { style: "hair", color: { argb: COLOR.border } } };
      if (i >= 6 && i <= 7) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.input } };
    });
  }
  ws.autoFilter = { from: { row: headRow, column: 1 }, to: { row: Math.max(r, headRow), column: HEAD.length } };
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

export type FilledEntry = { unitRef: string; email: string; name: string | null; row: number };

const cellText = (v: ExcelJS.CellValue): string => {
  if (v == null) return "";
  if (typeof v === "object") {
    const o = v as { text?: unknown; hyperlink?: unknown; result?: unknown; richText?: { text: string }[] };
    if (o.richText) return o.richText.map((t) => t.text).join("");
    if (typeof o.text === "string") return o.text;
    if (typeof o.hyperlink === "string") return o.hyperlink;
    if (o.result != null) return String(o.result);
  }
  return String(v);
};

/** Every row with something in the Email column. */
export async function readFillSheet(buf: ArrayBuffer | Buffer): Promise<FilledEntry[]> {
  const wb = newWorkbook();
  await wb.xlsx.load(buf as ArrayBuffer);
  const out: FilledEntry[] = [];
  for (const ws of wb.worksheets) {
    let head = 0, unitCol = 0, emailCol = 0, nameCol = 0;
    ws.eachRow((row, n) => {
      if (head) return;
      row.eachCell((cell, c) => {
        const t = cellText(cell.value).trim().toLowerCase();
        if (t === "unit ref") unitCol = c;
        if (t.startsWith("email")) emailCol = c;
        if (t.startsWith("contact name")) nameCol = c;
      });
      if (unitCol && emailCol) head = n; else { unitCol = 0; emailCol = 0; nameCol = 0; }
    });
    if (!head) continue;
    ws.eachRow((row, n) => {
      if (n <= head) return;
      const unitRef = cellText(row.getCell(unitCol).value).trim();
      const email = cellText(row.getCell(emailCol).value).trim();
      if (!unitRef || !email) return;
      out.push({ unitRef, email, name: nameCol ? cellText(row.getCell(nameCol).value).trim() || null : null, row: n });
    });
  }
  return out;
}

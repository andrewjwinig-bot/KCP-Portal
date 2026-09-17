// The month's review checklist, as one printable workbook.
//
// Every property's open items in ONE list you can print, carry around, and tick
// off — which is the whole point. The Review page's old Excel export was a flat
// grid of flagged lines that dropped the not-posted issues entirely, so the
// thing most likely to be a real error was the thing missing from the file.
//
// TWO KINDS OF ITEM, and the order between them is deliberate:
//   MISSING  — a line that should carry a figure and reads ~$0 (a budgeted
//              expense, a scheduled debt payment). That is an error of
//              omission: the statement is not finished. These lead.
//   REVIEW   — a line that posted something that looks off. Worth a look, but
//              the statement is at least complete.
// Within each, largest dollars first, because that is the order you would work
// them in.

import ExcelJS from "exceljs";
import {
  newWorkbook, titleBlock, headerBand, footNote, freezeAbove, repeatHeader,
  sectionBar, COLOR, FMT, FONT_NAME, PRINT_WIDE,
} from "@/lib/excel/theme";
import type { ReviewResult, ReviewProperty } from "./review";

type Item = {
  kind: "MISSING" | "REVIEW";
  month: string;
  section: string;
  line: string;
  /** What to actually check — the auto-explain note where there is one. */
  whatToCheck: string;
  actual: number | null;
  budget: number | null;
  variance: number | null;
  /** Sort weight within a kind: how much money is at stake. */
  weight: number;
};

const HEAD = ["✓", "Type", "Month", "Section", "Line", "What to check", "Actual", "Budget", "Variance"];
const WIDTHS = [4, 10, 11, 26, 30, 62, 13, 13, 13];

function itemsFor(p: ReviewProperty): Item[] {
  const items: Item[] = [];

  for (const i of p.issues) {
    items.push({
      kind: "MISSING",
      month: i.monthLabel,
      section: i.section,
      line: i.line,
      whatToCheck: i.type === "missing-debt"
        ? `The debt schedule has a payment due this month and nothing is posted. Post it or confirm the loan is paid off.`
        : `Budgeted but nothing posted. Post the charge, or confirm it doesn't apply this year.`,
      actual: 0,
      budget: i.expected || null,
      variance: i.expected ? -i.expected : null,
      weight: Math.abs(i.expected),
    });
  }

  for (const l of p.lines) {
    for (const mo of l.months) {
      items.push({
        kind: "REVIEW",
        month: mo.monthLabel,
        section: l.section,
        line: l.line,
        // The note is the useful half. Without one, say why it surfaced — never
        // leave the cell blank, or the row is a line item with no question.
        whatToCheck: mo.note?.trim() || mo.flags.join("; ") || "Looks off this month.",
        actual: mo.actual,
        budget: mo.budget,
        variance: mo.variance,
        weight: Math.abs(mo.variance ?? mo.actual ?? 0),
      });
    }
  }

  const rank = (k: Item["kind"]) => (k === "MISSING" ? 0 : 1);
  items.sort((a, b) => rank(a.kind) - rank(b.kind) || b.weight - a.weight);
  return items;
}

export async function buildReviewChecklistXlsx(data: ReviewResult): Promise<Buffer> {
  const wb = newWorkbook();
  const ws = wb.addWorksheet("Checklist", { pageSetup: { ...PRINT_WIDE } });
  ws.columns = WIDTHS.map((width) => ({ width }));

  const withItems = data.properties
    .map((p) => ({ p, items: itemsFor(p) }))
    .filter((x) => x.items.length > 0);

  const total = withItems.reduce((s, x) => s + x.items.length, 0);
  const missing = withItems.reduce((s, x) => s + x.items.filter((i) => i.kind === "MISSING").length, 0);

  const headerRow = titleBlock(ws, {
    entity: "Korman Commercial Properties",
    document: `Operating Statements — items to resolve · ${data.year}`,
    meta: [
      `${total} item${total === 1 ? "" : "s"} across ${withItems.length} propert${withItems.length === 1 ? "y" : "ies"}`,
      missing ? `${missing} missing / not posted` : null,
      `Prepared ${new Date(data.generatedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}`,
    ],
    width: HEAD.length,
  });
  headerBand(ws, headerRow, HEAD);

  let r = headerRow + 1;
  for (const { p, items } of withItems) {
    const miss = items.filter((i) => i.kind === "MISSING").length;
    sectionBar(
      ws, r,
      `${p.propertyCode} — ${p.propertyName}   ·   ${items.length} item${items.length === 1 ? "" : "s"}` +
      (miss ? `, ${miss} missing` : "") +
      (p.coverage?.behind ? `   ·   GL only through ${p.latestMonthLabel}` : ""),
      HEAD.length,
    );
    r++;

    for (const it of items) {
      const row = ws.getRow(r);
      const put = (c: number, v: ExcelJS.CellValue, fmt?: string, font?: Partial<ExcelJS.Font>) => {
        const cell = row.getCell(c);
        cell.value = v;
        cell.font = { name: FONT_NAME, size: 10, color: { argb: COLOR.text }, ...font };
        if (fmt) { cell.numFmt = fmt; cell.alignment = { horizontal: "right" }; }
        return cell;
      };

      // A real box to tick with a pen. Bordered on every side so it reads as a
      // box on paper rather than as an empty cell.
      const box = row.getCell(1);
      box.value = null;
      box.border = {
        top: { style: "thin", color: { argb: COLOR.border } },
        left: { style: "thin", color: { argb: COLOR.border } },
        bottom: { style: "thin", color: { argb: COLOR.border } },
        right: { style: "thin", color: { argb: COLOR.border } },
      };

      const isMissing = it.kind === "MISSING";
      put(2, it.kind, undefined, { bold: true, color: { argb: isMissing ? COLOR.negative : COLOR.warn } });
      put(3, it.month);
      put(4, it.section);
      put(5, it.line, undefined, { bold: true });
      const what = put(6, it.whatToCheck);
      what.alignment = { wrapText: true, vertical: "top" };
      put(7, it.actual, FMT.money);
      put(8, it.budget, FMT.money);
      put(9, it.variance, FMT.money);

      // A missing posting is an error, not a swing — tint the row so it stands
      // out on a printed page that is otherwise uniform.
      if (isMissing) for (let c = 2; c <= HEAD.length; c++) {
        row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.warnTint } };
      }
      row.alignment = { vertical: "top" };
      r++;
    }
    r++; // a blank line between properties
  }

  if (total === 0) {
    const cell = ws.getCell(headerRow + 1, 1);
    cell.value = "Nothing to resolve — every posted line reconciles and nothing budgeted is missing.";
    cell.font = { name: FONT_NAME, size: 11, italic: true, color: { argb: COLOR.positive } };
    ws.mergeCells(headerRow + 1, 1, headerRow + 1, HEAD.length);
    r = headerRow + 3;
  }

  freezeAbove(ws, headerRow);
  repeatHeader(ws, headerRow);
  footNote(
    ws, r + 1,
    "MISSING = a line that should carry a figure and reads $0 — the statement isn't finished until it's posted or ruled out. " +
    "REVIEW = a line that posted something that looks off. Dismissing an item on the statement or in Flags to Investigate drops it from next month's list. " +
    "Only variances of $500 or more are listed; anything smaller isn't worth the time.",
    HEAD.length, 32,
  );

  return Buffer.from(await wb.xlsx.writeBuffer());
}

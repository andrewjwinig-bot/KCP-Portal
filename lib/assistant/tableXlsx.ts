import {
  newWorkbook, titleBlock, headerBand, footNote, freezeAbove, repeatHeader,
  liveSum, liveFormula, totalEmphasis, COLOR, FMT, FONT_NAME, PRINT_WIDE,
} from "@/lib/excel/theme";

// A table the assistant produced, as a workbook.
//
// The assistant's answers were text, a chart, or a letter — so "make me a table
// I can download" had no shape to land in, and the system prompt told it to
// refuse tables outright. This is the missing shape: a grid the UI renders AND
// exports, on the shared workbook theme so a table the assistant built opens
// looking like the operating statement it was derived from.
//
// Per the Excel rule, anything that AGGREGATES is a live formula over the exact
// cells above it, with the JS value cached so the figure shows before Excel
// recalculates. Two aggregations are deliberately NOT written as plain sums:
//   • a ratio column (a % of NOI) is recomputed from its own row's cells, not
//     summed — averaging percentages down a column is a different number from
//     the portfolio ratio, and the wrong one;
//   • a column with any blank is summed over the cells that exist, since a
//     blank means "no such line", not zero.

export type TableColumn = {
  key: string;
  label: string;
  /** How the cell reads, and whether a total row may sum it. */
  format?: "money" | "percent" | "number" | "text";
  /** A ratio column: total = numerator total ÷ denominator total, NOT the sum
   *  of the column. Names the two money columns it is derived from. */
  ratioOf?: { numerator: string; denominator: string };
};

export type TableSpec = {
  title: string;
  /** One line under the title — the basis, the as-of, what was counted. */
  subtitle?: string;
  columns: TableColumn[];
  rows: Record<string, string | number | null>[];
  /** Lines/­notes printed beneath the grid, e.g. which GL lines were summed. */
  notes?: string[];
};

const SUMMABLE = new Set(["money", "number"]);
const round2 = (n: number) => Math.round(n * 100) / 100;

const numeric = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** The sheet name Excel will accept: no \ / ? * [ ] :, 31 chars, non-empty. */
export function sheetName(title: string): string {
  const safe = (title || "Table").replace(/[\\/?*[\]:]/g, "-").slice(0, 31).trim();
  return safe || "Table";
}

const numFmt = (c: TableColumn) =>
  c.format === "money" ? FMT.money
  : c.format === "percent" ? FMT.percentPoints
  : c.format === "number" ? FMT.numberCents
  : undefined;

export async function buildTableXlsx(spec: TableSpec): Promise<ArrayBuffer> {
  const cols = spec.columns;
  const wb = newWorkbook();
  const ws = wb.addWorksheet(sheetName(spec.title), { pageSetup: { ...PRINT_WIDE } });
  ws.columns = cols.map((c, i) => ({ width: i === 0 ? 32 : Math.max(12, c.label.length + 3) }));

  const headerRow = titleBlock(ws, {
    entity: spec.title,
    // The title IS the document here — the assistant names what it built — so
    // the letterhead carries the basis line instead of repeating it.
    document: spec.subtitle ?? "",
    width: cols.length,
  });
  headerBand(ws, headerRow, cols.map((c) => c.label));

  // `null` leaves the cell genuinely EMPTY. An empty string writes a text cell,
  // which is not the same thing: SUM would still skip it, but the grid would
  // carry a value where the answer is "no such line".
  const body = spec.rows.map((r) =>
    cols.map((c): string | number | null => {
      const v = r[c.key];
      if (v === null || v === undefined) return null;
      return typeof v === "number" && Number.isFinite(v) ? v : String(v);
    }),
  );

  const firstBody = headerRow + 1;
  body.forEach((values, i) => {
    const row = ws.getRow(firstBody + i);
    values.forEach((v, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value = v;
      cell.font = { name: FONT_NAME, size: 10, color: { argb: COLOR.text } };
      const f = numFmt(cols[ci]);
      if (f && typeof v === "number") { cell.numFmt = f; cell.alignment = { horizontal: "right" }; }
    });
    if (i % 2 === 1) for (let c = 1; c <= cols.length; c++) {
      row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.zebra } };
    }
  });

  const lastBody = firstBody + body.length - 1;

  // ── Total row ────────────────────────────────────────────────────────────
  let totalRow = lastBody;
  if (body.length > 0) {
    totalRow = lastBody + 1;
    const row = ws.getRow(totalRow);
    const letterOf = (key: string) => {
      const i = cols.findIndex((c) => c.key === key);
      return i < 0 ? null : ws.getColumn(i + 1).letter;
    };
    const label = row.getCell(1);
    label.value = `Total · ${body.length} rows`;
    totalEmphasis(label);

    for (let ci = 1; ci < cols.length; ci++) {
      const col = cols[ci];
      const cell = row.getCell(ci + 1);
      totalEmphasis(cell);

      if (col.ratioOf) {
        // Recomputed from the totals of its own two source columns. Summing a
        // percentage column gives a number that is not the portfolio's ratio.
        const nL = letterOf(col.ratioOf.numerator), dL = letterOf(col.ratioOf.denominator);
        if (!nL || !dL) continue;
        const nSum = spec.rows.reduce((s, r) => s + (numeric(r[col.ratioOf!.numerator]) ?? 0), 0);
        const dSum = spec.rows.reduce((s, r) => s + (numeric(r[col.ratioOf!.denominator]) ?? 0), 0);
        const cached = dSum > 0 ? round2((nSum / dSum) * 100) : 0;
        // IFERROR, because a denominator that totals zero is a real shape here
        // (a portfolio at break-even) and #DIV/0! in a sent workbook reads as a
        // broken file rather than as "not meaningful". The formula is the same
        // arithmetic as `cached`, so it is written unconditionally rather than
        // through liveFormula's reconcile check.
        cell.value = liveFormula(`IFERROR(${nL}${totalRow}/${dL}${totalRow}*100,"")`, cached, cached);
        cell.numFmt = FMT.percentPoints;
        cell.alignment = { horizontal: "right" };
        continue;
      }

      if (!SUMMABLE.has(col.format ?? "text")) continue;
      const L = ws.getColumn(ci + 1).letter;
      // SUM skips blanks, which is what a "no such line" cell must do.
      const sources = spec.rows.map((r) => numeric(r[col.key]) ?? 0);
      cell.value = liveSum(`${L}${firstBody}:${L}${lastBody}`, round2(sources.reduce((s, v) => s + v, 0)), sources);
      cell.numFmt = numFmt(col);
      cell.alignment = { horizontal: "right" };
    }
  }

  // ── Notes ────────────────────────────────────────────────────────────────
  // What was counted and on what basis. A table leaves the building, so it has
  // to state what it is without the conversation it came out of.
  let r = totalRow + 2;
  for (const note of spec.notes ?? []) {
    footNote(ws, r, note, cols.length, 16);
    r += 1;
  }

  freezeAbove(ws, headerRow);
  repeatHeader(ws, headerRow);

  const out = await wb.xlsx.writeBuffer();
  return out as ArrayBuffer;
}

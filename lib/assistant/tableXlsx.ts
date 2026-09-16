import * as XLSX from "xlsx";

// A table the assistant produced, as a workbook.
//
// The assistant's answers were text, a chart, or a letter — so "make me a table
// I can download" had no shape to land in, and the system prompt told it to
// refuse tables outright. This is the missing shape: a grid the UI renders AND
// exports, built client-side with SheetJS like the app's other exports.
//
// Per the Excel rule, anything that AGGREGATES is a live formula over the exact
// cells above it, with the JS value cached so the figure shows before Excel
// recalculates. Two aggregations are deliberately NOT written as formulas:
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

export function buildTableXlsx(spec: TableSpec): ArrayBuffer {
  const cols = spec.columns;
  const header = cols.map((c) => c.label);
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

  const aoa: (string | number | null)[][] = [[spec.title]];
  if (spec.subtitle) aoa.push([spec.subtitle]);
  aoa.push([]);
  const headerRow = aoa.length;          // 0-indexed sheet row of the header
  aoa.push(header, ...body);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const firstBody = headerRow + 1;
  const lastBody = firstBody + body.length - 1;

  const fmt = (c: TableColumn) =>
    c.format === "money" ? "#,##0" : c.format === "percent" ? "0.00\"%\"" : c.format === "number" ? "#,##0.00" : undefined;

  for (let ci = 0; ci < cols.length; ci++) {
    const f = fmt(cols[ci]);
    if (!f) continue;
    for (let r = firstBody; r <= lastBody; r++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c: ci })];
      if (cell && cell.t === "n") cell.z = f;
    }
  }

  // ── Total row ────────────────────────────────────────────────────────────
  let totalRow = lastBody;
  if (body.length > 0) {
    totalRow = lastBody + 1;
    const colIndex = (key: string) => cols.findIndex((c) => c.key === key);
    ws[XLSX.utils.encode_cell({ r: totalRow, c: 0 })] = { t: "s", v: `Total · ${body.length} rows` };

    for (let ci = 1; ci < cols.length; ci++) {
      const col = cols[ci];
      const addr = XLSX.utils.encode_cell({ r: totalRow, c: ci });

      if (col.ratioOf) {
        // Recomputed from the totals of its own two source columns. Summing a
        // percentage column gives a number that is not the portfolio's ratio.
        const nI = colIndex(col.ratioOf.numerator);
        const dI = colIndex(col.ratioOf.denominator);
        if (nI < 0 || dI < 0) continue;
        const nL = XLSX.utils.encode_col(nI), dL = XLSX.utils.encode_col(dI);
        const nSum = spec.rows.reduce((s, r) => s + (numeric(r[col.ratioOf!.numerator]) ?? 0), 0);
        const dSum = spec.rows.reduce((s, r) => s + (numeric(r[col.ratioOf!.denominator]) ?? 0), 0);
        const cached = dSum > 0 ? round2((nSum / dSum) * 100) : 0;
        ws[addr] = {
          t: "n",
          // IFERROR, because a denominator that totals zero is a real shape
          // here (a portfolio at break-even) and #DIV/0! in a sent workbook
          // reads as a broken file rather than as "not meaningful".
          f: `IFERROR(${nL}${totalRow + 1}/${dL}${totalRow + 1}*100,"")`,
          v: cached,
          z: "0.00\"%\"",
        };
        continue;
      }

      if (!SUMMABLE.has(col.format ?? "text")) continue;
      const letter = XLSX.utils.encode_col(ci);
      // SUM skips blanks, which is what a "no such line" cell must do.
      const cached = round2(spec.rows.reduce((s, r) => s + (numeric(r[col.key]) ?? 0), 0));
      ws[addr] = { t: "n", f: `SUM(${letter}${firstBody + 1}:${letter}${lastBody + 1})`, v: cached, z: fmt(col) };
    }
  }

  // ── Notes ────────────────────────────────────────────────────────────────
  let r = totalRow + 2;
  for (const note of spec.notes ?? []) {
    ws[XLSX.utils.encode_cell({ r, c: 0 })] = { t: "s", v: note };
    r += 1;
  }

  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(r, totalRow), c: Math.max(0, cols.length - 1) } });
  ws["!cols"] = cols.map((c, i) => ({ wch: i === 0 ? 32 : Math.max(12, c.label.length + 3) }));
  ws["!freeze"] = { xSplit: "0", ySplit: String(firstBody), topLeftCell: `A${firstBody + 1}`, activePane: "bottomLeft", state: "frozen" };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName(spec.title));
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

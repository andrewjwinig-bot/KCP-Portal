import type { TableSpec, TableColumn } from "./tableXlsx";

// What the model proposed, made safe to render and to export.
//
// The table is the one part of an answer a person will forward, so it is
// validated the way the chart already is: shapes checked, sizes capped, and
// anything that would make a figure WRONG rather than merely ugly rejected.
//
// The rule that matters: a `ratioOf` naming columns that don't exist would make
// the workbook's total row compute over the wrong cells — so the reference is
// dropped and the column falls back to an ordinary (unsummed) percentage,
// rather than shipping a formula pointing somewhere arbitrary.

const MAX_COLS = 24;
const MAX_ROWS = 300;
const FORMATS = new Set(["money", "percent", "number", "text"]);

const str = (v: unknown, cap: number) => String(v ?? "").slice(0, cap);

export function validateTable(raw: unknown): TableSpec | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;

  const rawCols = Array.isArray(t.columns) ? t.columns : [];
  const columns: TableColumn[] = [];
  const seen = new Set<string>();
  for (const c of rawCols.slice(0, MAX_COLS)) {
    if (!c || typeof c !== "object") continue;
    const o = c as Record<string, unknown>;
    const key = str(o.key, 60).trim();
    // A duplicate key would make one column silently shadow the other.
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const format = FORMATS.has(String(o.format)) ? (String(o.format) as TableColumn["format"]) : "text";
    columns.push({ key, label: str(o.label, 60).trim() || key, format });
  }
  if (columns.length < 2) return null;

  // Second pass: a ratio may only reference columns that actually exist, and
  // must point at numeric ones — a ratio of two text columns is nonsense.
  const numericKeys = new Set(columns.filter((c) => c.format === "money" || c.format === "number").map((c) => c.key));
  for (let i = 0; i < columns.length; i++) {
    const o = (rawCols[i] ?? {}) as Record<string, unknown>;
    const r = o.ratioOf as { numerator?: unknown; denominator?: unknown } | undefined;
    if (!r || typeof r !== "object") continue;
    const numerator = str(r.numerator, 60);
    const denominator = str(r.denominator, 60);
    if (numericKeys.has(numerator) && numericKeys.has(denominator) && numerator !== denominator) {
      columns[i].ratioOf = { numerator, denominator };
    }
  }

  const keys = columns.map((c) => c.key);
  const rows: Record<string, string | number | null>[] = [];
  for (const r of (Array.isArray(t.rows) ? t.rows : []).slice(0, MAX_ROWS)) {
    if (!r || typeof r !== "object") continue;
    const src = r as Record<string, unknown>;
    const row: Record<string, string | number | null> = {};
    for (const k of keys) {
      const v = src[k];
      if (v === null || v === undefined || v === "") { row[k] = null; continue; }
      // A number that arrived as a string ("1,250") is still a number the
      // workbook must be able to total.
      if (typeof v === "number") { row[k] = Number.isFinite(v) ? v : null; continue; }
      const asNum = Number(String(v).replace(/[$,\s]/g, ""));
      const col = columns.find((c) => c.key === k)!;
      row[k] = col.format !== "text" && String(v).trim() !== "" && Number.isFinite(asNum) ? asNum : str(v, 200);
    }
    rows.push(row);
  }
  if (rows.length === 0) return null;

  const notes = (Array.isArray(t.notes) ? t.notes : [])
    .map((n) => str(n, 300).trim())
    .filter(Boolean)
    .slice(0, 8);

  return {
    title: str(t.title, 120).trim() || "Table",
    subtitle: str(t.subtitle, 200).trim() || undefined,
    columns,
    rows,
    notes: notes.length ? notes : undefined,
  };
}

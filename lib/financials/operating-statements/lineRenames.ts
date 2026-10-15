// A statement LINE IS KEYED BY ITS SECTION AND LABEL (`section::label`) in
// every store that hangs something on it — typed reprojection months, typed
// budget months, budget line notes, statement notes, dismissed flags. Renaming
// a section or a line in the mapping would orphan all of it. So a rename is
// listed here and every such store reads its OLD keys as the NEW ones; a
// value saved under the new key wins over one under the old.
//
// 2010 (LIK Management, owner 10/2026): "since its not a property theres no
// reimbursable vs nonreimbursable expenses its just expenses", and LIK
// Management Clearing (8000-*, where its payroll posts — 8000-9900 Payroll &
// Benefits) is its salaries → "Salaries & Benefits". Two lines take the LIK
// workbook's names, by account: 8980-9800 "Auto/ Vehicle" is the workbook's
// G&A Clearing, and 8990 "Other G&A Expense" its Auto/ Vehicle lease + gas.

type Rename = (key: string) => string;

const RENAMES: Record<string, Rename> = {
  "2010": (key) => key
    .replace(/^(?:Non-)?Reimbursable Expenses::/, "Expenses::")
    .replace(/^Expenses::LIK Management Clearing(?=$|#)/, "Expenses::Salaries & Benefits")
    .replace(/^Expenses::Auto\/ Vehicle(?=$|#)/, "Expenses::G&A Clearing")
    .replace(/^Expenses::Other G&A Expense(?=$|#)/, "Expenses::Auto/ Vehicle Expenses"),
};

/** A stored line key as the CURRENT mapping names it. */
export function currentLineKey(code: string, key: string): string {
  const f = RENAMES[String(code ?? "").toUpperCase()];
  return f ? f(key) : key;
}

/** A store document keyed by line, with its old keys read as the new ones.
 *  Keys already in their new form win over a renamed old one. */
export function withCurrentLineKeys<T>(code: string, doc: Record<string, T>): Record<string, T> {
  if (!RENAMES[String(code ?? "").toUpperCase()]) return doc;
  const out: Record<string, T> = {};
  const renamed: [string, T][] = [];
  for (const [k, v] of Object.entries(doc ?? {})) {
    const nk = currentLineKey(code, k);
    if (nk === k) out[k] = v; else renamed.push([nk, v]);
  }
  for (const [k, v] of renamed) if (!(k in out)) out[k] = v;
  return out;
}

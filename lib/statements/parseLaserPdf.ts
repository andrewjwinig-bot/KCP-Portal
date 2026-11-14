// Skyline's LASER STATEMENT, as the PDF Tanya saves each month (owner: "read
// PDFs so i dont need to rerun them as excel files"). Crystal prints one
// statement per page — a tenant that runs long continues on the next page under
// the same unit — and every line sits in fixed columns:
//
//   unit ref (top right, "3610-101-CU") · bill-to block under it
//   DATE (x≈23) · DESCRIPTION (x≈102) · AMOUNT DUE (x≈330–470) · BALANCE (x≈480+)
//   … PREVIOUS MONTH ENDING BALANCE · CURRENT CHARGES … TOTAL CURRENT
//   Total Amount Due: $ x  ("$ See the next page" on a continued page)
//
// `laserRowsFromPages` (pure) lays each printed line into the Excel export's
// column slots and hands them to `statementsFromRows` — the SAME reader and the
// same tie-out the .xls import uses, so the two formats cannot drift. On top of
// that, every tenant must equal the TOTAL AMOUNT DUE the PDF printed; one that
// does not is untied and holds the month back, like any other.

import { STATEMENT_COLS as C, statementsFromRows, type ParsedStatements } from "./parseSkylineStatements";
import type { PdfItem } from "../pdf/pdfText";

const UNIT_REF_RE = /^(\d{3,6})-[A-Za-z0-9._/-]+$/;
const DATE_RE = /^\d{1,2}\/\d{1,2}\/\d{4}$/;

/** Columns on the page, in points (the statement is a fixed Crystal layout). */
const X = { descFrom: 80, amountFrom: 320, balanceFrom: 470 };

const money = (s: string): number | null => {
  const t = s.replace(/[$,\s]/g, "");
  const n = Number(t.replace(/^\((.*)\)$/, "-$1"));
  return /\d/.test(t) && Number.isFinite(n) ? n : null;
};

/** Items → printed lines: the balance figure sits a point or two off its label. */
function lines(items: PdfItem[]): PdfItem[][] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const out: PdfItem[][] = [];
  for (const it of sorted) {
    const last = out[out.length - 1];
    if (last && Math.abs(last[0].y - it.y) <= 3) last.push(it);
    else out.push([it]);
  }
  return out.map((l) => l.sort((a, b) => a.x - b.x));
}

export type LaserRows = { rows: unknown[][]; printedTotal: Map<string, number> };

/** Pages of positioned text → statement rows (pure). */
export function laserRowsFromPages(pages: PdfItem[][]): LaserRows {
  const rows: unknown[][] = [];
  const printedTotal = new Map<string, number>();
  const row = (cells: Record<number, unknown>) => {
    const r: unknown[] = new Array(C.balance + 1).fill(null);
    for (const [k, v] of Object.entries(cells)) r[Number(k)] = v;
    rows.push(r);
  };

  for (const items of pages) {
    const ls = lines(items);
    // The unit ref is the top line's right-hand text.
    const head = items.find((i) => i.y > 740 && i.x > 300 && UNIT_REF_RE.test(i.s.toUpperCase()));
    if (!head) continue;                       // not a statement page
    const ref = head.s.toUpperCase();
    const top = items.find((i) => i.s.toUpperCase() === "DESCRIPTION" && i.x < X.amountFrom);
    const tableY = top?.y ?? 706;
    const billTo = items
      .filter((i) => i.y < head.y - 3 && i.y > tableY + 6 && Math.abs(i.x - head.x) <= 15)
      .sort((a, b) => b.y - a.y)
      .map((i) => i.s);
    row({ [C.unitRef]: ref });
    row({ [C.unitRef]: billTo.join("\n") });

    for (const l of ls) {
      const y = l[0].y;
      if (y >= tableY - 3) continue;           // header + column titles
      const text = l.map((i) => i.s).join(" ");
      if (/^Total Amount Due:/i.test(text)) {
        const v = l.find((i) => i.x >= X.balanceFrom);
        const n = v ? money(v.s) : null;
        if (n !== null) printedTotal.set(ref.replace(/-CU$/, ""), n);
        break;                                 // the coupon below repeats it
      }
      if (/^CONTINUED ON THE NEXT PAGE/i.test(text)) break;
      const date = l.find((i) => i.x < X.descFrom && DATE_RE.test(i.s));
      const desc = l.filter((i) => i.x >= X.descFrom && i.x < X.amountFrom).map((i) => i.s).join(" ");
      const amount = l.find((i) => i.x >= X.amountFrom && i.x < X.balanceFrom);
      const balance = l.find((i) => i.x >= X.balanceFrom);
      if (!desc) continue;
      row({
        [C.date]: date?.s ?? null,
        [C.desc]: desc,
        [C.amount]: amount ? money(amount.s) : null,
        [C.balance]: balance ? money(balance.s) : null,
      });
    }
  }
  return { rows, printedTotal };
}

/** Rows → tenants, each also checked against the Total Amount Due it printed. */
export function statementsFromLaserPages(pages: PdfItem[][]): Omit<ParsedStatements, "exportedAt"> {
  const { rows, printedTotal } = laserRowsFromPages(pages);
  const parsed = statementsFromRows(rows);
  const mismatched = new Set(parsed.mismatched);
  for (const st of parsed.statements) {
    const printed = printedTotal.get(st.unitRef);
    if (printed !== undefined && Math.abs(printed - st.reportedBalance) > 0.011) {
      st.tiesOut = false;
      mismatched.add(st.unitRef);
    }
  }
  return { ...parsed, mismatched: [...mismatched] };
}

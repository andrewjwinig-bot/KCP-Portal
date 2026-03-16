import * as XLSX from "xlsx";

// ─── Types ───────────────────────────────────────────────────────────────────

export type GLTransaction = {
  accountCode: string;        // e.g. "8220-9301"
  accountSuffix: "9301" | "9302" | "9303";
  accountName: string;
  date: string;
  description: string;
  jrn: string;
  ref: string;
  debit: number;
  credit: number;
  net: number;
};

export type GLAccountTotal = {
  accountCode: string;
  accountName: string;
  accountSuffix: "9301" | "9302" | "9303";
  netTotal: number;
};

export type GLParseResult = {
  periodText: string;
  periodEndDate: string;
  statementMonth: string;
  transactions: GLTransaction[];
  accountTotals: Map<string, GLAccountTotal>;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const TARGET_SUFFIXES = new Set(["9301", "9302", "9303"]);

// Matches rows that are GL totals/balance lines — not individual transactions
const TOTAL_BALANCE_RE = /^(total|balance|subtotal|net\s+change|beginning\s+balance|ending\s+balance)/i;

// Matches "XXXX-XXXX" anywhere at the start of a cell value
const ACCOUNT_CODE_START = /^(\d{4}-\d{4})/;
const DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseAmount(raw: unknown): number {
  if (raw == null || raw === "") return 0;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  const s = String(raw).trim();
  if (!s || s === "-") return 0;
  const negParen = s.startsWith("(") && s.endsWith(")");
  const cleaned = s.replace(/[$,()]/g, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return 0;
  return negParen ? -Math.abs(n) : n;
}

function isDateLike(val: unknown): string | null {
  if (val == null || val === "") return null;
  // XLSX may parse date cells as Excel serial numbers
  if (typeof val === "number" && val > 10000 && val < 100000) {
    try {
      const s = XLSX.SSF.format("MM/DD/YY", val);
      if (DATE_RE.test(s)) return s;
    } catch { /* ignore */ }
  }
  const s = String(val).trim();
  if (DATE_RE.test(s)) return s;
  return null;
}

/**
 * Scan a row for an account code like "XXXX-XXXX" in any of the first N cells.
 * Returns { col, code, name } or null.
 */
function findAccountInRow(row: unknown[], maxCols = 10): { col: number; code: string; name: string } | null {
  for (let c = 0; c < Math.min(maxCols, row.length); c++) {
    const s = String(row[c] ?? "").trim();
    const m = s.match(ACCOUNT_CODE_START);
    if (m) {
      const code = m[1]; // "XXXX-XXXX"
      // Name is either the rest of this cell or the next non-empty cell
      const nameInCell = s.slice(code.length).trim();
      let name = nameInCell;
      if (!name) {
        for (let nc = c + 1; nc <= c + 5 && nc < row.length; nc++) {
          const v = String(row[nc] ?? "").trim();
          if (v && !ACCOUNT_CODE_START.test(v)) { name = v; break; }
        }
      }
      return { col: c, code, name };
    }
  }
  return null;
}

/**
 * Returns true if this row appears to be a GL total/balance summary line
 * (e.g. "Total 8220-9301", "Ending Balance", "Subtotal") rather than a transaction.
 */
function isTotalOrBalanceRow(row: unknown[]): boolean {
  for (let c = 0; c < Math.min(8, row.length); c++) {
    const s = String(row[c] ?? "").trim();
    if (s && TOTAL_BALANCE_RE.test(s)) return true;
  }
  return false;
}

/**
 * Scan a row for a date value in any of the first N cells.
 * Returns { col, date } or null.
 */
function findDateInRow(row: unknown[], maxCols = 6): { col: number; date: string } | null {
  for (let c = 0; c < Math.min(maxCols, row.length); c++) {
    const d = isDateLike(row[c]);
    if (d) return { col: c, date: d };
  }
  return null;
}

function extractPeriod(rows: unknown[][]): { periodText: string; periodEndDate: string; statementMonth: string } {
  for (let i = 0; i < Math.min(16, rows.length); i++) {
    for (const cell of rows[i]) {
      const s = String(cell ?? "").trim();
      if (/period\s+ending/i.test(s)) {
        const match = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
        if (match) {
          const [, mm, dd, yyyy] = match;
          const fullYear = yyyy.length === 2 ? "20" + yyyy : yyyy;
          const periodEndDate = `${fullYear}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
          const statementMonth = `${fullYear}-${mm.padStart(2, "0")}`;
          return { periodText: s, periodEndDate, statementMonth };
        }
        // "Period Ending" found but no date in same cell — scan same row
        for (const c2 of rows[i]) {
          const m2 = String(c2 ?? "").match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
          if (m2) {
            const [, mm, dd, yyyy] = m2;
            const fullYear = yyyy.length === 2 ? "20" + yyyy : yyyy;
            const periodEndDate = `${fullYear}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
            const statementMonth = `${fullYear}-${mm.padStart(2, "0")}`;
            return { periodText: `Period Ending ${mm}/${dd}/${fullYear}`, periodEndDate, statementMonth };
          }
        }
        return { periodText: s, periodEndDate: "", statementMonth: "" };
      }
    }
  }
  return { periodText: "", periodEndDate: "", statementMonth: "" };
}

/**
 * Find the row containing "Debit" and "Credit" column headers.
 * Returns column indices for debit, credit, jrn, ref.
 */
function findHeaderRow(rows: unknown[][]): {
  headerRowIdx: number;
  colDebit: number;
  colCredit: number;
  colJrn: number;
  colRef: number;
} {
  for (let i = 0; i < rows.length; i++) {
    const lower = rows[i].map((c) => String(c ?? "").trim().toLowerCase());
    const debitIdx  = lower.findIndex((c) => c === "debit");
    const creditIdx = lower.findIndex((c) => c === "credit");
    if (debitIdx >= 0 && creditIdx >= 0) {
      const jrnIdx = lower.findIndex((c) => c === "jrn" || c === "journal");
      const refIdx = lower.findIndex((c) => c === "ref" || c === "reference");
      return { headerRowIdx: i, colDebit: debitIdx, colCredit: creditIdx, colJrn: jrnIdx, colRef: refIdx };
    }
  }
  return { headerRowIdx: -1, colDebit: -1, colCredit: -1, colJrn: -1, colRef: -1 };
}

/**
 * Given a transaction row and known column positions, find debit/credit amounts.
 * If colDebit/colCredit are unknown (-1), scan right half of the row for the
 * two largest numeric values.
 */
function extractAmounts(
  row: unknown[],
  colDebit: number,
  colCredit: number,
  dateCol: number
): { debit: number; credit: number } {
  if (colDebit >= 0 && colCredit >= 0) {
    return { debit: parseAmount(row[colDebit]), credit: parseAmount(row[colCredit]) };
  }

  // Fallback: scan cells after the date for numeric values
  const amounts: { col: number; val: number }[] = [];
  const start = Math.max(dateCol + 1, 2);
  for (let c = start; c < row.length; c++) {
    const raw = row[c];
    if (raw === "" || raw == null) continue;
    const v = parseAmount(raw);
    if (v !== 0) amounts.push({ col: c, val: v });
  }

  // Typical GL layout: debit comes before credit
  if (amounts.length >= 2) {
    return { debit: amounts[0].val, credit: amounts[1].val };
  }
  if (amounts.length === 1) {
    // Single amount — figure out debit vs credit by column position
    // Credit is usually in the rightmost amount column
    const singleVal = amounts[0].val;
    return { debit: 0, credit: singleVal > 0 ? singleVal : 0 };
  }
  return { debit: 0, credit: 0 };
}

// ─── Main parser ─────────────────────────────────────────────────────────────

export function parseGLExcel(buffer: ArrayBuffer): GLParseResult {
  const wb = XLSX.read(new Uint8Array(buffer), { type: "array", cellDates: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];

  const rows: unknown[][] = (XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: true,
  }) as unknown[][]).map((r) => (r as unknown[]).map((c) => (c == null ? "" : c)));

  const { periodText, periodEndDate, statementMonth } = extractPeriod(rows);
  const { headerRowIdx, colDebit, colCredit, colJrn, colRef } = findHeaderRow(rows);

  const transactions: GLTransaction[] = [];
  let currentAccountCode = "";
  let currentAccountName = "";
  let currentAccountSuffix: "9301" | "9302" | "9303" | "" = "";

  // Start scanning after the header row (or from row 0 if header not found)
  const startRow = headerRowIdx >= 0 ? headerRowIdx + 1 : 0;

  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];

    // ── Check if this row is an account section header ──────────────────────
    const acctMatch = findAccountInRow(row, 10);
    if (acctMatch) {
      currentAccountCode = acctMatch.code;
      currentAccountName = acctMatch.name;
      const suffix = acctMatch.code.split("-")[1] ?? "";
      currentAccountSuffix = TARGET_SUFFIXES.has(suffix)
        ? (suffix as "9301" | "9302" | "9303")
        : "";
      continue;
    }

    // Skip total/balance summary rows (prevents doubling from running-balance lines)
    if (isTotalOrBalanceRow(row)) continue;

    // Only process transactions for target accounts
    if (!currentAccountSuffix) continue;

    // ── Check if this row is a transaction row (has a date) ─────────────────
    const dateMatch = findDateInRow(row, 6);
    if (dateMatch) {
      const { col: dateCol, date: dateStr } = dateMatch;

      // Description: first non-empty cell after the date (skip the date cell itself)
      let description = "";
      for (let c = dateCol + 1; c <= dateCol + 5 && c < row.length; c++) {
        const v = String(row[c] ?? "").trim();
        // Skip cells that look like account codes, dates, or journal codes (AP/JM/LT etc)
        if (v && v.length > 3 && !DATE_RE.test(v) && !ACCOUNT_CODE_START.test(v)) {
          description = v;
          break;
        }
      }

      const jrn = colJrn >= 0 ? String(row[colJrn] ?? "").trim() : "";
      const ref = colRef >= 0 ? String(row[colRef] ?? "").trim() : "";
      const { debit, credit } = extractAmounts(row, colDebit, colCredit, dateCol);
      const net = debit - credit;

      transactions.push({
        accountCode:   currentAccountCode,
        accountSuffix: currentAccountSuffix as "9301" | "9302" | "9303",
        accountName:   currentAccountName,
        date:          dateStr,
        description,
        jrn,
        ref,
        debit,
        credit,
        net,
      });
      continue;
    }

    // ── Continuation row: no date, but has amounts ──────────────────────────
    // Some GL entries split the description onto one row and amounts onto the next.
    if (transactions.length > 0) {
      const last = transactions[transactions.length - 1];
      if (last.accountCode === currentAccountCode) {
        const { debit, credit } = extractAmounts(row, colDebit, colCredit, 0);
        if (debit !== 0 || credit !== 0) {
          last.debit  += debit;
          last.credit += credit;
          last.net     = last.debit - last.credit;
          // Pick up jrn/ref if missing
          if (!last.jrn && colJrn >= 0) last.jrn = String(row[colJrn] ?? "").trim();
          if (!last.ref && colRef >= 0)  last.ref = String(row[colRef] ?? "").trim();
        }
        // Pick up description if the previous row had none
        if (!last.description) {
          for (let c = 0; c < Math.min(8, row.length); c++) {
            const v = String(row[c] ?? "").trim();
            if (v && v.length > 3 && !DATE_RE.test(v) && !ACCOUNT_CODE_START.test(v)) {
              last.description = v;
              break;
            }
          }
        }
      }
    }
  }

  // ── Build account totals ──────────────────────────────────────────────────
  const accountTotals = new Map<string, GLAccountTotal>();
  for (const tx of transactions) {
    const existing = accountTotals.get(tx.accountCode);
    if (existing) {
      existing.netTotal += tx.net;
    } else {
      accountTotals.set(tx.accountCode, {
        accountCode:   tx.accountCode,
        accountName:   tx.accountName,
        accountSuffix: tx.accountSuffix,
        netTotal:      tx.net,
      });
    }
  }

  return { periodText, periodEndDate, statementMonth, transactions, accountTotals };
}

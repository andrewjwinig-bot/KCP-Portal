import * as XLSX from "xlsx";

// ─── Types ───────────────────────────────────────────────────────────────────

export type GLTransaction = {
  accountCode: string;        // e.g. "8220-9301"
  accountSuffix: "9301" | "9302" | "9303";
  accountName: string;
  date: string;               // as found in the file, e.g. "01/02/25"
  description: string;
  jrn: string;
  ref: string;
  debit: number;
  credit: number;
  net: number;                // debit - credit (positive = expense)
};

export type GLAccountTotal = {
  accountCode: string;
  accountName: string;
  accountSuffix: "9301" | "9302" | "9303";
  netTotal: number;
};

export type GLParseResult = {
  periodText: string;
  periodEndDate: string;      // YYYY-MM-DD
  statementMonth: string;     // YYYY-MM
  transactions: GLTransaction[];
  accountTotals: Map<string, GLAccountTotal>;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const TARGET_SUFFIXES = new Set(["9301", "9302", "9303"]);
const ACCOUNT_HEADER_RE = /^\d{4}-\d{4}$/;
const DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseAmount(raw: unknown): number {
  if (raw == null || raw === "") return 0;
  const s = String(raw).trim();
  if (!s || s === "-") return 0;
  const negParen = s.startsWith("(") && s.endsWith(")");
  const cleaned = s.replace(/[$,()]/g, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return 0;
  return negParen ? -Math.abs(n) : n;
}

function formatExcelDate(serial: number): string {
  // Excel serial date → MM/DD/YY string
  try {
    const formatted = XLSX.SSF.format("MM/DD/YY", serial);
    return formatted;
  } catch {
    return String(serial);
  }
}

function isDateLike(val: unknown): string | null {
  if (val == null || val === "") return null;
  // XLSX may parse date cells as numbers (serial dates)
  if (typeof val === "number" && val > 10000 && val < 100000) {
    const s = formatExcelDate(val);
    if (DATE_RE.test(s)) return s;
  }
  const s = String(val).trim();
  if (DATE_RE.test(s)) return s;
  return null;
}

function extractPeriod(rows: unknown[][]): { periodText: string; periodEndDate: string; statementMonth: string } {
  for (let i = 0; i < Math.min(14, rows.length); i++) {
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
        return { periodText: s, periodEndDate: "", statementMonth: "" };
      }
      // Also look for a standalone date pattern in early rows combined with period text on adjacent cells
      if (i < 12 && /period/i.test(s)) {
        // scan same row for a date
        for (const c2 of rows[i]) {
          const match2 = String(c2 ?? "").match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
          if (match2) {
            const [, mm, dd, yyyy] = match2;
            const fullYear = yyyy.length === 2 ? "20" + yyyy : yyyy;
            const periodEndDate = `${fullYear}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
            const statementMonth = `${fullYear}-${mm.padStart(2, "0")}`;
            return { periodText: `Period Ending ${mm}/${dd}/${yyyy}`, periodEndDate, statementMonth };
          }
        }
      }
    }
  }
  return { periodText: "", periodEndDate: "", statementMonth: "" };
}

function findHeaderRow(rows: unknown[][]): {
  headerRowIdx: number;
  colDebit: number;
  colCredit: number;
  colJrn: number;
  colRef: number;
} {
  for (let i = 0; i < rows.length; i++) {
    const lower = rows[i].map((c) => String(c ?? "").trim().toLowerCase());
    const debitIdx = lower.findIndex((c) => c === "debit");
    const creditIdx = lower.findIndex((c) => c === "credit");
    if (debitIdx >= 0 && creditIdx >= 0) {
      const jrnIdx = lower.findIndex((c) => c === "jrn" || c === "journal");
      const refIdx = lower.findIndex((c) => c === "ref" || c === "reference");
      return { headerRowIdx: i, colDebit: debitIdx, colCredit: creditIdx, colJrn: jrnIdx, colRef: refIdx };
    }
  }
  // fallback: assume standard column layout if header not found
  return { headerRowIdx: -1, colDebit: 4, colCredit: 5, colJrn: 2, colRef: 3 };
}

// ─── Main parser ─────────────────────────────────────────────────────────────

export function parseGLExcel(buffer: ArrayBuffer): GLParseResult {
  const wb = XLSX.read(new Uint8Array(buffer), { type: "array", cellDates: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];

  // Use raw: false so XLSX formats dates as strings where possible,
  // but also keep raw values for numeric detection
  const rawRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: true,
  }) as unknown[][];

  // Convert each cell to a stable unknown value (keep numbers as numbers)
  const rows: unknown[][] = rawRows.map((r) =>
    (r as unknown[]).map((c) => (c == null ? "" : c))
  );

  const { periodText, periodEndDate, statementMonth } = extractPeriod(rows);
  const { headerRowIdx, colDebit, colCredit, colJrn, colRef } = findHeaderRow(rows);

  const transactions: GLTransaction[] = [];
  let currentAccountCode = "";
  let currentAccountName = "";
  let currentAccountSuffix: "9301" | "9302" | "9303" | "" = "";

  const startRow = headerRowIdx >= 0 ? headerRowIdx + 1 : 0;

  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    const col0 = String(row[0] ?? "").trim();

    // Account section header: "XXXX-XXXX"
    if (ACCOUNT_HEADER_RE.test(col0)) {
      currentAccountCode = col0;
      // Account name is in the next non-empty cell (cols 1, 2, or 3)
      currentAccountName = "";
      for (let c = 1; c <= 4; c++) {
        const v = String(row[c] ?? "").trim();
        if (v && !ACCOUNT_HEADER_RE.test(v)) {
          currentAccountName = v;
          break;
        }
      }
      const suffix = col0.split("-")[1] ?? "";
      currentAccountSuffix = (TARGET_SUFFIXES.has(suffix) ? suffix : "") as "9301" | "9302" | "9303" | "";
      continue;
    }

    // Skip if not a target account
    if (!currentAccountSuffix) continue;

    // Transaction row: col0 is a date
    const dateStr = isDateLike(row[0]);
    if (dateStr) {
      // Description is in col 1 (may span merged cells, take first non-empty after col0)
      let description = "";
      for (let c = 1; c <= 2; c++) {
        const v = String(row[c] ?? "").trim();
        if (v) { description = v; break; }
      }

      const jrn = colJrn >= 0 ? String(row[colJrn] ?? "").trim() : "";
      const ref = colRef >= 0 ? String(row[colRef] ?? "").trim() : "";
      const debit = parseAmount(row[colDebit]);
      const credit = parseAmount(row[colCredit]);
      const net = debit - credit;

      transactions.push({
        accountCode: currentAccountCode,
        accountSuffix: currentAccountSuffix as "9301" | "9302" | "9303",
        accountName: currentAccountName,
        date: dateStr,
        description,
        jrn,
        ref,
        debit,
        credit,
        net,
      });
      continue;
    }

    // Some GL rows have the description on one row and the amounts on the next.
    // If col0 is empty but debit/credit columns have values, attach to the last transaction.
    if (col0 === "" && transactions.length > 0) {
      const debit = parseAmount(row[colDebit]);
      const credit = parseAmount(row[colCredit]);
      if (debit !== 0 || credit !== 0) {
        const last = transactions[transactions.length - 1];
        if (last.accountCode === currentAccountCode) {
          last.debit += debit;
          last.credit += credit;
          last.net = last.debit - last.credit;
          if (!last.jrn && colJrn >= 0) last.jrn = String(row[colJrn] ?? "").trim();
          if (!last.ref && colRef >= 0) last.ref = String(row[colRef] ?? "").trim();
        }
      }
    }
  }

  // Build account totals map
  const accountTotals = new Map<string, GLAccountTotal>();
  for (const tx of transactions) {
    const existing = accountTotals.get(tx.accountCode);
    if (existing) {
      existing.netTotal += tx.net;
    } else {
      accountTotals.set(tx.accountCode, {
        accountCode: tx.accountCode,
        accountName: tx.accountName,
        accountSuffix: tx.accountSuffix,
        netTotal: tx.net,
      });
    }
  }

  return { periodText, periodEndDate, statementMonth, transactions, accountTotals };
}

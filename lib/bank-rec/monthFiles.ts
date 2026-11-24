// BANK REC — reading the month's files (owner: "lets build out the bank rec
// page and process"). Three sources per account per month:
//
//   1. The BANK STATEMENT (Stmt PDF) — the bank's own ending balance.
//   2. MARIE'S SKYLINE RECS — the "Statement Reconcile Report" saved as Rec1
//      (the cleared detail), Rec2 (what is still open) and Rec2B (re-run once
//      an open item was cleared); a quiet account is one "Rec1&2" file.
//   3. SKYLINE'S CHECKING ACCOUNT REPORT (.xls) — every checking account's
//      book balance, its transactions and its OWNERSHIP BY PROPERTY.
//
// Saved by Marie under SharePoint "!<year> Year End/Bank Account
// Reconciliations/<NN Month YYYY>/<Bank>/", named like
// "7200 Elbridge xx1692 30 Sept 2026 Rec1.pdf". The names drift ("xz5631",
// "xx09629", "X6888", "Temp XX0613", "Rec1&2"), so an account is matched by
// the LAST FOUR DIGITS of its x-number and nothing else.
//
// Pure (no I/O). Text comes from `pdfText` on the server; every pattern is
// whitespace-tolerant because PDF text runs words together and apart.

export type RecFileKind = "stmt" | "rec1" | "rec2" | "rec2b" | "rec12" | "checking-report" | "unknown";

/** Last four digits of the account number in a file name, as "x1692". */
export function last4FromName(name: string): string | null {
  const m = name.match(/(?:^|[^A-Za-z0-9])[xX][xXzZ]?(\d{4,6})(?![0-9])/);
  return m ? `x${m[1].slice(-4)}` : null;
}

export function kindFromName(name: string): RecFileKind {
  if (/\.(xls|xlsx|csv)$/i.test(name) || /checking\s*account\s*report/i.test(name)) return "checking-report";
  const n = name.replace(/\.pdf$/i, "");
  if (/rec\s*1\s*(&|and|\+)\s*2/i.test(n)) return "rec12";
  if (/rec\s*2\s*b\b/i.test(n)) return "rec2b";
  if (/rec\s*2\b/i.test(n)) return "rec2";
  if (/rec\s*1\b/i.test(n)) return "rec1";
  if (/st(ate)?m(en)?t|statement/i.test(n)) return "stmt";
  // "30 Sept 2026 Chase X5623 Hyman Korman Co.pdf" — a lone bank PDF is a statement.
  return /\.pdf$/i.test(name) ? "stmt" : "unknown";
}

/** "(1,234.56)", "-1,234.56", "−$1,234.56", "$1,234.56" → number. */
export function amountOf(s: string): number | null {
  const t = s.trim();
  const m = t.match(/^(\()?\s*([-−])?\s*\$?\s*([\d,]+\.\d{2})\s*(\))?$/);
  if (!m) return null;
  const v = Number(m[3].replace(/,/g, ""));
  return m[1] || m[2] || m[4] ? -v : v;
}

const sq = (t: string) => t.replace(/\s+/g, " ").trim();
const AMT = String.raw`\(?[-−]?\$?[\d,]+\.\d{2}\)?`;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function isoFromMdy(s: string): string | null {
  const m = s.match(/(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{2,4})/);
  if (!m) return null;
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}
function isoFromWords(s: string): string | null {
  const m = s.match(/([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (!m) return null;
  const mo = MONTHS.indexOf(m[1].toLowerCase());
  return mo < 0 ? null : `${m[3]}-${String(mo + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

// ── 1. Bank statements ────────────────────────────────────────────────────

export type BankStatement = {
  bank: "Chase" | "M&T" | "Liberty" | "Unknown";
  periodStart: string | null;
  periodEnd: string | null;
  beginning: number | null;
  ending: number | null;
};

export function parseBankStatement(raw: string, last4?: string | null): BankStatement {
  const t = sq(raw);
  const bank: BankStatement["bank"] = /liberty-bank\.com|Liberty Customer Service/i.test(t) ? "Liberty"
    : /M&T Bank|mtb\.com/i.test(t) ? "M&T"
    : /Chase|JPMorgan/i.test(t) ? "Chase" : "Unknown";

  let periodStart: string | null = null, periodEnd: string | null = null;
  const words = t.match(/([A-Z][a-z]{2,8}\.? \d{1,2},? \d{4}) (?:through|thru) ([A-Z][a-z]{2,8}\.? \d{1,2},? \d{4})/);
  const nums = t.match(/(\d{1,2}\/\d{1,2}\/\d{2,4}) ?- ?(\d{1,2}\/\d{1,2}\/\d{2,4})/);
  if (words) { periodStart = isoFromWords(words[1]); periodEnd = isoFromWords(words[2]); }
  else if (nums) { periodStart = isoFromMdy(nums[1]); periodEnd = isoFromMdy(nums[2]); }

  let ending: number | null = null, beginning: number | null = null;
  if (bank === "Liberty") {
    // The summary lists "<product> xxxxxxxx4756 $179,924.36" — the labels in
    // the body print apart from their figures, so read the summary line.
    const digits = last4?.replace(/^x/, "");
    const re = new RegExp(String.raw`x{4,}\s?${digits ?? String.raw`\d{4}`}\s+(\$[\d,]+\.\d{2})`, "i");
    const m = t.match(re);
    if (m) ending = amountOf(m[1]);
    const b = t.match(new RegExp(String.raw`BEGINNING BALANCE.*?(\$[\d,]+\.\d{2})`, "i"));
    if (b) beginning = amountOf(b[1]);
  } else {
    const e = t.match(new RegExp(String.raw`Ending\s*Balance:?\s*(?:\d{1,2}\s+)?(${AMT})`, "i"));
    if (e) ending = amountOf(e[1]);
    const b = t.match(new RegExp(String.raw`Beginning\s*Balance:?\s*(?:\d{1,2}\/\d{1,2}\/\d{2,4}\s+)?(${AMT})`, "i"));
    if (b) beginning = amountOf(b[1]);
  }
  return { bank, periodStart, periodEnd, beginning, ending };
}

/** The account's last four, read off the STATEMENT ITSELF (owner: "will you
 *  pull the account number … from the bank statement itself? that way we dont
 *  need to worry so much about the file name"). Chase prints the full number
 *  at the head of every page, M&T beside the product, Liberty masked. */
export function last4FromStatement(raw: string, bank: BankStatement["bank"]): string | null {
  const t = sq(raw);
  let m: RegExpMatchArray | null = null;
  if (bank === "Liberty") m = t.match(/x{4,}\s?(\d{4})\b/i);
  else if (bank === "M&T") m = t.match(/(?:CHECKING|SAVINGS|MONEY MARKET)\s+0*(\d{6,17})\b/i) ?? t.match(/ACCOUNT\s+0*(\d{8,17})\b/i);
  else if (bank === "Chase") m = t.match(/^\s*0*(\d{8,17})\b/) ?? t.match(/Account Number:?\s*0*(\d{8,17})/i);
  const digits = m?.[1];
  return digits && digits.length >= 4 ? `x${digits.slice(-4)}` : null;
}

// ── 2. Skyline Statement Reconcile Report (Marie's Rec1 / Rec2 / Rec2B) ──

export type OpenItem = { dateISO: string; ref: string; description: string; amount: number };

export type SkylineRec = {
  checkingKey: string | null;
  runDateISO: string | null;
  user: string | null;
  statementDateISO: string | null;
  statementBalance: number | null;
  adjustedStatementBalance: number | null;
  reconciledBalance: number | null;
  adjustedCheckBookBalance: number | null;
  /** Unreconciled Transactions — what is still open after this rec. */
  unreconciled: OpenItem[];
  inBalance: boolean;
};

export function isSkylineRec(raw: string): boolean {
  return /Statement\s*Reconcile\s*Report/i.test(raw);
}

function items(block: string): OpenItem[] {
  const out: OpenItem[] = [];
  const re = new RegExp(String.raw`(\d{2}\/\d{2}\/\d{4}) (\S+) (.*?) (${AMT})(?: (?:Debit|Credit))?(?= \d{2}\/\d{2}\/\d{4} |$)`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) {
    const amount = amountOf(m[4]);
    if (amount == null) continue;
    out.push({ dateISO: isoFromMdy(m[1])!, ref: m[2], description: m[3].trim(), amount });
  }
  return out;
}

export function parseSkylineRec(raw: string): SkylineRec {
  const t = sq(raw);
  const run = t.match(/Korman Commercial Properties, Inc (\d{1,2}\/\d{1,2}\/\d{4})/);
  const user = t.match(/(\b[A-Z]{3,})\s+User:/)?.[1] ?? null;

  // "Checking Account Key : Bank Name : JPM 7200 JPM 7200 ELBRIDGE SC OPER Statement Balance"
  let checkingKey: string | null = null;
  const kb = t.match(/Checking Account Key\s*:\s*Bank Name\s*:\s*(.*?)\s+Statement Balance/i);
  if (kb) {
    const s = kb[1];
    const prefix = s.match(/^(JPM|LB|M&T|WFB)/)?.[1];
    const at = prefix ? s.indexOf(prefix, prefix.length) : -1;
    checkingKey = (at > 0 ? s.slice(0, at) : s).trim();
  }

  const stmt = t.match(new RegExp(String.raw`Statement Balance Date Check No\. Description Amount Debit \/ Credit (\d{2}\/\d{2}\/\d{4}) (${AMT})`));
  const adjStmt = t.match(new RegExp(String.raw`(${AMT}) Adjusted Statement Balance`));
  const recon = t.match(new RegExp(String.raw`Adjusted Reconciled Balance (${AMT})`));
  const adjBook = t.match(new RegExp(String.raw`Adjusted Check Book Balance (${AMT})`));
  const unrecBlock = t.match(/Unreconciled Transactions Date Check No\. Description Amount Debit \/ Credit (.*?) Adjusted Check Book Balance/);

  return {
    checkingKey,
    runDateISO: run ? isoFromMdy(run[1]) : null,
    user,
    statementDateISO: stmt ? isoFromMdy(stmt[1]) : null,
    statementBalance: stmt ? amountOf(stmt[2]) : null,
    adjustedStatementBalance: adjStmt ? amountOf(adjStmt[1]) : null,
    reconciledBalance: recon ? amountOf(recon[1]) : null,
    adjustedCheckBookBalance: adjBook ? amountOf(adjBook[1]) : null,
    unreconciled: unrecBlock ? items(unrecBlock[1]) : [],
    inBalance: /\bIn Balance\b/.test(t) && !/Out of Balance/i.test(t),
  };
}

// ── 3. Skyline Checking Account Report (.xls) ─────────────────────────────

export type CheckingTxn = { dateISO: string; ref: string; description: string; amount: number; balance: number };
export type CheckingAccount = {
  key: string;
  bankName: string;
  inactive: boolean;
  balance: number;
  beginning: number | null;
  /** Account Ownership by Property/Company — the balance split by company. */
  ownership: { company: string; amount: number }[];
  txns: CheckingTxn[];
};
export type CheckingReport = { asOfISO: string | null; accounts: CheckingAccount[] };

/** Rows are the sheet as arrays (SheetJS `header: 1`), empty cells dropped. */
export function parseCheckingReport(rows: unknown[][]): CheckingReport {
  const clean = rows.map((r) => r.map((v) => String(v ?? "").trim()).filter((v) => v !== ""));
  let asOfISO: string | null = null;
  const accounts: CheckingAccount[] = [];
  let cur: CheckingAccount | null = null;
  for (const r of clean) {
    if (!r.length) continue;
    const asOf = r[0].match(/^as of (\d{1,2}\/\d{1,2}\/\d{4})/i);
    if (asOf && !asOfISO) { asOfISO = isoFromMdy(asOf[1]); continue; }
    if (/^Checking Account Key/i.test(r[0])) {
      cur = { key: (r[1] ?? "").trim(), bankName: "", inactive: false, balance: 0, beginning: null, ownership: [], txns: [] };
      accounts.push(cur);
      continue;
    }
    if (!cur) continue;
    if (r[0] === "Bank Name") { cur.bankName = r[1] ?? ""; cur.inactive = /INACTIVE|VOID/i.test(cur.bankName); continue; }
    if (r[0] === "Balance") { cur.balance = amountOf(r[1] ?? "") ?? 0; continue; }
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(r[0])) {
      const iso = isoFromMdy(r[0])!;
      if (/Beginning Balance/i.test(r.join(" "))) { cur.beginning = amountOf(r[r.length - 1]); continue; }
      // date | ref | description | amount | balance (ref may be blank)
      const amount = amountOf(r[r.length - 2] ?? ""), balance = amountOf(r[r.length - 1] ?? "");
      if (amount == null || balance == null) continue;
      const hasRef = r.length >= 5;
      cur.txns.push({ dateISO: iso, ref: hasRef ? r[1] : "", description: r[hasRef ? 2 : 1] ?? "", amount, balance });
      continue;
    }
    // Ownership lines: "4060" | "4,117,784.25" (a malformed export can drop a paren).
    if (r.length === 2 && /^[0-9A-Z]{3,6}$/.test(r[0])) {
      const amt = amountOf(r[1]) ?? amountOf(r[1].replace(/\)$/, "").replace(/^(?!\()/, "(") + ")");
      if (amt != null) cur.ownership.push({ company: r[0], amount: amt });
    }
  }
  return { asOfISO, accounts };
}

// ── The Skyline checking key for each tracker account ─────────────────────
// Skyline names its checking accounts its own way ("JPM HOME" is 9860, "JPM
// 2010 ESCROW" is NI LLC's x2190). A Rec PDF carries both the key and — in its
// file name — the last four, so a Rec on file confirms this map every month.

export const SKYLINE_KEY_BY_LAST4: Record<string, string> = {
  x3777: "M&T4900", x6119: "M&T2070", x6127: "M&T 204 208", x6055: "M&T 2000 CLEAR",
  x6063: "M&T 2,3,9,42,44", x4031: "M&T 150 920",
  x5615: "JPM 2300", x5631: "JPM 3610", x5656: "JPM 7010", x9629: "JPM 2010 OP",
  x1622: "JPM 2000 CLEAR", x5303: "JPM 1500 9200", x2190: "JPM 2010 ESCROW", x6088: "JPM 9500",
  x0669: "JPM5600", x1692: "JPM 7200", x0308: "JPM 8200", x8822: "JPM 0800", x9879: "JPM 1100",
  x1993: "JPM 3610A", x1235: "JPM 9510", x1896: "JPM 9000", x7857: "JPM 9800", x2296: "JPM 9820",
  x9579: "JPM 9840", x8563: "JPM HOME",
  x7216: "LB 2010 SD", x7448: "LB 4000 SD", x4756: "LB 7300", x6888: "LB 2300", x9436: "LB 7010",
  x0598: "LB 4500", x8276: "LB 2010 MM", x8086: "LB 4500 MM", x8177: "LB 7300 MM",
};

export const normKey = (k: string) => k.toUpperCase().replace(/\s+/g, "");

/** A Skyline checking key ("JPM 2010 ESCROW") → the tracker account it is. */
export function last4ForSkylineKey(key: string | null | undefined): string | null {
  if (!key) return null;
  const want = normKey(key);
  for (const [l4, k] of Object.entries(SKYLINE_KEY_BY_LAST4)) if (normKey(k) === want) return l4;
  return null;
}

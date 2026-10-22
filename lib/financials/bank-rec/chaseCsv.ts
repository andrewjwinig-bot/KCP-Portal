// Parse a Chase account-activity CSV export into BankTxn[].
//
// Header: Details,Posting Date,Description,Amount,Type,Balance,Check or Slip #
// Amounts are already signed (debits negative). The check/slip column holds the
// check number for CHECK_PAID rows; for AvidPay ACH debits it's blank and the
// number is embedded in the description (handled downstream by bankCheckNo).

import type { BankTxn } from "./reconcile";

/** Minimal CSV row splitter that respects double-quoted fields (descriptions
 *  contain commas). Returns an array of field arrays. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "", row: string[] = [], inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\r") { /* skip */ }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** "06/25/2026" → "2026-06-25" (ISO). */
function toISO(mdy: string): string {
  const m = mdy.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return mdy.trim();
  return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

export type ChaseParse = { txns: BankTxn[]; endingBalance: number | null };

export function parseChaseCsv(text: string): ChaseParse {
  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
  if (rows.length === 0) return { txns: [], endingBalance: null };

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.findIndex((h) => h === name);
  const iDate = col("posting date"), iDesc = col("description"), iAmt = col("amount");
  const iType = col("type"), iBal = col("balance"), iChk = col("check or slip #");

  const txns: BankTxn[] = [];
  let endingBalance: number | null = null;
  let topBalance: number | null = null;

  for (const r of rows.slice(1)) {
    const amtRaw = (r[iAmt] ?? "").replace(/[$,]/g, "").trim();
    const amount = Number(amtRaw);
    if (!amtRaw || Number.isNaN(amount)) continue;
    const bal = Number((r[iBal] ?? "").replace(/[$,]/g, "").trim());
    if (topBalance == null && !Number.isNaN(bal)) topBalance = bal; // first data row = most recent
    txns.push({
      date: toISO(r[iDate] ?? ""),
      amount,
      checkNo: (r[iChk] ?? "").trim() || null,
      description: (r[iDesc] ?? "").replace(/\s+/g, " ").trim(),
      type: (r[iType] ?? "").trim() || undefined,
    });
  }
  // Chase lists newest-first, so the first row's running balance is the latest
  // cleared balance. The true statement-ending balance should still be taken
  // from the statement; this is a convenience default.
  endingBalance = topBalance;
  return { txns, endingBalance };
}

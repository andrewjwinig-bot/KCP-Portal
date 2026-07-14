// Book side of a bank reconciliation, pulled from the operating-statement GL
// store. For a property/year, a GL cash account (e.g. 0110-0000), and a month,
// returns that month's opening + ending cash balance and its transactions —
// exactly what the reconcile() engine needs for the book side.

import "server-only";
import { assembledGl, assembledTransactions } from "@/lib/financials/operating-statements/statementStore";
import type { BookTxn } from "./reconcile";

export type CashAccount = { code: string; name: string };

export type BookSide = {
  opening: number;
  ending: number;
  txns: BookTxn[];
  /** Candidate cash accounts found in this GL (for the account picker). */
  cashAccounts: CashAccount[];
  coverageStartMonth: number;
  coverageEnd: number;
};

/** A GL account that looks like a bank/cash account: balance-sheet cash codes
 *  (01xx / 02xx) or a name mentioning cash / money market / security deposit. */
function isCashAccount(code: string, name: string): boolean {
  if (/^0[12]\d\d-/.test(code)) return true;
  return /\b(cash|money market|security dep)/i.test(name);
}

export async function loadBookSide(key: string, year: number, month: number, cashCode: string): Promise<BookSide | null> {
  const gl = await assembledGl(key, year);
  if (!gl) return null;
  const allTx = await assembledTransactions(key, year);

  const nets = gl.monthly[cashCode] ?? [];
  const begin = gl.beginning?.[cashCode] ?? 0;
  const sum = (a: number[]) => Math.round(a.reduce((s, n) => s + (n || 0), 0) * 100) / 100;
  const opening = Math.round((begin + sum(nets.slice(0, Math.max(0, month - 1)))) * 100) / 100;
  const ending = Math.round((begin + sum(nets.slice(0, month))) * 100) / 100;

  const txns: BookTxn[] = (allTx[cashCode] ?? [])
    .filter((t) => t.month === month)
    .map((t) => ({ date: t.date, ref: t.ref, vendor: t.vendor, description: t.description, amount: t.amount }));

  const cashAccounts: CashAccount[] = Object.keys(gl.monthly)
    .filter((code) => isCashAccount(code, gl.names?.[code] ?? ""))
    .map((code) => ({ code, name: gl.names?.[code] ?? code }))
    .sort((a, b) => a.code.localeCompare(b.code));

  return { opening, ending, txns, cashAccounts, coverageStartMonth: gl.coverageStartMonth ?? 1, coverageEnd: gl.coverageEnd ?? gl.maxPeriodInFile };
}

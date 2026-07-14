// Book side of a bank reconciliation, pulled from the operating-statement GL
// store. For a property/year, a GL cash account (e.g. 0110-0000), and a month,
// returns that month's opening + ending cash balance and its transactions —
// exactly what the reconcile() engine needs for the book side.
//
// Fund-aware: a JV account (e.g. JV III, buildings 3610/3620/3640 under PJV3)
// shares one bank account, so its cash is aggregated across every fund-member
// GL — the same consolidation the cash analysis uses. That way a rec finds the
// GL Drew uploaded whether it's stored under the fund key or a building key.

import "server-only";
import { assembledTransactions, listFullGls } from "@/lib/financials/operating-statements/statementStore";
import { assembleGls } from "@/lib/financials/operating-statements/glAssemble";
import { FUND_BUILDINGS, glKeysFor } from "@/lib/financials/cash-analysis/funds";
import type { StoredGl } from "@/lib/financials/operating-statements/statementStore";
import type { BookTxn } from "./reconcile";

export type CashAccount = { code: string; name: string };

export type BookSide = {
  opening: number;
  ending: number;
  txns: BookTxn[];
  cashAccounts: CashAccount[];
  coverageStartMonth: number;
  coverageEnd: number;
};

/** The fund shell for a key: a fund member (3610) maps to its fund (PJV3); a
 *  fund shell or standalone property maps to itself. */
function fundShellFor(key: string): string {
  if (FUND_BUILDINGS[key] || FUND_BUILDINGS[key.toUpperCase()]) return key;
  for (const [fund, members] of Object.entries(FUND_BUILDINGS)) {
    if (members.includes(key)) return fund;
  }
  return key;
}

function isCashAccount(code: string, name: string): boolean {
  if (/^0[12]\d\d-/.test(code)) return true;
  return /\b(cash|money market|security dep)/i.test(name);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function loadBookSide(key: string, year: number, month: number, cashCode: string): Promise<BookSide | null> {
  const shell = fundShellFor(key);
  const searchKeys = glKeysFor(shell); // [shell, ...members] for a fund, else [key]
  const all = await listFullGls();

  // Assemble each key's uploads (revisions), then aggregate the cash account
  // across keys — a fund's cash is the sum of its buildings.
  const assembled: StoredGl[] = [];
  for (const k of searchKeys) {
    const gl = assembleGls(all.filter((g) => g.key === k && g.year === year));
    if (gl) assembled.push(gl);
  }
  if (assembled.length === 0) return null;

  let begin = 0;
  const nets = Array(12).fill(0);
  const names: Record<string, string> = {};
  let coverageStartMonth = 12;
  let coverageEnd = 0;
  for (const gl of assembled) {
    begin += gl.beginning?.[cashCode] ?? 0;
    const m = gl.monthly[cashCode] ?? [];
    for (let i = 0; i < 12; i++) nets[i] += m[i] || 0;
    for (const [c, n] of Object.entries(gl.names ?? {})) names[c] = n;
    coverageStartMonth = Math.min(coverageStartMonth, gl.coverageStartMonth ?? 1);
    coverageEnd = Math.max(coverageEnd, gl.coverageEnd ?? gl.maxPeriodInFile);
  }

  const sum = (a: number[]) => round2(a.reduce((s, n) => s + (n || 0), 0));
  const opening = round2(begin + sum(nets.slice(0, Math.max(0, month - 1))));
  const ending = round2(begin + sum(nets.slice(0, month)));

  // Transactions merged fund-wide (assembledTransactions is glKeysFor-aware).
  const allTx = await assembledTransactions(shell, year);
  const txns: BookTxn[] = (allTx[cashCode] ?? [])
    .filter((t) => t.month === month)
    .map((t) => ({ date: t.date, ref: t.ref, vendor: t.vendor, description: t.description, amount: t.amount }));

  // Cash accounts present across the assembled GLs (for the picker).
  const codes = new Set<string>();
  for (const gl of assembled) for (const c of Object.keys(gl.monthly)) codes.add(c);
  const cashAccounts: CashAccount[] = [...codes]
    .filter((code) => isCashAccount(code, names[code] ?? ""))
    .map((code) => ({ code, name: names[code] ?? code }))
    .sort((a, b) => a.code.localeCompare(b.code));

  return { opening, ending, txns, cashAccounts, coverageStartMonth: coverageStartMonth === 12 ? 1 : coverageStartMonth, coverageEnd };
}

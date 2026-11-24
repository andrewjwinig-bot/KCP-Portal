// A property's BANK BALANCE OVER TIME, off the weekly Bank Balances imports
// (owner: "you also have bank balances over time for each property which could
// be interesting trend"). Pure and client-safe.
//
// Each import writes a dated snapshot of the accounts it carried, and the three
// banks are imported separately — so a line's balance on a date is each of its
// accounts' NEWEST figure at or before that date, and a date is a point only
// once every account on the line has a figure.

import { BALANCE_ACCOUNTS, accountId, entityFor, type BalanceEntity } from "./entities";
import type { Snapshot } from "./weekOverWeek";

export type BalancePoint = { date: string; balance: number };
export type BalanceTrend = { key: string; name: string; accounts: number; points: BalancePoint[] };

/** The bank line a property's cash sits on: its own, else the fund / joint
 *  line that carries it (a JV III building banks through JV III's account). */
export function balanceLineFor(code: string): BalanceEntity | null {
  const up = code.toUpperCase();
  const lines = BALANCE_ACCOUNTS.map(entityFor).filter((e) => !e.restricted);
  return lines.find((e) => e.key.toUpperCase() === up)
    ?? lines.find((e) => e.reserveCodes.some((c) => c.toUpperCase() === up))
    ?? null;
}

export function balanceTrend(code: string, snapshots: Snapshot[]): BalanceTrend | null {
  const line = balanceLineFor(code);
  if (!line) return null;
  const ids = BALANCE_ACCOUNTS.filter((a) => entityFor(a).key === line.key).map((a) => accountId(a.bank, a.last4));
  if (!ids.length) return null;
  const snaps = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  const cur = new Map<string, number>();
  const points: BalancePoint[] = [];
  for (const s of snaps) {
    let touched = false;
    for (const id of ids) {
      const v = s.accounts[id];
      if (v && typeof v.balance === "number") { cur.set(id, v.balance); touched = true; }
    }
    if (!touched || cur.size < ids.length) continue;
    const balance = Math.round([...cur.values()].reduce((t, v) => t + v, 0));
    if (points.length && points[points.length - 1].date === s.date) points[points.length - 1].balance = balance;
    else points.push({ date: s.date, balance });
  }
  return { key: line.key, name: line.name, accounts: ids.length, points };
}

// THE PORTFOLIO OVER TIME — the Bank Balances header tiles, clickable (owner:
// "click the header KPI pills at the top to see line charts over time"). Same
// rule as one line: each account's NEWEST figure at or before the date, and a
// date is a point only once every BANK seen in the snapshots has been
// imported (Chase, Liberty and M&T come in separately — a date with only one
// of them would read as a cash collapse). Accrued accounts (the Leonard Korman
// Trust, never imported) are accrued to each date, as the page does today.
export type PortfolioPoint = {
  date: string;
  /** Every mapped account — the "Cash in bank" tile. */
  cash: number;
  /** Security-deposit lines — tenants' money. */
  deposits: number;
  /** Hands-off money (the accrued trust), held back in full. */
  handsOff: number;
  /** cash − deposits − hands-off: what reserves come out of. */
  operating: number;
};

export function portfolioTrend(
  snapshots: Snapshot[],
  accrued: { id: string; balanceOn: (date: string) => number }[] = [],
): PortfolioPoint[] {
  const known = new Map<string, { bank: string; restricted: boolean }>();
  for (const a of BALANCE_ACCOUNTS) known.set(accountId(a.bank, a.last4), { bank: String(a.bank), restricted: !!entityFor(a).restricted });
  const accruedIds = new Set(accrued.map((a) => a.id));
  const snaps = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  const banks = new Set<string>();
  for (const s of snaps) for (const id of Object.keys(s.accounts)) { const k = known.get(id); if (k && !accruedIds.has(id)) banks.add(k.bank); }
  const cur = new Map<string, number>();
  const seen = new Set<string>();
  const out: PortfolioPoint[] = [];
  for (const s of snaps) {
    for (const [id, v] of Object.entries(s.accounts)) {
      const k = known.get(id);
      if (!k || !v || typeof v.balance !== "number") continue;
      cur.set(id, v.balance);
      if (!accruedIds.has(id)) seen.add(k.bank);
    }
    if ([...banks].some((b) => !seen.has(b))) continue;
    let cash = 0, deposits = 0, handsOff = 0;
    for (const [id, bal] of cur) {
      if (accruedIds.has(id)) continue;
      cash += bal;
      if (known.get(id)!.restricted) deposits += bal;
    }
    for (const a of accrued) {
      const bal = cur.get(a.id) ?? a.balanceOn(s.date);
      cash += bal; handsOff += bal;
    }
    const p = { date: s.date, cash: Math.round(cash), deposits: Math.round(deposits), handsOff: Math.round(handsOff), operating: Math.round(cash - deposits - handsOff) };
    if (out.length && out[out.length - 1].date === s.date) out[out.length - 1] = p; else out.push(p);
  }
  return out;
}

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

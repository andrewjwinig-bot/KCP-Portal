// The imported bank cash, by the Cash Analysis line it lands on — what the
// budget's Projected Bank Balance opens on (owner: "unhide the live bank
// balances on the budgets … using current balance plus reprojections").
// Restricted accounts (tenant security deposits) are never counted. Pure, so
// it is tested directly; `bankCashFor` is the storage-backed wrapper.

import { BALANCE_ACCOUNTS, accountId, entityFor } from "./entities";
import { PROPERTY_DEFS } from "@/lib/properties/data";

export type LineCash = {
  key: string;
  balance: number;
  /** The OLDEST as-of among its accounts — the date the whole figure is good to. */
  asOf: string;
  accounts: { bank: string; last4: string; name: string; balance: number; asOf: string }[];
};

type Stored = { bank: string; last4: string; name: string; balance: number; asOf: string };

export function cashByLine(accounts: Record<string, Stored>): Map<string, LineCash> {
  const out = new Map<string, LineCash>();
  for (const a of BALANCE_ACCOUNTS) {
    const e = entityFor(a);
    if (e.restricted) continue;
    const b = accounts[accountId(a.bank, a.last4)];
    if (!b) continue;
    const line = out.get(e.key) ?? { key: e.key, balance: 0, asOf: b.asOf, accounts: [] };
    if (line.accounts.some((x) => x.bank === b.bank && x.last4 === b.last4)) continue;
    line.accounts.push({ bank: b.bank, last4: b.last4, name: b.name || a.accountName, balance: b.balance, asOf: b.asOf });
    line.balance = Math.round((line.balance + b.balance) * 100) / 100;
    if (b.asOf < line.asOf) line.asOf = b.asOf;
    out.set(e.key, line);
  }
  return out;
}

/** The fund line a building banks through (JV III → PJV3, NI LLC → PNIPLX). */
export function fundLineOf(code: string): string | null {
  const g = PROPERTY_DEFS.find((p) => p.id === String(code).toUpperCase())?.fundGroup;
  return g === "JV III" ? "PJV3" : g === "NI LLC" ? "PNIPLX" : null;
}

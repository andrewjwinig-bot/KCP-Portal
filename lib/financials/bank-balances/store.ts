// Imported bank balances. `latest` holds each account's most recent figure —
// an import updates only the accounts it carries, so the three banks can be
// imported separately and on different days — and every import also writes a
// dated snapshot (`snap-YYYY-MM-DD`) so a week's balances can be read back.

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";
import type { BankName, ParsedStatement } from "./parse";
import { accountId } from "./entities";

const PREFIX = "bank-balances";

export type StoredBalance = {
  bank: BankName;
  last4: string;
  name: string;
  balance: number;
  available: number | null;
  /** The date the bank says the balance is as of, else the import date. */
  asOf: string;
  importedAt: string;
  importedBy: string | null;
};
export type BalanceDoc = { accounts: Record<string, StoredBalance>; updatedAt: string | null };

export async function loadBalances(): Promise<BalanceDoc> {
  const d = (await getJSON(PREFIX, "latest")) as BalanceDoc | null;
  return d && typeof d === "object" && d.accounts ? d : { accounts: {}, updatedAt: null };
}

/** Today in Eastern time, as YYYY-MM-DD. */
export function todayET(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export async function saveImport(statements: ParsedStatement[], by: string | null): Promise<{ accounts: number; asOf: string[] }> {
  const doc = await loadBalances();
  const now = new Date().toISOString();
  const today = todayET();
  const snaps: Record<string, Record<string, StoredBalance>> = {};
  let n = 0;
  for (const s of statements) {
    const asOf = s.asOf ?? today;
    for (const a of s.accounts) {
      const rec: StoredBalance = { bank: s.bank, last4: a.last4, name: a.name, balance: a.balance, available: a.available, asOf, importedAt: now, importedBy: by };
      const id = accountId(s.bank, a.last4);
      // An older export never replaces a newer balance.
      const cur = doc.accounts[id];
      if (!cur || cur.asOf <= asOf) doc.accounts[id] = rec;
      (snaps[asOf] ??= {})[id] = rec;
      n++;
    }
  }
  doc.updatedAt = now;
  await storeJSON(PREFIX, "latest", doc);
  for (const [date, accts] of Object.entries(snaps)) {
    const prev = ((await getJSON(PREFIX, `snap-${date}`)) as { accounts?: Record<string, StoredBalance> } | null)?.accounts ?? {};
    await storeJSON(PREFIX, `snap-${date}`, { date, accounts: { ...prev, ...accts } });
  }
  return { accounts: n, asOf: Object.keys(snaps).sort() };
}

// Per-account bank balances — the actual bank-statement balance for each bank
// account, entered manually so the Cash Sheet can tie its computed (book) cash
// out to the bank and surface the variance. One blob per month, keyed "YYYY-MM";
// inside, balances are keyed by account last4 (the same identity the bank-account
// chips dedupe on — shared accounts like the M&T x6063 carry one balance).

import "server-only";
import { storeJSON, getJSON } from "@/lib/storage";

const PREFIX = "financials-bank-balances";

export type BankBalanceEntry = { amount: number; updatedAt: string; updatedBy?: string };
export type BankBalanceMonth = {
  ym: string;
  balances: Record<string, BankBalanceEntry>; // keyed by account last4
  updatedAt: string;
};

export async function getBankBalances(ym: string): Promise<BankBalanceMonth | null> {
  return (await getJSON(PREFIX, ym)) as BankBalanceMonth | null;
}

/** Upsert one account's bank balance for a month (null clears it). */
export async function setBankBalance(params: {
  ym: string;
  last4: string;
  amount: number | null;
  updatedBy?: string;
}): Promise<BankBalanceMonth> {
  const { ym, last4, amount, updatedBy } = params;
  const now = new Date().toISOString();
  const doc = (await getBankBalances(ym)) ?? { ym, balances: {}, updatedAt: now };
  if (amount == null) delete doc.balances[last4];
  else doc.balances[last4] = { amount, updatedAt: now, updatedBy };
  doc.updatedAt = now;
  await storeJSON(PREFIX, ym, doc);
  return doc;
}

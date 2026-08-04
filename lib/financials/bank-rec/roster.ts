// The roster of bank accounts to reconcile — derived from the canonical account
// registry (UNIQUE_BANK_ACCOUNTS), the same list the Bank Acc Tracker and Bank
// Transfers use. Pure (client + server), so the page and API share it.

import { UNIQUE_BANK_ACCOUNTS, type BankGroup } from "@/lib/bank-rec/accounts";

export type RecAccount = {
  bank: BankGroup;
  last4: string;
  name: string;
  /** The account's registry key (e.g. "JPM 1100"), for display + selection. */
  key: string;
  /** Property/entity key for the GL lookup (first of a shared "1500/9200"). */
  propertyKey: string | null;
  /** A GL cash account code hinted in the registry key, e.g. "(0110-0000)". */
  cashHint: string | null;
};

export function recAccounts(): RecAccount[] {
  return UNIQUE_BANK_ACCOUNTS.map((a) => {
    const m = a.key.match(/\((\d{4}-\d{4})\)/);
    return {
      bank: a.bank,
      last4: a.last4,
      name: a.accountName,
      key: a.key || a.last4,
      propertyKey: a.propertyCode ? a.propertyCode.split("/")[0].trim() : null,
      cashHint: m ? m[1] : null,
    };
  });
}

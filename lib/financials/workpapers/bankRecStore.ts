// Marie's Statement Reconcile Reports imported for the workpapers, one record
// per month (YYYY-MM). A re-import of an account keeps whichever report was
// run later; every other account in the month is kept.
import "server-only";
import { createMapStore } from "@/lib/collectionStore";
import { isSkylineRec, parseSkylineRec, last4ForSkylineKey, last4FromName } from "@/lib/bank-rec/monthFiles";
import { pdfText } from "@/lib/pdf/pdfText";
import { laterRec, recAccountOf, recMonth, REC_ACCOUNTS, type RecAccount } from "./bankRecs";

export interface StoredBankRecs {
  month: string;
  importedAt: string;
  by: string | null;
  accounts: Record<string, RecAccount>;
}

const store = createMapStore<StoredBankRecs>({ prefix: "workpaper-bank-recs" });

export async function getBankRecs(month: string): Promise<StoredBankRecs | null> {
  return store.get(month);
}

/** The PDF's text, when it is a Statement Reconcile Report; else null. */
export async function recText(buf: Buffer): Promise<string | null> {
  const text = await pdfText(buf).catch(() => null);
  return text && isSkylineRec(text) ? text : null;
}

export type BankRecImport = { month: string; last4: string; key: string | null; bookBalance: number; inBalance: boolean; statementDateISO: string };

export async function importBankRec(text: string, file: string, by: string | null): Promise<BankRecImport> {
  const rec = parseSkylineRec(text);
  // The checking key on the report decides the account; the file name only
  // when Skyline's key is one the map doesn't know.
  const last4 = last4ForSkylineKey(rec.checkingKey) ?? last4FromName(file);
  if (!last4) throw new Error(`Couldn't tell which account "${rec.checkingKey ?? file}" is.`);
  const acct = recAccountOf(rec, last4, file);
  if (!acct) throw new Error("Couldn't read the statement date or the Adjusted Check Book Balance on this report.");
  const month = recMonth(acct.statementDateISO!);
  const prior = await store.get(month);
  const accounts = { ...(prior?.accounts ?? {}) };
  accounts[last4] = laterRec(accounts[last4], acct);
  await store.set(month, { month, importedAt: new Date().toISOString(), by, accounts });
  return { month, last4, key: REC_ACCOUNTS[last4]?.key ?? null, bookBalance: acct.bookBalance, inBalance: acct.inBalance, statementDateISO: acct.statementDateISO! };
}

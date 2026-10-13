import "server-only";
import { loadBalances } from "./store";
import { cashByLine, type LineCash } from "./lineCash";

/** The imported bank cash for a Cash Analysis line, or null when none is imported. */
export async function bankCashFor(key: string): Promise<LineCash | null> {
  const doc = await loadBalances().catch(() => null);
  if (!doc) return null;
  return cashByLine(doc.accounts).get(String(key).toUpperCase()) ?? null;
}

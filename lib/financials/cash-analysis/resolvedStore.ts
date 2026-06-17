// Cash Analysis — GL accounts a reviewer has marked "resolved" (confirmed not a
// cash item that needs mapping). They're then hidden from the Unmapped review.
// They never affected the buckets (unmapped accounts aren't bucketed); this just
// clears the review list. One small blob.

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";

const PREFIX = "financials-cash-analysis-resolved";
const ID = "accounts";

export async function getResolvedAccounts(): Promise<string[]> {
  const rec = (await getJSON(PREFIX, ID)) as { accounts?: string[] } | null;
  return rec?.accounts ?? [];
}

export async function setAccountResolved(account: string, resolved: boolean): Promise<string[]> {
  const cur = new Set(await getResolvedAccounts());
  if (resolved) cur.add(account.trim()); else cur.delete(account.trim());
  await storeJSON(PREFIX, ID, { accounts: [...cur], updatedAt: new Date().toISOString() });
  return [...cur];
}

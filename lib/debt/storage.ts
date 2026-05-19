// Debt Tracker storage. Single-manifest pattern (same as reservations /
// maintenance) — one GET per page load, one GET+PUT per save. Seeds from
// the Korman Schedule of Debt Outstanding on first read.

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";
import { SEED_LOANS, type Loan } from "@/lib/debt/amortization";

const MANIFEST_PREFIX = "debt-manifest";
const MANIFEST_ID = "all";

type Manifest = { loans: Loan[]; updatedAt: string };

export async function listLoans(): Promise<Loan[]> {
  const m = (await getJSON(MANIFEST_PREFIX, MANIFEST_ID)) as Manifest | null;
  if (m && Array.isArray(m.loans)) return m.loans;
  await saveLoans(SEED_LOANS);
  return SEED_LOANS;
}

export async function saveLoans(loans: Loan[]): Promise<void> {
  await storeJSON(MANIFEST_PREFIX, MANIFEST_ID, {
    loans,
    updatedAt: new Date().toISOString(),
  });
}

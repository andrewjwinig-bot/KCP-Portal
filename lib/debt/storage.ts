// Debt Tracker storage. Single-manifest pattern (same as reservations /
// maintenance) — one GET per page load, one GET+PUT per save. Seeds from
// the Korman Schedule of Debt Outstanding on first read.

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";
import { SEED_LOANS, MANAGED_LOANS, type Loan } from "@/lib/debt/amortization";

const MANIFEST_PREFIX = "debt-manifest";
const MANIFEST_ID = "all";

type Manifest = { loans: Loan[]; updatedAt: string };

// The loan book is maintained in code from the monthly Liberty mortgage
// statements, so each managed loan is reconciled to its canonical
// definition on every load. Any extra (manually added) loans are kept.
function reconcileManaged(loans: Loan[]): { loans: Loan[]; changed: boolean } {
  const managedIds = new Set(MANAGED_LOANS.map((l) => l.id));
  const extras = loans.filter((l) => !managedIds.has(l.id));
  const next = [...MANAGED_LOANS, ...extras];
  const changed = JSON.stringify(next) !== JSON.stringify(loans);
  return { loans: next, changed };
}

export async function listLoans(): Promise<Loan[]> {
  const m = (await getJSON(MANIFEST_PREFIX, MANIFEST_ID)) as Manifest | null;
  if (m && Array.isArray(m.loans)) {
    const { loans, changed } = reconcileManaged(m.loans);
    if (changed) await saveLoans(loans);
    return loans;
  }
  await saveLoans(SEED_LOANS);
  return SEED_LOANS;
}

export async function saveLoans(loans: Loan[]): Promise<void> {
  await storeJSON(MANIFEST_PREFIX, MANIFEST_ID, {
    loans,
    updatedAt: new Date().toISOString(),
  });
}

// Debt Tracker storage. Single-manifest pattern (same as reservations /
// maintenance) — one GET per page load, one GET+PUT per save. Seeds from
// the Korman Schedule of Debt Outstanding on first read.

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";
import { SEED_LOANS, NI_LLC_4000_LOAN, type Loan } from "@/lib/debt/amortization";

const MANIFEST_PREFIX = "debt-manifest";
const MANIFEST_ID = "all";

type Manifest = { loans: Loan[]; updatedAt: string };

// The NI LLC (4000) loan carries a pending amendment the edit UI can't
// express, so it stays code-managed: the stored copy is reconciled to the
// canonical definition on every load.
function reconcileManaged(loans: Loan[]): { loans: Loan[]; changed: boolean } {
  const idx = loans.findIndex((l) => l.id === NI_LLC_4000_LOAN.id);
  if (idx < 0) return { loans: [...loans, NI_LLC_4000_LOAN], changed: true };
  if (JSON.stringify(loans[idx]) === JSON.stringify(NI_LLC_4000_LOAN)) {
    return { loans, changed: false };
  }
  const next = [...loans];
  next[idx] = NI_LLC_4000_LOAN;
  return { loans: next, changed: true };
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

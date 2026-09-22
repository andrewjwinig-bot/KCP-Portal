// Leasing assumptions for the budget draft (Phase 2).
//
// Turns the draft's "these leases expire / these spaces are vacant" flags into
// editable renew / vacate / lease-up decisions that flow straight back into the
// rental projection. Stored per (budget year, property) so a building's whole
// set of assumptions lives in one document, keyed by unit.

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";

const PREFIX = "budget-leasing-assumptions";
const idFor = (budgetYear: number, propertyCode: string) => `${budgetYear}-${propertyCode.toUpperCase()}`;

/** `hold` is a DECISION too — "no change" (hold the current lease, or leave a
 *  vacancy vacant). It used to be saved as nothing, so a space someone had
 *  looked at and a space nobody had touched were indistinguishable, and the
 *  card could never say it was finished. */
export type LeaseAssumptionKind = "renew" | "vacate" | "leaseup" | "hold";

export type LeaseAssumption = {
  unitRef: string;
  kind: LeaseAssumptionKind;
  /** New monthly rent — for a renewal at a changed rate, or a lease-up. Omit a
   *  renewal rate to hold the current rent. */
  monthlyRent?: number;
  /** 1–12: the month the change takes effect — when the new/renewal rent starts,
   *  the vacate takes hold, or the lease-up space starts paying. */
  startMonth?: number;
  /** The assumed lease TERM in years — for a renewal, the new term; for a
   *  lease-up, the new lease's. It does not move this year's rent (the budget
   *  is one year); it records the deal, which later years and the leasing
   *  commission estimate need. */
  termYears?: number;
  notes?: string;
  updatedAt?: string;
  /** Who made the call — the owner (Harry / Nancy), or Drew in the review. */
  updatedBy?: string;
};

type Doc = { assumptions: Record<string, LeaseAssumption> };

async function loadDoc(budgetYear: number, propertyCode: string): Promise<Doc> {
  return ((await getJSON(PREFIX, idFor(budgetYear, propertyCode))) as Doc | null) ?? { assumptions: {} };
}

/** All assumptions across the given property codes, keyed by unitRef. */
export async function getLeasingAssumptions(budgetYear: number, codes: string[]): Promise<Record<string, LeaseAssumption>> {
  const out: Record<string, LeaseAssumption> = {};
  for (const code of codes) {
    const doc = await loadDoc(budgetYear, code);
    for (const [ref, a] of Object.entries(doc.assumptions)) out[ref] = a;
  }
  return out;
}

/** Upsert (or clear, when `kind` is null) one unit's assumption. */
export async function setLeasingAssumption(
  budgetYear: number,
  propertyCode: string,
  a: (Omit<LeaseAssumption, "updatedAt" | "kind"> & { kind: LeaseAssumptionKind | null }),
): Promise<void> {
  const doc = await loadDoc(budgetYear, propertyCode);
  if (a.kind === null) {
    delete doc.assumptions[a.unitRef];
  } else {
    doc.assumptions[a.unitRef] = {
      unitRef: a.unitRef, kind: a.kind,
      monthlyRent: a.monthlyRent, startMonth: a.startMonth, termYears: a.termYears, notes: a.notes,
      updatedBy: a.updatedBy,
      updatedAt: new Date().toISOString(),
    };
  }
  await storeJSON(PREFIX, idFor(budgetYear, propertyCode), doc);
}

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
// "stop" backs out a lease that is IN PLACE — a tenant who will not pay
// (Rite Aid at 7010, in bankruptcy): no rent, and so no recoveries, from
// `startMonth` on, whatever the lease or the schedule says.
export const LEASE_KINDS = ["renew", "vacate", "leaseup", "hold", "stop"] as const;
export type LeaseAssumptionKind = (typeof LEASE_KINDS)[number];
/** The ONE list of decisions a save may carry. The budget page's route had
 *  its own copy, which "stop" never reached — a back-out was refused as
 *  "invalid kind" and nothing was saved. */
export const isLeaseKind = (k: unknown): k is LeaseAssumptionKind => (LEASE_KINDS as readonly unknown[]).includes(k);

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
  /** The rent as keyed: ANNUAL $ per SF. `monthlyRent` is derived from it
   *  (× the suite's SF ÷ 12) and is what the projection reads. */
  rentPsf?: number;
  /** Tenant improvement allowance, $ per SF — lands on the Tenant
   *  improvements capital line in the month the new rent starts. */
  tiPsf?: number;
  /** Leasing commission, PERCENT of the rent over the term (annual rent ×
   *  term years) — lands on Outside Leasing Commissions (1940-8501). */
  lcPct?: number;
  notes?: string;
  updatedAt?: string;
  /** Who made the call — the owner (Harry / Nancy), or Drew in the review. */
  updatedBy?: string;
};

/** Units whose SEEDED decision someone undid — kept so the seed does not come back. */
type Doc = { assumptions: Record<string, LeaseAssumption>; cleared?: string[] };

/**
 * Decisions made at the owner's instruction, applied to every budget year from
 * `fromYear` unless a saved decision replaces them. Undoing one on the page
 * ("Keeps paying") records the unit in `cleared`, so it stays undone.
 *
 * Rite Aid at Parkwood (7010-12311) is in bankruptcy and will not pay; the
 * owner asked for its rent backed out, and the page's own save refused the
 * back-out at the time (its route had a stale list of decisions).
 */
const SEEDED: { code: string; fromYear: number; a: LeaseAssumption }[] = [
  { code: "7010", fromYear: 2027, a: { unitRef: "7010-12311", kind: "stop", startMonth: 1, notes: "Rite Aid — in bankruptcy, will not pay.", updatedBy: "ANDREW" } },
];
const seedFor = (budgetYear: number, code: string) =>
  SEEDED.filter((x) => x.code === String(code).toUpperCase() && budgetYear >= x.fromYear).map((x) => x.a);

async function loadDoc(budgetYear: number, propertyCode: string): Promise<Doc> {
  return ((await getJSON(PREFIX, idFor(budgetYear, propertyCode))) as Doc | null) ?? { assumptions: {} };
}

/** All assumptions across the given property codes, keyed by unitRef. */
export async function getLeasingAssumptions(budgetYear: number, codes: string[]): Promise<Record<string, LeaseAssumption>> {
  const out: Record<string, LeaseAssumption> = {};
  for (const code of codes) {
    const doc = await loadDoc(budgetYear, code);
    for (const a of seedFor(budgetYear, code)) {
      if (!doc.assumptions[a.unitRef] && !doc.cleared?.includes(a.unitRef)) out[a.unitRef] = a;
    }
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
  const seeded = seedFor(budgetYear, propertyCode).some((x) => x.unitRef === a.unitRef);
  if (a.kind === null) {
    delete doc.assumptions[a.unitRef];
    if (seeded) doc.cleared = [...new Set([...(doc.cleared ?? []), a.unitRef])];
  } else {
    if (doc.cleared) doc.cleared = doc.cleared.filter((u) => u !== a.unitRef);
    doc.assumptions[a.unitRef] = {
      unitRef: a.unitRef, kind: a.kind,
      // EVERY field the card keys is kept. rentPsf / tiPsf / lcPct were added
      // to the type and the route but not here, so a lease-up saved with no
      // rent (it projected $0) and no TI or commission ever reached the budget.
      monthlyRent: a.monthlyRent, rentPsf: a.rentPsf, tiPsf: a.tiPsf, lcPct: a.lcPct,
      startMonth: a.startMonth, termYears: a.termYears, notes: a.notes,
      updatedBy: a.updatedBy,
      updatedAt: new Date().toISOString(),
    };
  }
  await storeJSON(PREFIX, idFor(budgetYear, propertyCode), doc);
}


/**
 * A leasing decision as posted by the page, cleaned into what is stored — ONE
 * implementation for the budget page's route and the Rent Roll Review link's.
 * Returns the error to report when the body is not a decision.
 *
 * A start month is kept only for a VACANT space (an existing tenant's dates come
 * from the lease). Rent is keyed as ANNUAL $/SF, with the derived monthly figure
 * alongside. TI and the commission belong to a DEAL — a renewal, a lease-up, or
 * a tenant held at today's rent for a new term.
 */
export function leasingDecisionFromBody(
  b: Record<string, unknown> | null | undefined,
  updatedBy: string,
): { ok: true; decision: Omit<LeaseAssumption, "updatedAt" | "kind"> & { kind: LeaseAssumptionKind | null } } | { ok: false; error: string } {
  const unitRef = String(b?.unitRef ?? "").trim();
  if (!unitRef) return { ok: false, error: "unitRef required" };
  const kind = (b?.kind ?? null) as LeaseAssumptionKind | null;
  if (kind !== null && !isLeaseKind(kind)) return { ok: false, error: "invalid kind" };
  const num = (v: unknown) => (v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined);
  const psf = (v: unknown) => { const n = num(v); return n != null && n >= 0 ? n : undefined; };
  const startMonth = num(b?.startMonth) != null ? Math.min(12, Math.max(1, Number(b!.startMonth))) : undefined;
  const termYears = num(b?.termYears) != null && Number(b!.termYears) > 0 ? Math.min(30, Number(b!.termYears)) : undefined;
  const newRent = kind === "renew" || kind === "leaseup";
  const deal = newRent || kind === "hold";
  const lc = psf(b?.lcPct);
  return {
    ok: true,
    decision: {
      unitRef, kind,
      monthlyRent: newRent ? num(b?.monthlyRent) : undefined,
      startMonth: kind === "leaseup" || kind === "stop" ? startMonth : undefined,
      termYears,
      rentPsf: newRent ? psf(b?.rentPsf) : undefined,
      tiPsf: deal ? psf(b?.tiPsf) : undefined,
      lcPct: deal && lc != null && lc <= 100 ? lc : undefined,
      notes: typeof b?.notes === "string" ? b.notes : undefined,
      updatedBy,
    },
  };
}

// Leasing assumptions for the budget draft (Phase 2).
//
// Turns the draft's "these leases expire / these spaces are vacant" flags into
// editable renew / vacate / lease-up decisions that flow straight back into the
// rental projection.
//
// ONE DOCUMENT PER SUITE (`budget-leasing-units/<year>-<code>/<unit>`). It was
// one document per property, rewritten whole on every save — read, change one
// suite, write it all back — so any save working from an out-of-date copy
// (another tab, Harry's review link, a cached read) wrote back a document
// WITHOUT the decision just made. Drew keyed a lease-up at 9510-416, saw it
// saved ("✓ Drew 2:20 PM"), refreshed, and it was gone. A save now writes only
// its own suite, so it cannot erase another. The old per-property document is
// still READ, under the suites' own documents, so nothing saved before is lost.

import "server-only";
import { getJSON, listJSON, storeJSON } from "@/lib/storage";

const PREFIX = "budget-leasing-assumptions";
const idFor = (budgetYear: number, propertyCode: string) => `${budgetYear}-${propertyCode.toUpperCase()}`;
const UNIT_PREFIX = (budgetYear: number, propertyCode: string) => `budget-leasing-units/${idFor(budgetYear, propertyCode)}`;
/** A storage-safe id for a unit ref (kept inside the document as written). */
const unitId = (unitRef: string) => unitRef.trim().toUpperCase().replace(/[^A-Z0-9\-_]/g, "_");
/** One suite's call — `assumption: null` records that it was CLEARED. */
type UnitDoc = { unitRef: string; assumption: LeaseAssumption | null; at: string };

/** `hold` is a DECISION too — "no change" (hold the current lease, or leave a
 *  vacancy vacant). It used to be saved as nothing, so a space someone had
 *  looked at and a space nobody had touched were indistinguishable, and the
 *  card could never say it was finished. */
// "stop" backs out a lease that is IN PLACE — a tenant who will not pay
// (Rite Aid at 7010, in bankruptcy): no rent, and so no recoveries, from
// `startMonth` on, whatever the lease or the schedule says.
// "rent" SETS the rent of a lease in place from `startMonth` on — the figure
// keyed, whatever the roll or the schedule says (North Inc at 7010, a recon
// tenant on no rent-roll suite, has no rent row to type over otherwise).
export const LEASE_KINDS = ["renew", "vacate", "leaseup", "hold", "stop", "rent"] as const;
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
  /** A back-out ("stop") through this month only, 1–12 — a single month's
   *  rent backed out (Revere's January) rather than the rest of the year.
   *  Unset = through December. */
  endMonth?: number;
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

/** The property's calls: the old per-property document, with each suite's own
 *  document laid over it (every save since the split writes only those). */
async function loadDoc(budgetYear: number, propertyCode: string): Promise<Doc> {
  const [legacy, units] = await Promise.all([
    getJSON(PREFIX, idFor(budgetYear, propertyCode)) as Promise<Doc | null>,
    listJSON(UNIT_PREFIX(budgetYear, propertyCode), { fresh: true }) as Promise<UnitDoc[]>,
  ]);
  const doc: Doc = { assumptions: { ...(legacy?.assumptions ?? {}) }, cleared: [...(legacy?.cleared ?? [])] };
  const seeded = new Set(seedFor(budgetYear, propertyCode).map((a) => a.unitRef));
  for (const u of units ?? []) {
    if (!u?.unitRef) continue;
    if (u.assumption) {
      doc.assumptions[u.unitRef] = u.assumption;
      doc.cleared = doc.cleared!.filter((x) => x !== u.unitRef);
    } else {
      delete doc.assumptions[u.unitRef];
      if (seeded.has(u.unitRef)) doc.cleared = [...new Set([...doc.cleared!, u.unitRef])];
    }
  }
  return doc;
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
  // Only this suite's document is written — never the property's whole set.
  const at = new Date().toISOString();
  let assumption: LeaseAssumption | null = null;
  if (a.kind !== null) {
    assumption = {
      unitRef: a.unitRef, kind: a.kind,
      // EVERY field the card keys is kept. rentPsf / tiPsf / lcPct were added
      // to the type and the route but not here, so a lease-up saved with no
      // rent (it projected $0) and no TI or commission ever reached the budget.
      monthlyRent: a.monthlyRent, rentPsf: a.rentPsf, tiPsf: a.tiPsf, lcPct: a.lcPct,
      startMonth: a.startMonth, endMonth: a.kind === "stop" ? a.endMonth : undefined, termYears: a.termYears, notes: a.notes,
      updatedBy: a.updatedBy,
      updatedAt: at,
    };
  }
  const unitDoc: UnitDoc = { unitRef: a.unitRef, assumption, at };
  await storeJSON(UNIT_PREFIX(budgetYear, propertyCode), unitId(a.unitRef), unitDoc);
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
  const newRent = kind === "renew" || kind === "leaseup" || kind === "rent";
  if (kind === "rent" && !(num(b?.monthlyRent)! > 0) && !(psf(b?.rentPsf)! > 0)) return { ok: false, error: "Enter the rent" };
  const deal = kind === "renew" || kind === "leaseup" || kind === "hold";
  const lc = psf(b?.lcPct);
  return {
    ok: true,
    decision: {
      unitRef, kind,
      monthlyRent: newRent ? num(b?.monthlyRent) : undefined,
      startMonth: kind === "leaseup" || kind === "stop" || kind === "rent" ? (startMonth ?? (kind === "rent" ? 1 : undefined)) : undefined,
      endMonth: kind === "stop" && num(b?.endMonth) != null ? Math.min(12, Math.max(startMonth ?? 1, Number(b!.endMonth))) : undefined,
      termYears,
      rentPsf: newRent ? psf(b?.rentPsf) : undefined,
      tiPsf: deal ? psf(b?.tiPsf) : undefined,
      lcPct: deal && lc != null && lc <= 100 ? lc : undefined,
      notes: typeof b?.notes === "string" ? b.notes : undefined,
      updatedBy,
    },
  };
}

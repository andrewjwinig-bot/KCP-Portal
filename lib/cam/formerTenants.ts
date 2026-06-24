// Former / vacated tenants — manually entered so they can still be reconciled
// after they drop off the rent roll.
//
// A tenant who vacates mid-year disappears from the next rent-roll snapshot, so
// the interim move-out picker (which sources from the live rent roll + the recon
// roster) can't see them. Staff need to (a) keep a record of the departed tenant
// and (b) pull an interim CAM/RET statement for their occupied window. Those
// facts live here, one record per unit, keyed by "<property>-<year>".
//
// Methodology still flows from the normal sources where it exists; this store
// only carries the rent-roll facts the live roll no longer has, plus optional
// overrides for the YTD expense pool and the escrow billed (live values are used
// when an override is left blank — see the interim route).

import { scopedCollection } from "@/lib/collectionStore";

export type FormerTenant = {
  /** Portal unit ref, e.g. "4080-111A". */
  unitRef: string;
  /** Office (base-year) or retail (pro-rata pools) methodology. */
  kind: "office" | "retail";
  name: string;
  sqft: number;
  /** Lease start, "M/D/YYYY" — windows the occupied period. */
  leaseFrom: string | null;
  /** Move-out date, "M/D/YYYY" — the end of the occupied window. */
  vacatedISO: string | null;
  /** Monthly CAM/opex + RET escrow billed (the live fallback for escrow). */
  opexMonth: number;
  reTaxMonth: number;

  // ── Office methodology ──
  baseYear?: number;
  noBaseStop?: boolean;
  grossUp?: boolean;
  proRataPct?: number;

  // ── Retail methodology ──
  camPrs?: number;
  insPrs?: number;
  retPrs?: number;
  adminFeePct?: number;
  retDiscountPct?: number;

  // ── YTD actual-expense overrides (windowed totals; null/undefined = live GL) ──
  /** Office: opex YTD actual. Retail: CAM pool YTD actual. */
  opexActualOverride?: number | null;
  /** RET pool YTD actual (both kinds). */
  retActualOverride?: number | null;
  /** Retail INS pool YTD actual. */
  insActualOverride?: number | null;

  // ── Escrow overrides (windowed totals; null/undefined = monthly × months) ──
  camEscrowOverride?: number | null;
  insEscrowOverride?: number | null;
  retEscrowOverride?: number | null;
};

const store = scopedCollection<FormerTenant>({
  prefix: "cam-former-tenants",
  keyOf: (t) => t.unitRef,
});

const scopeKey = (property: string, year: number): string => `${property}-${year}`;

export async function listFormerTenants(property: string, year: number): Promise<FormerTenant[]> {
  return (await store.forScope(scopeKey(property, year)).all()).sort((a, b) => a.unitRef.localeCompare(b.unitRef));
}

export async function getFormerTenant(property: string, year: number, unitRef: string): Promise<FormerTenant | null> {
  return store.forScope(scopeKey(property, year)).get(unitRef);
}

export async function saveFormerTenant(property: string, year: number, tenant: FormerTenant): Promise<void> {
  await store.forScope(scopeKey(property, year)).set(tenant.unitRef, tenant);
}

export async function deleteFormerTenant(property: string, year: number, unitRef: string): Promise<void> {
  await store.forScope(scopeKey(property, year)).remove(unitRef);
}

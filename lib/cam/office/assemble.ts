// Assemble per-tenant reconciliation inputs by joining the live rent roll
// to stored lease config.
//
// The December rent roll supplies what it authoritatively knows — the
// roster, square footage, and lease dates (→ partial-year occupancy). The
// lease-level terms that aren't on the rent roll come from config:
//   - baseYear, grossUp  → tenant metadata (/api/tenant-meta)
//   - proRataPct         → the CAMPRep pro-rata share
//   - opexEscrow/retEscrow → CAM/RET actually collected during the year
//
// Escrow is kept in config rather than derived from the rent roll's monthly
// charge: a tenant whose charge changed mid-year (or vacated) won't show the
// amount that was actually billed earlier in the year on the December roll.

import type { OfficeTenantInput } from "./types";
import { occupancyPctForYear } from "./occupancy";

/** Lease-level inputs that don't come from the rent roll. */
export type OfficeLeaseConfig = {
  baseYear: number;
  grossUp: boolean;
  proRataPct: number;
  opexEscrow: number;
  retEscrow: number;
};

/** The slice of a rent-roll unit the assembler needs (subset of
 *  RentRollUnit). unitRef has the "-CU" charge suffix already stripped by
 *  the parser, so it matches the tenant-meta / config keys. */
export type RosterUnit = {
  unitRef: string;
  occupantName: string;
  sqft: number;
  isVacant: boolean;
  leaseFrom: string | null;
  leaseTo: string | null;
};

/** Suite from a unit ref: "4070-103" → "103". */
export function suiteOf(unitRef: string): string {
  const parts = unitRef.split("-");
  return parts.length > 1 ? parts.slice(1).join("-") : unitRef;
}

/** Skyline charge unit from a portal unit ref: "4070-103" → "4070-103-CU". */
export function skylineUnitOf(unitRef: string): string {
  return `${unitRef}-CU`;
}

/**
 * Build OfficeTenantInput[] for one building/year from the rent-roll roster
 * (occupied units with a lease config) and the lease config map keyed by
 * unit ref. Units that are vacant or have no config are skipped — a tenant
 * must have a base year / share to reconcile.
 */
export function assembleTenantInputs(
  roster: RosterUnit[],
  year: number,
  configByUnit: Record<string, OfficeLeaseConfig>,
): OfficeTenantInput[] {
  const out: OfficeTenantInput[] = [];
  for (const u of roster) {
    if (u.isVacant) continue;
    const cfg = configByUnit[u.unitRef];
    if (!cfg) continue;
    out.push({
      unitRef: u.unitRef,
      skylineUnit: skylineUnitOf(u.unitRef),
      suite: suiteOf(u.unitRef),
      name: u.occupantName,
      baseYear: cfg.baseYear,
      grossUp: cfg.grossUp,
      proRataPct: cfg.proRataPct,
      sqft: u.sqft,
      occPct: occupancyPctForYear(u.leaseFrom, u.leaseTo, year),
      opexEscrow: cfg.opexEscrow,
      retEscrow: cfg.retEscrow,
    });
  }
  return out;
}

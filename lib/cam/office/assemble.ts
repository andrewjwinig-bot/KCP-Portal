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
import { monthsOccupiedInYear, annualizedEscrow } from "./escrow";

/** Lease-level inputs that don't come from the rent roll. Escrow is
 *  optional: when omitted the assembler annualizes the rent-roll monthly
 *  charge (monthly × months occupied); when present it overrides — e.g. a
 *  tenant whose charge changed mid-year or whose December charge is $0. */
export type OfficeLeaseConfig = {
  baseYear: number;
  grossUp: boolean;
  proRataPct: number;
  opexEscrow?: number;
  retEscrow?: number;
};

/** The slice of a rent-roll unit the assembler needs (subset of
 *  RentRollUnit). unitRef has the "-CU" charge suffix already stripped by
 *  the parser, so it matches the tenant-meta / config keys. opexMonth /
 *  reTaxMonth are the current monthly CAM / RET estimate charges. */
export type RosterUnit = {
  unitRef: string;
  occupantName: string;
  sqft: number;
  isVacant: boolean;
  /** Lease commencement (RCD) — drives mid-year move-in occupancy. */
  leaseFrom: string | null;
  /** Lease expiration — informational; does NOT reduce occupancy. */
  leaseTo: string | null;
  /** Genuine mid-year move-out date, if the tenant actually vacated. Only
   *  this (not lease expiration) ends occupancy before year-end. */
  movedOut?: string | null;
  opexMonth?: number;
  reTaxMonth?: number;
};

/** A base-year reset (subset of the stored BaseYearReset). */
export type ResetInfo = {
  resetDate: string; // ISO YYYY-MM-DD
  originalBaseYear: number | null;
  newBaseYear: number;
};

/** ISO "2025-07-01" → US "7/1/2025" (drops leading zeros). */
function isoToUS(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${Number(m[2])}/${Number(m[3])}/${m[1]}`;
}

/** ISO date minus one day (e.g. a reset effective 7/1 → recovery through 6/30). */
function isoMinusOneDay(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function usDateMs(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return Date.UTC(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
}

/** The earlier of two US-format dates; nulls are treated as "no bound". */
function earlierUS(a: string | null | undefined, b: string | null | undefined): string | null {
  const ma = usDateMs(a);
  const mb = usDateMs(b);
  if (ma == null) return b ?? null;
  if (mb == null) return a ?? null;
  return ma <= mb ? (a as string) : (b as string);
}

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
  resetsByUnit: Record<string, ResetInfo> = {},
): OfficeTenantInput[] {
  const out: OfficeTenantInput[] = [];
  for (const u of roster) {
    if (u.isVacant) continue;
    const cfg = configByUnit[u.unitRef];
    if (!cfg) continue;

    // Occupancy: move-in (lease commencement) → move-out only. A lease that
    // expires mid-year while the tenant stays is still 100%.
    const occEnd = u.movedOut ?? null;
    const occPct = occupancyPctForYear(u.leaseFrom, occEnd, year);

    // A base-year reset during the recon year prorates the RECOVERY (not the
    // occupancy): the old base applies only through the day before the reset,
    // so recovery is capped there. Occupancy is unchanged.
    const reset = resetsByUnit[u.unitRef];
    const resetInYear = !!reset && reset.resetDate.slice(0, 4) === String(year);
    const recoveryEnd = resetInYear ? earlierUS(occEnd, isoToUS(isoMinusOneDay(reset!.resetDate))) : occEnd;
    const recoveryPct = resetInYear ? occupancyPctForYear(u.leaseFrom, recoveryEnd, year) : occPct;

    const monthsOcc = monthsOccupiedInYear(u.leaseFrom, occEnd, year);
    out.push({
      unitRef: u.unitRef,
      skylineUnit: skylineUnitOf(u.unitRef),
      suite: suiteOf(u.unitRef),
      name: u.occupantName,
      baseYear: cfg.baseYear,
      grossUp: cfg.grossUp,
      proRataPct: cfg.proRataPct,
      sqft: u.sqft,
      occPct,
      recoveryPct,
      baseYearResetISO: resetInYear ? reset!.resetDate : null,
      rcd: u.leaseFrom ?? null,
      opexEscrow: cfg.opexEscrow ?? annualizedEscrow(u.opexMonth ?? 0, monthsOcc),
      retEscrow: cfg.retEscrow ?? annualizedEscrow(u.reTaxMonth ?? 0, monthsOcc),
    });
  }
  return out;
}

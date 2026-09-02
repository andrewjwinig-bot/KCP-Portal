// Lease-based revenue projection for the budget draft (Phase 1b).
//
// Projects next year's rental income from the CURRENT rent roll's in-place
// leases. The rent roll doesn't carry parsed escalations, so base rent is held
// flat (holdover) across the budget year — but any lease EXPIRING during the
// budget year (or already on holdover) is flagged, not guessed, so Nancy/Harry
// set the renew-vs-vacate assumption in the leasing workspace (Phase 2) rather
// than the draft silently assuming one. Vacant units are surfaced the same way.

import "server-only";
import { resolveCurrentRentroll } from "@/lib/rentroll/current";

const r0 = (n: number) => Math.round(n);

/** MM/DD/YYYY → {y,m} (1-based month), or null. */
function parseMDY(s: string | null | undefined): { y: number; m: number } | null {
  const mm = (s ?? "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return mm ? { y: Number(mm[3]), m: Number(mm[1]) } : null;
}

export type ExpiringLease = {
  unitRef: string;
  tenant: string;
  leaseTo: string | null;
  monthlyRent: number;
  annualRent: number;
  /** True when the lease already ended (holdover on the current roll). */
  holdover: boolean;
};
export type VacantUnit = { unitRef: string; sqft: number };

export type LeaseRevenueProjection = {
  /** 12 monthly projected base rent (holdover-flat), display-positive. */
  rentalMonthly: number[];
  rentalTotal: number;
  inPlaceUnits: number;
  /** Leases expiring during the budget year or already on holdover — need an
   *  assumption before the revenue is real. */
  expiring: ExpiringLease[];
  /** Vacant units — potential lease-up, an assumption for Nancy/Harry. */
  vacant: VacantUnit[];
  /** True when at least one unit was projected (a real rent roll was found). */
  hasData: boolean;
};

/** Project rental income for the given property codes (one building, or a fund's
 *  members) for `budgetYear` from the current rent roll. */
export async function projectLeaseRevenue(codes: string[], budgetYear: number): Promise<LeaseRevenueProjection> {
  const wanted = new Set(codes.map((c) => c.toUpperCase()));
  const roll = await resolveCurrentRentroll();
  const rentalMonthly = new Array(12).fill(0);
  const expiring: ExpiringLease[] = [];
  const vacant: VacantUnit[] = [];
  let inPlaceUnits = 0;
  let any = false;

  for (const p of roll?.properties ?? []) {
    if (!wanted.has(String(p.propertyCode).toUpperCase())) continue;
    any = true;
    for (const u of p.units ?? []) {
      if (u.amenity) continue;
      if (u.isVacant || !u.occupantName) { vacant.push({ unitRef: u.unitRef, sqft: r0(u.sqft || 0) }); continue; }
      const monthly = u.baseRent || 0;
      inPlaceUnits++;
      // Holdover-flat: carry current rent across all 12 months of the budget year.
      for (let m = 0; m < 12; m++) rentalMonthly[m] += monthly;
      const end = parseMDY(u.leaseTo);
      // Flag if the lease ends on/before the budget year (holdover or expiring within it).
      if (end && end.y <= budgetYear) {
        expiring.push({
          unitRef: u.unitRef, tenant: u.occupantName, leaseTo: u.leaseTo,
          monthlyRent: r0(monthly), annualRent: r0(monthly * 12),
          holdover: end.y < budgetYear,
        });
      }
    }
  }

  expiring.sort((a, b) => (a.leaseTo ?? "").localeCompare(b.leaseTo ?? ""));
  vacant.sort((a, b) => b.sqft - a.sqft);
  return {
    rentalMonthly: rentalMonthly.map(r0),
    rentalTotal: r0(rentalMonthly.reduce((s, n) => s + n, 0)),
    inPlaceUnits,
    expiring,
    vacant,
    hasData: any,
  };
}

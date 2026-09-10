// Lease-based revenue projection for the budget draft (Phase 1b + 2).
//
// Projects next year's rental income from the CURRENT rent roll's in-place
// leases. The rent roll carries no parsed escalations, so base rent is held flat
// unless a LEASING ASSUMPTION (Phase 2) says otherwise:
//   • renew  — hold the current rent, or step to a new rent from a start month.
//   • vacate — pay through the vacate month, then $0.
//   • leaseup — a vacant space starts paying a new rent from a start month.
// Leases expiring in the budget year (or on holdover) and vacant spaces are
// surfaced with their current assumption so the decision is explicit.

import "server-only";
import { resolveCurrentRentroll } from "@/lib/rentroll/current";
import type { LeaseAssumption } from "./leasingAssumptions";

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
  /** The assumption currently applied to this unit, if any. */
  assumption?: LeaseAssumption;
};
export type VacantUnit = { unitRef: string; sqft: number; assumption?: LeaseAssumption };

export type LeaseRevenueProjection = {
  /** 12 monthly projected base rent (assumption-adjusted), display-positive. */
  rentalMonthly: number[];
  rentalTotal: number;
  inPlaceUnits: number;
  expiring: ExpiringLease[];
  vacant: VacantUnit[];
  /** How many assumptions were applied to shape the projection. */
  assumptionsApplied: number;
  hasData: boolean;
};

/** In-place unit's 12 monthly rents given its current rent, budget-year
 *  expiration month (0 = holdover, 13 = doesn't expire this year), and any
 *  assumption. */
function inPlaceMonths(cur: number, expMonth: number, a?: LeaseAssumption): number[] {
  const out = new Array(12).fill(0);
  if (a?.kind === "vacate") {
    const vacateMonth = a.startMonth ?? (expMonth >= 1 && expMonth <= 12 ? expMonth : 1);
    for (let m = 0; m < 12; m++) out[m] = m + 1 <= vacateMonth ? cur : 0;
    return out;
  }
  if (a?.kind === "renew") {
    const newRent = a.monthlyRent != null ? a.monthlyRent : cur;
    const start = a.monthlyRent != null ? (a.startMonth ?? 1) : 1;
    for (let m = 0; m < 12; m++) out[m] = m + 1 < start ? cur : newRent;
    return out;
  }
  out.fill(cur); // no assumption → hold flat
  return out;
}

/** Project rental income for the given property codes (one building, or a fund's
 *  members) for `budgetYear`, applying any leasing assumptions. */
export async function projectLeaseRevenue(
  codes: string[],
  budgetYear: number,
  assumptions: Record<string, LeaseAssumption> = {},
): Promise<LeaseRevenueProjection> {
  const wanted = new Set(codes.map((c) => c.toUpperCase()));
  const roll = await resolveCurrentRentroll();
  const rentalMonthly = new Array(12).fill(0);
  const expiring: ExpiringLease[] = [];
  const vacant: VacantUnit[] = [];
  let inPlaceUnits = 0;
  let assumptionsApplied = 0;
  let any = false;

  for (const p of roll?.properties ?? []) {
    if (!wanted.has(String(p.propertyCode).toUpperCase())) continue;
    any = true;
    for (const u of p.units ?? []) {
      if (u.amenity) continue;
      const a = assumptions[u.unitRef];

      if (u.isVacant || !u.occupantName) {
        // Vacant → only produces rent with a lease-up assumption.
        if (a?.kind === "leaseup") {
          const start = a.startMonth ?? 1;
          const rent = a.monthlyRent ?? 0;
          for (let m = 0; m < 12; m++) if (m + 1 >= start) rentalMonthly[m] += rent;
          assumptionsApplied++;
        }
        vacant.push({ unitRef: u.unitRef, sqft: r0(u.sqft || 0), assumption: a });
        continue;
      }

      const cur = u.baseRent || 0;
      inPlaceUnits++;
      const end = parseMDY(u.leaseTo);
      const expMonth = end ? (end.y < budgetYear ? 0 : end.y === budgetYear ? end.m : 13) : 13;
      const months = inPlaceMonths(cur, expMonth, a);
      for (let m = 0; m < 12; m++) rentalMonthly[m] += months[m];
      if (a) assumptionsApplied++;

      if (end && end.y <= budgetYear) {
        expiring.push({
          unitRef: u.unitRef, tenant: u.occupantName, leaseTo: u.leaseTo,
          monthlyRent: r0(cur), annualRent: r0(cur * 12),
          holdover: end.y < budgetYear, assumption: a,
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
    assumptionsApplied,
    hasData: any,
  };
}

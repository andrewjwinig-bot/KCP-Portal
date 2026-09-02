// Sum a tenant's ACTUAL monthly escrow from the rent-roll snapshots, instead of
// annualizing one month × occupied months. Each monthly rent roll carries the
// unit's opexMonth (CAM) + reTaxMonth (RET) escrow; summing them across the
// occupied months captures mid-year escrow changes correctly.

import "server-only";
import { getJSON } from "@/lib/storage";
import type { RentRollData } from "@/lib/rentroll/parseRentRollExcel";

const HISTORY_PREFIX = "rentroll-history";

export type SummedEscrow = {
  camEscrow: number; retEscrow: number;
  /** Months in the window that had an actual rent-roll snapshot for the unit. */
  monthsFound: number;
  /** Months in the window [startMonth, endMonth]. */
  monthsExpected: number;
  /** Months with no snapshot that were filled from the `fill` estimate (0 when
   *  no fill was requested — those months contribute nothing). */
  monthsFilled: number;
};

/** Sum the unit's CAM (opexMonth) + RET (reTaxMonth) escrow from each month's
 *  rent-roll snapshot across [startMonth, endMonth] of `year`.
 *
 *  A window month with no snapshot would otherwise contribute $0 — which
 *  UNDER-states billed escrow and OVER-charges the tenant on reconciliation. So
 *  when `fill` (the unit's per-month estimate) is given, a missing month is
 *  filled from it instead of dropped, and the result covers the whole occupied
 *  window. Returns null only when nothing at all was found or filled. */
export async function sumRentRollEscrow(
  unitRef: string,
  year: number,
  startMonth: number,
  endMonth: number,
  fill?: { cam: number; ret: number },
): Promise<SummedEscrow | null> {
  let cam = 0, ret = 0, found = 0, filled = 0;
  const lo = Math.max(1, startMonth), hi = Math.min(12, endMonth);
  const monthsExpected = Math.max(0, hi - lo + 1);
  for (let m = lo; m <= hi; m++) {
    const snap = (await getJSON(HISTORY_PREFIX, `${year}-${String(m).padStart(2, "0")}`)) as RentRollData | null;
    let unit: { opexMonth?: number; reTaxMonth?: number } | undefined;
    if (snap) {
      for (const p of snap.properties ?? []) {
        const u = (p.units ?? []).find((x) => x.unitRef === unitRef);
        if (u) { unit = u; break; }
      }
    }
    if (unit) {
      cam += unit.opexMonth ?? 0;
      ret += unit.reTaxMonth ?? 0;
      found++;
    } else if (fill) {
      cam += fill.cam;
      ret += fill.ret;
      filled++;
    }
  }
  if (found === 0 && filled === 0) return null;
  return { camEscrow: Math.round(cam), retEscrow: Math.round(ret), monthsFound: found, monthsExpected, monthsFilled: filled };
}

/** Per-month CAM (opexMonth) + RET (reTaxMonth) escrow for a unit, read from
 *  each month's rent-roll snapshot — the detail behind a tenant's escrow line.
 *  Months with no snapshot / no unit / no escrow are omitted. */
export async function monthlyRentRollEscrow(
  unitRef: string,
  year: number,
): Promise<{ month: number; cam: number; ret: number }[]> {
  const out: { month: number; cam: number; ret: number }[] = [];
  for (let m = 1; m <= 12; m++) {
    const snap = (await getJSON(HISTORY_PREFIX, `${year}-${String(m).padStart(2, "0")}`)) as RentRollData | null;
    if (!snap) continue;
    let unit: { opexMonth?: number; reTaxMonth?: number } | undefined;
    for (const p of snap.properties ?? []) {
      const u = (p.units ?? []).find((x) => x.unitRef === unitRef);
      if (u) { unit = u; break; }
    }
    if (!unit) continue;
    const cam = Math.round(unit.opexMonth ?? 0);
    const ret = Math.round(unit.reTaxMonth ?? 0);
    if (cam || ret) out.push({ month: m, cam, ret });
  }
  return out;
}

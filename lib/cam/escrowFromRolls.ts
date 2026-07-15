// Sum a tenant's ACTUAL monthly escrow from the rent-roll snapshots, instead of
// annualizing one month × occupied months. Each monthly rent roll carries the
// unit's opexMonth (CAM) + reTaxMonth (RET) escrow; summing them across the
// occupied months captures mid-year escrow changes correctly.

import "server-only";
import { getJSON } from "@/lib/storage";
import type { RentRollData } from "@/lib/rentroll/parseRentRollExcel";

const HISTORY_PREFIX = "rentroll-history";

export type SummedEscrow = { camEscrow: number; retEscrow: number; monthsFound: number };

/** Sum the unit's CAM (opexMonth) + RET (reTaxMonth) escrow from each month's
 *  rent-roll snapshot across [startMonth, endMonth] of `year`. Returns null when
 *  no snapshot in the window carries the unit, so the caller can fall back to
 *  the monthly × months estimate. */
export async function sumRentRollEscrow(
  unitRef: string,
  year: number,
  startMonth: number,
  endMonth: number,
): Promise<SummedEscrow | null> {
  let cam = 0, ret = 0, found = 0;
  for (let m = Math.max(1, startMonth); m <= Math.min(12, endMonth); m++) {
    const snap = (await getJSON(HISTORY_PREFIX, `${year}-${String(m).padStart(2, "0")}`)) as RentRollData | null;
    if (!snap) continue;
    let unit: { opexMonth?: number; reTaxMonth?: number } | undefined;
    for (const p of snap.properties ?? []) {
      const u = (p.units ?? []).find((x) => x.unitRef === unitRef);
      if (u) { unit = u; break; }
    }
    if (!unit) continue;
    cam += unit.opexMonth ?? 0;
    ret += unit.reTaxMonth ?? 0;
    found++;
  }
  if (found === 0) return null;
  return { camEscrow: Math.round(cam), retEscrow: Math.round(ret), monthsFound: found };
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

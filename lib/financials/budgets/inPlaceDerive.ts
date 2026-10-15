// Reading an imported in-place schedule — pure, so the PAGE can use it too.
//
// Split out of the store because the store is `server-only` (it touches blob
// storage) and these are just arithmetic over a record the client already has
// in hand. Keeping them here means the screen and the server derive the same
// vacancy list from the same code rather than each having its own idea of
// which units need an assumption.

import type { InPlaceRevenueRecord } from "./inPlaceStore";

/** A property's imported schedule as 12 monthly totals. Zeros when not covered. */
export function monthlyForProperty(rec: InPlaceRevenueRecord | null, propertyCode: string): number[] {
  const months = Array(12).fill(0) as number[];
  if (!rec) return months;
  const code = propertyCode.toUpperCase();
  for (const c of rec.charges) {
    if (c.propertyCode.toUpperCase() !== code) continue;
    months[c.month - 1] += c.amount;
  }
  return months.map((v) => Math.round(v * 100) / 100);
}

/**
 * The units in a property with NO contracted rent for part or all of the year —
 * the vacancy / renewal list Nancy and Harry work.
 *
 * Two shapes, and both belong on that list:
 *   a unit the export carried with a blank amount (Rite Aid at Parkwood, which
 *   went bankrupt — a real space with no contracted rent), and
 *   a unit whose charges STOP mid-year, which is a lease expiring inside the
 *   budget year and needs a renewal assumption.
 */
export function unitsNeedingAssumption(rec: InPlaceRevenueRecord | null, propertyCode: string): {
  unitRef: string; tenant: string; lastMonth: number | null; monthsCovered: number;
}[] {
  if (!rec) return [];
  const code = propertyCode.toUpperCase();
  const byUnit = new Map<string, { tenant: string; months: Set<number> }>();
  for (const c of rec.charges) {
    if (c.propertyCode.toUpperCase() !== code) continue;
    const u = byUnit.get(c.unitRef) ?? { tenant: c.tenant, months: new Set<number>() };
    u.months.add(c.month);
    byUnit.set(c.unitRef, u);
  }
  const out: { unitRef: string; tenant: string; lastMonth: number | null; monthsCovered: number }[] = [];
  for (const [unitRef, u] of byUnit) {
    if (u.months.size >= 12) continue; // contracted all year — nothing to assume
    out.push({ unitRef, tenant: u.tenant, lastMonth: Math.max(...u.months), monthsCovered: u.months.size });
  }
  return out.sort((a, b) => a.monthsCovered - b.monthsCovered || a.unitRef.localeCompare(b.unitRef));
}

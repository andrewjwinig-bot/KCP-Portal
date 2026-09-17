// The imported in-place revenue schedule, per budget year.
//
// One record per (year, category) — the shopping centres are budgeted in one
// pass, so the import covers the group rather than a building. A re-import
// REPLACES the year: this is a forward schedule out of Skyline, so the newest
// export is the truth, and merging two runs would leave a stale step in place
// with nothing saying which run it came from.

import "server-only";
import { getJSON, storeJSON, deleteJSON } from "@/lib/storage";
import type { InPlaceCharge } from "./inPlaceRevenue";

const PREFIX = "financials-budgets-inplace";

export type InPlaceRevenueRecord = {
  year: number;
  /** The budget group this covers, e.g. "Shopping Centers". */
  category: string;
  charges: InPlaceCharge[];
  properties: string[];
  /** Properties expected in the group that the export did not carry. */
  missing: string[];
  /** Rows that could not be read, named so a blank rent is never a silent nil. */
  skipped: { row: number; reason: string }[];
  chargeCodes: string[];
  importedAt: string;
  importedBy: string;
  fileName: string;
};

const idFor = (year: number, category: string) =>
  `${year}-${category}`.replace(/[^a-zA-Z0-9_-]+/g, "_");

export async function saveInPlaceRevenue(rec: InPlaceRevenueRecord): Promise<void> {
  await storeJSON(PREFIX, idFor(rec.year, rec.category), rec);
}

export async function getInPlaceRevenue(year: number, category: string): Promise<InPlaceRevenueRecord | null> {
  return (await getJSON(PREFIX, idFor(year, category))) as InPlaceRevenueRecord | null;
}

export async function deleteInPlaceRevenue(year: number, category: string): Promise<boolean> {
  return deleteJSON(PREFIX, idFor(year, category));
}

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

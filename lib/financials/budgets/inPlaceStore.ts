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
export { monthlyForProperty, unitsNeedingAssumption } from "./inPlaceDerive";

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

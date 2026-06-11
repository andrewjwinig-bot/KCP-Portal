// Cash Sheet — Anticipated Revenue sourcing.
//
// Anticipated Revenue for a month = the rent roll's scheduled monthly gross
// billings per property (base rent + CAM + RET + other reimbursements, occupied
// units) — what should hit the operating account if every tenant pays. It's an
// estimate, not collections, so the Cash Sheet labels it anticipated and lets
// staff override it. Uses that month's rent-roll snapshot when one exists, else
// the current rent roll (leases are roughly constant month to month).

import "server-only";
import { getJSON } from "@/lib/storage";
import type { RentRollData } from "@/lib/rentroll/parseRentRollExcel";
import { summarizeSnapshot } from "@/lib/rentroll/snapshot";
import { monthKey } from "./util";

// Mirrors the rent-roll storage keys in app/api/rentroll/history/route.ts.
const RENTROLL_PREFIX = "rentroll";
const RENTROLL_ID = "current";
const HISTORY_PREFIX = "rentroll-history";

/** Anticipated monthly gross billings per property code (uppercased) for a
 *  cash-sheet (year, month). Empty when no rent roll is loaded. */
export async function anticipatedRevenueFor(year: number, month: number): Promise<Record<string, number>> {
  const ym = monthKey(year, month);
  const rr =
    ((await getJSON(HISTORY_PREFIX, ym)) as RentRollData | null) ??
    ((await getJSON(RENTROLL_PREFIX, RENTROLL_ID)) as RentRollData | null);
  if (!rr) return {};
  const out: Record<string, number> = {};
  for (const p of summarizeSnapshot(rr).byProperty) {
    out[p.propertyCode.toUpperCase()] = Math.round(p.grossRentMonth);
  }
  return out;
}

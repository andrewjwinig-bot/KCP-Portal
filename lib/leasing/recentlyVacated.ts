// "Which tenants recently vacated and still need a close-out?" — computed
// server-side for the move-out watcher, the interim page and the weekly digest.
//
// A tenant has vacated only when the rent roll SAYS so: present on an earlier
// roll of their property and absent from the newest roll covering it. An
// expired lease is not a move-out — a tenant who renews stays on the roll — so
// the lease date never decides it. The rule lives in `confirmedMoveouts`.

import "server-only";
import { listJSON } from "@/lib/storage";
import type { RentRollData } from "@/lib/rentroll/parseRentRollExcel";
import { confirmedMoveouts } from "./confirmedMoveouts";

const HISTORY_PREFIX = "rentroll-history";

export type VacatedTenant = {
  propertyCode: string;
  unitRef: string;
  occupantName: string;
  sqft: number;
  leaseTo: string | null;
  /** `YYYY-MM` of the newest roll the tenant still occupied this unit — the
   *  last-occupied month, used to derive a vacate month when `leaseTo` is
   *  missing/unparseable. */
  lastSeen: string | null;
};

/** Tenants confirmed gone in roughly the last 60 days (close-out candidates). */
export async function recentlyVacatedTenants(now = new Date()): Promise<VacatedTenant[]> {
  const history = ((await listJSON(HISTORY_PREFIX)) as RentRollData[]) ?? [];
  return confirmedMoveouts(history, now).map(({ goneAsOf: _g, ...v }) => v);
}

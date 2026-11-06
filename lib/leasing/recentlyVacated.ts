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
import { confirmedMoveouts, sameTenant } from "./confirmedMoveouts";

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

/** How far back a SPECIFIC close-out looks for the tenant's departure. The
 *  candidate list keeps its ~60-day window (recent move-outs), but a tenant
 *  someone opened to close out may have left months ago — Gilson (3640-105)
 *  left the roll in July and read "still on the rent roll" in November. */
export const CLOSEOUT_LOOKBACK_DAYS = 730;

/** Is THIS tenant confirmed gone — present on an earlier roll of the property
 *  and absent from its newest one? The same rule as the candidate list, over
 *  two years. Fails CLOSED: a failed read throws to the caller. */
export async function isConfirmedGone(propertyCode: string, unitRef: string, name?: string | null, now = new Date()): Promise<boolean> {
  const history = ((await listJSON(HISTORY_PREFIX, { fresh: true })) as RentRollData[]) ?? [];
  const code = propertyCode.toUpperCase();
  return confirmedMoveouts(history, now, CLOSEOUT_LOOKBACK_DAYS).some((m) =>
    m.propertyCode === code && m.unitRef === unitRef && (!name || sameTenant(m.occupantName, name)));
}

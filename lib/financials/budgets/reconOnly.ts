// AT-RECON RECOVERIES LAND IN MAY. A charge a tenant pays only at
// reconciliation (`reconOnlyParts` — McDonald's RET, USPS's RET, Clear
// Channel's own-parcel RET at 4500, the business-park tenants billed no Op Ex
// estimate) is still revenue, but it is not billed a month at a time: the
// year-end adjustment posts on 4/30 and is collected in MAY (owner). Spread
// evenly Jan–Dec it made every month but May read short against the GL and
// May far over, so each such charge's year is booked as ONE May amount —
// the total is unchanged, only the month moves.
//
// Pure: fed the draft's reimbursement estimate, the rent rows (today's
// billing) and the monthly statements' billing.

import type { ReimbursementEstimate } from "./reimbursementEstimate";
import type { RentRow } from "./leaseRevenue";
import type { StatementBilling } from "./statementBillingMath";
import { currentBilling, reconOnlyParts } from "./estimatesByTenant";

/** May — the month the true-up is collected (0-based). */
export const RECON_COLLECTED_MONTH = 4;

const sum = (a: number[]) => a.reduce((s, v) => s + (v || 0), 0);
const r0 = (n: number) => Math.round(n || 0);

export function landReconOnlyInMay(
  est: ReimbursementEstimate,
  rows: RentRow[] | undefined,
  stmt: Map<string, StatementBilling> | null | undefined,
): ReimbursementEstimate {
  const byUnit = new Map((rows ?? []).map((r) => [String(r.unitRef).toUpperCase(), r]));
  let moved = false;
  for (const t of est.tenants) {
    const ref = String(t.unitRef).toUpperCase();
    const row = byUnit.get(ref);
    const s = stmt?.get(ref);
    const billing = row?.billing || s?.month ? { ...(row?.billing ?? { cam: 0, ins: 0, ret: 0 }), ...(s?.month ? { stmt: s } : {}) } : undefined;
    const cur = currentBilling({ billing, method: t.method } as never);
    const now = cur ? { cam: cur.cam, ins: cur.ins, ret: cur.ret } : null;
    const parts = reconOnlyParts({ method: t.method, overridden: t.overridden } as never, now);
    for (const p of parts) {
      const year = r0(sum(t[p]));
      if (!year) continue;
      t[p] = t[p].map((_, i) => (i === RECON_COLLECTED_MONTH ? year : 0));
      (t.atRecon ??= {})[p] = year;
      moved = true;
    }
  }
  if (moved) {
    for (const p of ["cam", "ins", "ret"] as const) {
      est.monthly[p] = est.monthly[p].map((_, i) => est.tenants.reduce((a, t) => a + (t[p][i] || 0), 0));
    }
  }
  return est;
}

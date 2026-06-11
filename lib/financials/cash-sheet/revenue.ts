// Cash Sheet — Anticipated Revenue sourcing.
//
// Anticipated Revenue for a month = the rent roll's scheduled monthly gross
// billings per property (base rent + CAM + RET + other reimbursements, occupied
// units) — what should hit the operating account if every tenant pays. It's an
// estimate, not collections, so the Cash Sheet labels it anticipated. Uses that
// month's rent-roll snapshot when one exists, else the current rent roll (leases
// are roughly constant month to month).
//
// LIK Management (2010) is the management company, so ITS revenue is the
// management fees it earns across the portfolio — each property's revenue times
// its management-fee rate (which varies by property; sourced from the budgets).

import "server-only";
import { getJSON } from "@/lib/storage";
import type { RentRollData } from "@/lib/rentroll/parseRentRollExcel";
import { summarizeSnapshot } from "@/lib/rentroll/snapshot";
import { listBudgets } from "@/lib/financials/budgets/storage";
import { monthKey } from "./util";

// Mirrors the rent-roll storage keys in app/api/rentroll/history/route.ts.
const RENTROLL_PREFIX = "rentroll";
const RENTROLL_ID = "current";
const HISTORY_PREFIX = "rentroll-history";

const LIK_CODE = "2010"; // LIK Management, Inc.

/** Management-fee rate (percent) per property code (uppercased), read from each
 *  budget's "Management Fee" line (GL 6610-*). Varies by property. */
async function managementFeePcts(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const wb of await listBudgets()) {
    for (const property of wb.properties) {
      if (property.propertyCode === "CONSOLIDATED") continue;
      for (const sec of property.sections) {
        for (const line of sec.lines) {
          if (line.isSubtotal || line.feePercent == null) continue;
          if (!/management fee/i.test(line.label)) continue;
          out[property.propertyCode.toUpperCase()] = line.feePercent;
        }
      }
    }
  }
  return out;
}

/** Anticipated monthly gross billings per property code (uppercased) for a
 *  cash-sheet (year, month). Empty when no rent roll is loaded. LIK Management
 *  (2010) is the sum of management fees it earns across the managed properties
 *  (each property's revenue × its fee rate). */
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
  // LIK's revenue = management fees earned: Σ (property revenue × its fee rate).
  const feePcts = await managementFeePcts();
  let likFees = 0;
  for (const [code, revenue] of Object.entries(out)) {
    if (code === LIK_CODE) continue;
    const pct = feePcts[code];
    if (pct != null) likFees += revenue * (pct / 100);
  }
  if (likFees > 0) out[LIK_CODE] = Math.round(likFees);
  return out;
}

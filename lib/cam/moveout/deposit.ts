// Shared security-deposit lookup for a departing tenant — used by the watcher's
// approval email and the finalize step so both net the settlement the same way.

import "server-only";
import { listDeposits } from "@/lib/deposits/storage";
import type { SecurityDeposit } from "@/lib/deposits/deposits";
import type { CloseOutDeposit } from "./queue";
import { sameTenant } from "@/lib/leasing/confirmedMoveouts";

/** The departing tenant's deposit. The SUITE alone is not enough: once a
 *  suite is re-leased it holds the new tenant's deposit too, and the close-out
 *  netted against that. So: a deposit on this suite filed under THIS tenant
 *  first; then one filed under their name anywhere (deposits are sometimes
 *  filed under the company, not the unit); then the suite's, when no name is
 *  known or nothing matches it. Prefers one still on file. */
export function pickDeposit(all: SecurityDeposit[], unitRef: string, name: string | undefined): SecurityDeposit | null {
  const n = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const isTenant = (d: SecurityDeposit) => !!name && (sameTenant(d.tenantCompany, name)
    || n(d.tenantCompany).includes(n(name)) || (n(d.tenantCompany).length >= 8 && n(name).includes(n(d.tenantCompany))));
  const byUnit = all.filter((d) => d.unitRef.toLowerCase() === unitRef.toLowerCase());
  const unitAndName = byUnit.filter(isTenant);
  const byName = all.filter(isTenant);
  const pool = unitAndName.length ? unitAndName : byName.length ? byName : byUnit;
  return pool.find((d) => !d.refunded && !d.tenantDefaulted) ?? pool[pool.length - 1] ?? null;
}

/** Deposit + net-settlement snapshot. `net` (deposit − reconciliation balance)
 *  is only meaningful when the deposit is still applicable (held / partial). */
export function depositSettlement(d: SecurityDeposit | null, balance: number): CloseOutDeposit | null {
  if (!d) return null;
  const status = d.refunded ? "refunded" : d.tenantDefaulted ? "forfeited" : d.partialRefund ? "partial" : "held";
  const applies = status === "held" || status === "partial";
  return { amount: d.amount, status, net: applies ? d.amount - balance : null };
}

/** Convenience: look up + settle in one call. */
export async function tenantDepositSettlement(unitRef: string, name: string | undefined, balance: number): Promise<CloseOutDeposit | null> {
  const all = await listDeposits().catch(() => [] as SecurityDeposit[]);
  return depositSettlement(pickDeposit(all, unitRef, name), balance);
}

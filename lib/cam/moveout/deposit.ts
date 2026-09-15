// Shared security-deposit lookup for a departing tenant — used by the watcher's
// approval email and the finalize step so both net the settlement the same way.

import "server-only";
import { listDeposits } from "@/lib/deposits/storage";
import type { SecurityDeposit } from "@/lib/deposits/deposits";
import type { CloseOutDeposit } from "./queue";

/** The departing tenant's deposit — by unit ref, falling back to a company-name
 *  contains match (deposits are sometimes filed under the company, not the
 *  unit). Prefers one still on file over a refunded/forfeited record. */
export function pickDeposit(all: SecurityDeposit[], unitRef: string, name: string | undefined): SecurityDeposit | null {
  const byUnit = all.filter((d) => d.unitRef.toLowerCase() === unitRef.toLowerCase());
  const byName = name ? all.filter((d) => d.tenantCompany.toLowerCase().includes(name.toLowerCase())) : [];
  const pool = byUnit.length ? byUnit : byName;
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

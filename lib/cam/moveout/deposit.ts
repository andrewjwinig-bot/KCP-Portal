// Shared security-deposit lookup for a departing tenant — used by the watcher's
// approval email and the finalize step so both net the settlement the same way.

import "server-only";
import { listDeposits } from "@/lib/deposits/storage";
import type { SecurityDeposit } from "@/lib/deposits/deposits";
import type { CloseOutDeposit } from "./queue";
import { sameTenant } from "@/lib/leasing/confirmedMoveouts";
import { allRuns } from "@/lib/statements/store";
import { pickOpenAr, totalDue, type MoveoutOpenAr } from "./openAr";

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

/** Deposit + net-settlement snapshot. `net` (deposit − what the tenant owes:
 *  the true-up plus their open balance) is only meaningful when the deposit is
 *  still applicable (held / partial). */
export function depositSettlement(d: SecurityDeposit | null, balance: number): CloseOutDeposit | null {
  if (!d) return null;
  const status = d.refunded ? "refunded" : d.tenantDefaulted ? "forfeited" : d.partialRefund ? "partial" : "held";
  const applies = status === "held" || status === "partial";
  return { amount: d.amount, status, net: applies ? d.amount - balance : null };
}


// ── The whole settlement: true-up + open balance − deposit ──────────────────
// The close-out is the tenant's final bill, so the deposit is netted against
// everything they owe — the reconciliation AND the open balance on their
// newest monthly statement (`openAr.ts`) — never the true-up alone.


export type MoveoutSettlement = {
  reconBalance: number;
  /** Null when no monthly statement carries this tenant. */
  openAr: MoveoutOpenAr | null;
  /** reconBalance + the open balance. */
  totalDue: number;
  deposit: CloseOutDeposit | null;
};

export async function tenantOpenAr(unitRef: string, name: string | undefined, year: number): Promise<MoveoutOpenAr | null> {
  const runs = await allRuns().catch(() => []);
  return pickOpenAr(runs, unitRef, name, year);
}

/** `deposits` when the caller already holds them (the watcher loads them once
 *  per run); otherwise they are read here. */
export async function moveoutSettlement(
  unitRef: string, name: string | undefined, year: number, reconBalance: number, deposits?: SecurityDeposit[],
): Promise<MoveoutSettlement> {
  const openAr = await tenantOpenAr(unitRef, name, year);
  const due = totalDue(reconBalance, openAr);
  const all = deposits ?? await listDeposits().catch(() => [] as SecurityDeposit[]);
  return { reconBalance, openAr, totalDue: due, deposit: depositSettlement(pickDeposit(all, unitRef, name), due) };
}

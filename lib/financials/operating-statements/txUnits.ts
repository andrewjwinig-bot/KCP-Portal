// One rule for "which suite/tenant is this GL transaction?", shared by the
// line-detail drill-down and the rent-roll check.
//
// Three chart patterns exist in this ledger and a drill-down that disagreed
// with the check would show a tenant as billed on one screen and missing on
// the other, so the resolution lives here rather than in either route.

import type { TenantDirectory } from "./tenants";

export type TxLike = { vendor?: string; description: string };

export type TxIdentity = {
  /** Canonical unit ref when the row belongs to a suite, else null. */
  unit: string | null;
  tenant: string | null;
  /** Stable key for grouping rows that belong to the same suite/payer. */
  groupKey: string;
  /** How the row was identified — so a caller can trust `unit` for a
   *  rent-roll comparison only when the suite is real evidence. */
  via: "account" | "unit-ref" | "payer";
};

/** The payer named on a charge: the stored vendor, else the leading half of a
 *  merged description (GLs imported before vendor was stored separately). */
export function payerOf(t: TxLike): string {
  return (t.vendor && t.vendor.trim()) || (t.description || "").split(" — ")[0].trim();
}

/**
 * Identify one transaction.
 *   A) the GL account IS a unit ref the rent roll knows — the account decides;
 *   B) the unit ref is written into the charge's own text ("RNT to 9510-406"),
 *      which is how Skyline posts rent to a single revenue account;
 *   C) neither — fall back to the named payer, and match it back to a suite by
 *      name only as a convenience (never treated as evidence of a suite).
 */
export function identifyTx(dir: TenantDirectory, account: string, t: TxLike): TxIdentity {
  const acctTenant = dir.tenantForAccount(account);
  if (acctTenant) return { unit: account, tenant: acctTenant, groupKey: `A:${account}`, via: "account" };

  const hit = dir.findUnit(t.description) ?? dir.findUnit(t.vendor || "");
  // A vacant/expired suite resolves its unit but has no occupant — say the
  // suite rather than falling back to the posting text.
  if (hit) return { unit: hit.unitRef, tenant: hit.tenant, groupKey: `U:${hit.unitRef}`, via: "unit-ref" };

  const payer = payerOf(t);
  const tenant = payer || null;
  return { unit: tenant ? dir.unitForName(tenant) : null, tenant, groupKey: `P:${payer || account}`, via: "payer" };
}

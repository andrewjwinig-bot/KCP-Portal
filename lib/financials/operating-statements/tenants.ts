// Tenant-name lookup for operating statements.
//
// Rental-income (and other tenant-attributable) lines split across per-tenant
// GL sub-accounts whose codes match the rent roll's unit refs. Resolving an
// account to its tenant lets statements name the tenant (e.g. "new lease for
// Acme Corp") and break a line down per tenant — instead of citing a raw GL/
// unit code like "1100-12330". Single source so the analyze route, the
// transaction drill-down, and anything else agree.

import "server-only";
import { getJSON } from "@/lib/storage";
import type { RentRollData } from "@/lib/rentroll/parseRentRollExcel";

export type TenantLookup = (account: string) => string | null;

/** Normalize a code to "<property>-<unit-without-leading-zeros>" so GL accounts
 *  match rent-roll unit refs even when one side zero-pads the unit segment. */
function normUnit(code: string): string {
  const seg = code.toUpperCase().split("-");
  return seg.length >= 2 ? `${seg[0]}-${seg.slice(1).join("-").replace(/^0+/, "")}` : code.toUpperCase();
}

/** Normalize a tenant/payer name for fuzzy matching: upper-case, drop common
 *  entity suffixes and store numbers, strip non-alphanumerics. So a GL payer
 *  ("SHEAR SENSATION LLC #2") matches the rent-roll occupant ("Shear Sensation"). */
function normName(s: string): string {
  return s.toUpperCase()
    .replace(/\b(LLC|L\.?L\.?C|INC|CORP|CORPORATION|CO|COMPANY|LP|LLP|LTD|PLLC|PC|THE|DBA)\b/g, "")
    .replace(/#?\s*\d+\s*$/, "")
    .replace(/[^A-Z0-9]/g, "");
}

export type TenantDirectory = {
  /** GL account → occupant name (null when the account isn't an occupied unit). */
  tenantForAccount: (account: string) => string | null;
  /** Tenant/payer name → unit ref / suite (null when no match). */
  unitForName: (name: string) => string | null;
};

/** Build the rent-roll lookups once: account→tenant and tenant-name→unit. */
export async function buildTenantDirectory(): Promise<TenantDirectory> {
  const rentroll = (await getJSON("rentroll", "current")) as RentRollData | null;
  const byCode = new Map<string, string>();
  const unitByName = new Map<string, string>();
  if (rentroll) {
    for (const p of rentroll.properties) for (const u of p.units) {
      const name = (u.occupantName || "").trim();
      if (!name || u.isVacant) continue;
      byCode.set(u.unitRef.toUpperCase(), name);
      byCode.set(normUnit(u.unitRef), name);
      const nn = normName(name);
      if (nn && !unitByName.has(nn)) unitByName.set(nn, u.unitRef);
    }
  }
  const unitForName = (name: string): string | null => {
    const nn = normName(name);
    if (!nn) return null;
    if (unitByName.has(nn)) return unitByName.get(nn)!;
    // Fall back to a containment match either direction (handles a payer that
    // carries a longer/shorter form than the roster name).
    for (const [k, unit] of unitByName) if (k.includes(nn) || nn.includes(k)) return unit;
    return null;
  };
  return {
    tenantForAccount: (account) => byCode.get(account.toUpperCase()) ?? byCode.get(normUnit(account)) ?? null,
    unitForName,
  };
}

/** Build a GL-account → tenant-name lookup from the current rent roll. Returns
 *  a function that yields the tenant name for an account, or null when the
 *  account doesn't map to an occupied unit (e.g. an expense account). */
export async function buildTenantLookup(): Promise<TenantLookup> {
  const dir = await buildTenantDirectory();
  return dir.tenantForAccount;
}

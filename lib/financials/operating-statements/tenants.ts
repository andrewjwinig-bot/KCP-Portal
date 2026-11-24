// Tenant-name lookup for operating statements.
//
// Rental-income (and other tenant-attributable) lines split across per-tenant
// GL sub-accounts whose codes match the rent roll's unit refs. Resolving an
// account to its tenant lets statements name the tenant (e.g. "new lease for
// Acme Corp") and break a line down per tenant — instead of citing a raw GL/
// unit code like "1100-12330". Single source so the analyze route, the
// transaction drill-down, and anything else agree.

import "server-only";
import { resolveCurrentRentroll } from "@/lib/rentroll/current";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import type { RentRollData } from "@/lib/rentroll/parseRentRollExcel";

export type TenantLookup = (account: string) => string | null;

/** A unit ref resolved out of a GL row: the suite it belongs to, and the
 *  rent-roll occupant when the unit is currently leased. */
export type UnitHit = { unitRef: string; tenant: string | null };

/** Unit-ref shaped tokens inside free text — "RNT to 9510-406",
 *  "CAM to 2300-1817-CU". A property code is 3–5 leading chars (40A0, 3610A),
 *  then one or more dashed segments. Candidates only: every hit is checked
 *  against the rent roll / PROPERTY_DEFS before it is believed, so a date or a
 *  invoice number that happens to share the shape is discarded. */
const UNIT_TOKEN = /\b[0-9][0-9A-Z]{2,4}-[0-9A-Z]+(?:-[0-9A-Z]+)*\b/g;

const PROPERTY_CODES = new Set(PROPERTY_DEFS.map((p) => p.id.toUpperCase()));

/** Skyline suffixes a charge account with "-CU" (`2300-1817-CU` → `2300-1817`);
 *  the portal stores the stripped form, matching the rent roll and the portal
 *  token. Strip it before any lookup — per CLAUDE.md this is the first thing to
 *  check when a unit lookup misses. */
export function canonicalUnitRef(code: string): string {
  return code.toUpperCase().replace(/-CU$/, "");
}

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
  /** Pull a unit ref out of a GL description/vendor ("RNT to 9510-406") and
   *  resolve it against the rent roll. Null when the text carries no unit ref
   *  the portal recognises. */
  findUnit: (text: string) => UnitHit | null;
};

/** Build the rent-roll lookups once: account→tenant and tenant-name→unit.
 *
 *  Reads the roll COMPOSED FROM HISTORY — what the Rent Roll page shows — not
 *  the stored "current" pointer. The pointer is only rewritten when someone
 *  opens the Rent Roll page, so after a parser fix it went on carrying the old
 *  figures: 1100's Ferry Good Treats read $2,000 on the Rent Roll page and $0
 *  on the operating statement, which then called the correct charge
 *  "UNEXPECTED $2,000". */
export async function buildTenantDirectory(roll?: RentRollData | null): Promise<TenantDirectory> {
  return directoryFromRoll(roll !== undefined ? roll : await resolveCurrentRentroll());
}

export function directoryFromRoll(rentroll: RentRollData | null): TenantDirectory {
  const byCode = new Map<string, string>();
  const unitByName = new Map<string, string>();
  // Every unit ref in the roll, VACANT ONES INCLUDED, so a charge posted to a
  // suite between tenants still resolves its suite — it just has no name.
  const refByCode = new Map<string, string>();
  if (rentroll) {
    for (const p of rentroll.properties) for (const u of p.units) {
      const ref = canonicalUnitRef(u.unitRef);
      refByCode.set(ref, u.unitRef);
      refByCode.set(normUnit(ref), u.unitRef);
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
  const tenantForAccount = (account: string): string | null =>
    byCode.get(account.toUpperCase()) ?? byCode.get(normUnit(account)) ?? null;

  const findUnit = (text: string): UnitHit | null => {
    if (!text) return null;
    const hits = text.toUpperCase().match(UNIT_TOKEN);
    if (!hits) return null;
    let shapeOnly: UnitHit | null = null;
    for (const raw of hits) {
      const code = canonicalUnitRef(raw);
      // The rent roll is the evidence: an exact (or zero-pad-normalised) hit
      // gives the suite and, when it is leased, the occupant.
      const ref = refByCode.get(code) ?? refByCode.get(normUnit(code));
      if (ref) return { unitRef: canonicalUnitRef(ref), tenant: tenantForAccount(ref) };
      // A unit that has since dropped off the roll still names its suite, as
      // long as it leads with a property code the portal knows. Held back so a
      // later token with a real rent-roll match wins over it.
      if (!shapeOnly && PROPERTY_CODES.has(code.split("-")[0])) shapeOnly = { unitRef: code, tenant: null };
    }
    return shapeOnly;
  };

  return { tenantForAccount, unitForName, findUnit };
}

/** Build a GL-account → tenant-name lookup from the current rent roll. Returns
 *  a function that yields the tenant name for an account, or null when the
 *  account doesn't map to an occupied unit (e.g. an expense account). */
export async function buildTenantLookup(): Promise<TenantLookup> {
  const dir = await buildTenantDirectory();
  return dir.tenantForAccount;
}

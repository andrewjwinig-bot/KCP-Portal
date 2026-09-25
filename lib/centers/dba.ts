import "server-only";
import { centerByCode, normName } from "./registry";
import { getCenterOverride } from "./store";

// Server-side resolution of a tenant's public display name (DBA) for reports
// (status report, statements). DBA only applies to the five public shopping
// centers; for any other property code these return null/"" and callers leave
// the rent-roll name as-is.

/** Merged DBA map for a center — registry defaults overlaid by admin overrides,
 *  keyed by normName(tenant). Returns null when `code` isn't a public shopping
 *  center or has no names (so callers skip a blob read for non-centers). */
export async function resolveDbaMap(code: string): Promise<Record<string, string> | null> {
  const profile = centerByCode(code);
  if (!profile) return null;
  const ov = await getCenterOverride(profile.code);
  const merged = { ...(profile.displayNames ?? {}), ...(ov.dba ?? {}) };
  return Object.keys(merged).length ? merged : null;
}

/** Look up a tenant's DBA in a merged map (exact then loose contains match),
 *  mirroring the public page's lookupByName. Returns "" when none. */
export function dbaFor(map: Record<string, string> | null | undefined, name: string): string {
  if (!map || !name) return "";
  const key = normName(name);
  if (map[key]) return map[key];
  for (const [k, v] of Object.entries(map)) if (k && (key.includes(k) || k.includes(key))) return v;
  return "";
}

/** Report label for a tenant: "DBA (Rent-roll name)" when a distinct DBA
 *  exists, otherwise the plain name. */
export function dbaLabel(map: Record<string, string> | null | undefined, name: string): string {
  const dba = dbaFor(map, name);
  if (dba && normName(dba) !== normName(name || "")) return `${dba} (${name})`;
  return name;
}

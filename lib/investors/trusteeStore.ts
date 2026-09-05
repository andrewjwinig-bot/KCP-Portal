// Editable overrides + additions for the trustee directory. The seed rows live
// in structures.ts; this overlays them so Harry / Alison / Drew can correct a
// trustee's details, add a new trustee, or remove one — without a code change.
//
// Scoped by directory key (currently only "hyman-korman-co") and keyed by the
// normalized trustee name within that directory.

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";
import type { TrusteeDirectoryRow } from "@/lib/investors/structures";

const PREFIX = "ownership-trustees";

/** A stored row override. `deleted` hides a seeded row; otherwise the fields
 *  overlay (or add) a row. */
export interface TrusteeOverride extends Partial<TrusteeDirectoryRow> {
  name: string;
  deleted?: boolean;
}

export type TrusteeOverrides = Record<string, TrusteeOverride>;

export function normTrusteeKey(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

export async function getTrusteeOverrides(directoryKey: string): Promise<TrusteeOverrides> {
  return ((await getJSON(PREFIX, directoryKey, { retryOnMiss: true })) as TrusteeOverrides | null) ?? {};
}

/** Upsert (or clear, when `row` is null) one trustee override in a directory. */
export async function saveTrusteeOverride(directoryKey: string, key: string, row: TrusteeOverride | null): Promise<TrusteeOverrides> {
  const map = await getTrusteeOverrides(directoryKey);
  const k = normTrusteeKey(key);
  if (row === null) delete map[k];
  else map[k] = { ...row, name: row.name.trim() };
  await storeJSON(PREFIX, directoryKey, map);
  return map;
}

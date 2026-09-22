import "server-only";
import { getJSON, listJSON } from "@/lib/storage";
import { snapshotMonthKey } from "./snapshot";
import type { RentRollData, RentRollUnit } from "./parseRentRollExcel";

// Read-only resolution of the "current" rent roll. "Current" is composed as a
// PER-PROPERTY UNION across history: each property is taken from the latest
// snapshot that contains it, with the newest snapshot's top-level metadata.
//
// This is what keeps a PARTIAL import from erasing properties it omitted: if a
// month's roll only covers the office buildings, the retail properties simply
// carry forward from the last snapshot that had them, rather than vanishing.
// For a normal full import (the latest snapshot has every property) this is
// identical to "the latest snapshot" — the union only ever adds back a property
// the newest snapshot is missing. Mirrors the /api/rentroll logic minus the
// self-healing write, so read paths never mutate storage.

const RENTROLL_PREFIX = "rentroll";
const RENTROLL_ID = "current";
const HISTORY_PREFIX = "rentroll-history";

const propCode = (p: { propertyCode?: string }) => String(p?.propertyCode ?? "").toUpperCase();

/** Compose the current roll from all history snapshots: newest snapshot's
 *  properties (in order), then any property missing from it carried forward
 *  from progressively older snapshots (most-recent version wins). Returns null
 *  for an empty history. Exported so the API route and readers share one rule. */
export function composeCurrentRoll<T extends { properties?: any[] }>(snapshots: T[]): T | null {
  const valid = snapshots.filter((s) => s && Array.isArray((s as { properties?: unknown[] }).properties));
  if (!valid.length) return null;
  const sorted = [...valid].sort((a, b) => snapshotMonthKey(a as any).localeCompare(snapshotMonthKey(b as any)));
  const newest = sorted[sorted.length - 1];
  const props: any[] = [];
  const seen = new Set<string>();
  for (const p of newest.properties ?? []) { props.push(p); seen.add(propCode(p)); }
  for (let i = sorted.length - 2; i >= 0; i--) {
    for (const p of sorted[i].properties ?? []) {
      const c = propCode(p);
      if (c && !seen.has(c)) { props.push(p); seen.add(c); }
    }
  }
  return { ...(newest as T), properties: props };
}

export async function resolveCurrentRentroll(): Promise<RentRollData | null> {
  const snapshots = (await listJSON(HISTORY_PREFIX)) as RentRollData[];
  const composed = composeCurrentRoll(snapshots);
  if (composed) return composed;
  return (await getJSON(RENTROLL_PREFIX, RENTROLL_ID)) as RentRollData | null;
}

/**
 * The roll AS OF a month: each property from the latest snapshot at or before
 * `monthKey` ("YYYY-MM"). An August statement is checked against the August
 * roll, so a later import can't move August's expectation. With no snapshot
 * that early, uses the EARLIEST snapshot. Null for empty history.
 */
export function rollAsOf<T extends { properties?: any[] }>(snapshots: T[], monthKey: string): T | null {
  const eligible = snapshots.filter((s) => s && snapshotMonthKey(s as any).localeCompare(monthKey) <= 0);
  if (eligible.length) return composeCurrentRoll(eligible);
  // A month BEFORE any snapshot: the EARLIEST roll is the closest evidence.
  // Falling back to the newest would check January against September's rates,
  // the drift this function exists to prevent.
  const valid = snapshots.filter((s) => s && Array.isArray((s as { properties?: unknown[] }).properties));
  if (!valid.length) return null;
  const earliest = valid.map((s) => snapshotMonthKey(s as any)).sort()[0];
  return composeCurrentRoll(valid.filter((s) => snapshotMonthKey(s as any) === earliest));
}

/** Find one unit by ref in the current rent roll (case-insensitive). */
export async function findRentRollUnit(unitRef: string): Promise<RentRollUnit | null> {
  const data = await resolveCurrentRentroll();
  if (!data) return null;
  const ref = unitRef.trim().toUpperCase();
  for (const p of data.properties) {
    const u = p.units.find((x) => x.unitRef.toUpperCase() === ref);
    if (u) return u;
  }
  return null;
}

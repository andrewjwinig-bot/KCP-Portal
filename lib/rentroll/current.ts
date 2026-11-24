import "server-only";
import { getJSON, listJSON } from "@/lib/storage";
import { importRank, snapshotMonthKey } from "./snapshot";
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

/** Compose the current roll from all history snapshots: each property from the
 *  snapshot holding its most recent IMPORT (`importRank` — the earlier of the
 *  report month and the import month, then the import time), so a property a
 *  later import omitted carries forward and a roll dated ahead of its import
 *  never outranks a later one. The top-level metadata is the most recent
 *  snapshot's. Null for an empty history. Exported so the API route and
 *  readers share one rule. */
export function composeCurrentRoll<T extends { properties?: any[] }>(snapshots: T[]): T | null {
  const valid = snapshots.filter((s) => s && Array.isArray((s as { properties?: unknown[] }).properties));
  if (!valid.length) return null;
  const rank = (s: T, p?: any) => importRank(s as any, p);
  const sorted = [...valid].sort((a, b) => rank(b).localeCompare(rank(a)) || snapshotMonthKey(b as any).localeCompare(snapshotMonthKey(a as any)));
  const best = new Map<string, { p: any; r: string; order: number }>();
  let order = 0;
  for (const s of sorted) {
    for (const p of s.properties ?? []) {
      const c = propCode(p);
      if (!c) continue;
      const r = rank(s, p);
      const was = best.get(c);
      if (!was) best.set(c, { p, r, order: order++ });
      else if (r.localeCompare(was.r) > 0) best.set(c, { p, r, order: was.order });
    }
  }
  const props = [...best.values()].sort((a, b) => a.order - b.order).map((x) => x.p);
  return { ...(sorted[0] as T), properties: props };
}

/** Lay a newly imported roll over the SAME MONTH's existing snapshot,
 *  property by property: the import's properties replace theirs, and every
 *  property the import did not carry is KEPT. A snapshot is keyed by its
 *  report month, so writing an office-only file straight over a month that
 *  already held the full roll erased every retail and residential property
 *  for that month — and with no older snapshot to carry them forward, from
 *  the current roll too. Re-importing a property still replaces it. */
export function mergeSameMonth<T extends { properties?: any[] }>(existing: T | null | undefined, imported: T): T {
  // Each property remembers when IT was imported — the month document's own
  // uploadedAt is the last import's, and the kept properties are older.
  const at = (imported as { uploadedAt?: string }).uploadedAt;
  if (at) imported = { ...imported, properties: (imported.properties ?? []).map((p) => (p.importedAt ? p : { ...p, importedAt: at })) };
  if (!existing || !Array.isArray(existing.properties) || !existing.properties.length) return imported;
  const incoming = new Set((imported.properties ?? []).map(propCode));
  const kept = existing.properties.filter((p) => !incoming.has(propCode(p)));
  return kept.length ? { ...imported, properties: [...(imported.properties ?? []), ...kept] } : imported;
}

export async function resolveCurrentRentroll(): Promise<RentRollData | null> {
  // FRESH: a snapshot is overwritten in place, and the CDN serves its old body
  // for a minute or more after an import.
  const snapshots = (await listJSON(HISTORY_PREFIX, { fresh: true })) as RentRollData[];
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

import "server-only";
import { getJSON, listJSON } from "@/lib/storage";
import { snapshotMonthKey } from "./snapshot";
import type { RentRollData, RentRollUnit } from "./parseRentRollExcel";

// Read-only resolution of the "current" rent roll — the snapshot with the
// LATEST report month across history (mirrors the /api/rentroll logic, minus
// the self-healing write, so read paths like the tenant portal never mutate
// storage). Use for server-side per-unit lookups.

const RENTROLL_PREFIX = "rentroll";
const RENTROLL_ID = "current";
const HISTORY_PREFIX = "rentroll-history";

export async function resolveCurrentRentroll(): Promise<RentRollData | null> {
  const snapshots = (await listJSON(HISTORY_PREFIX)) as RentRollData[];
  if (!snapshots.length) {
    return (await getJSON(RENTROLL_PREFIX, RENTROLL_ID)) as RentRollData | null;
  }
  let latest = snapshots[0];
  let latestMonth = snapshotMonthKey(latest);
  for (const snap of snapshots) {
    const m = snapshotMonthKey(snap);
    if (m.localeCompare(latestMonth) > 0) {
      latest = snap;
      latestMonth = m;
    }
  }
  return latest;
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

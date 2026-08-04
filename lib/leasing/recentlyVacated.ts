// "Which tenants recently vacated and still need a close-out?" — the same
// snapshot-diff the dashboard's Vacating Tenants card does, computed
// server-side so the weekly digest email can list close-out candidates.
//
// A tenant is "recently vacated" when they occupied a unit in the rent-roll
// snapshot from ~60 days ago but that unit is now vacant (or taken by someone
// else) in the current roll — so they've dropped off the live roll entirely.

import "server-only";
import { getJSON, listJSON } from "@/lib/storage";
import type { RentRollData } from "@/lib/rentroll/parseRentRollExcel";

const RENTROLL_PREFIX = "rentroll";
const RENTROLL_ID = "current";
const HISTORY_PREFIX = "rentroll-history";

export type VacatedTenant = {
  propertyCode: string;
  unitRef: string;
  occupantName: string;
  sqft: number;
  leaseTo: string | null;
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function monthKeyOf(r: { reportTo?: string | null; uploadedAt?: string | null }): string {
  const m = (r.reportTo ?? "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}`;
  const d = r.uploadedAt ? new Date(r.uploadedAt) : new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Tenants who vacated in roughly the last 60 days (close-out candidates). */
export async function recentlyVacatedTenants(now = new Date()): Promise<VacatedTenant[]> {
  const current = (await getJSON(RENTROLL_PREFIX, RENTROLL_ID)) as RentRollData | null;
  if (!current) return [];
  const history = ((await listJSON(HISTORY_PREFIX)) as RentRollData[]) ?? [];
  if (!history.length) return [];

  // Pick the newest snapshot at or before ~60 days ago; else the oldest we have.
  const target = new Date(now);
  target.setDate(target.getDate() - 60);
  const targetKey = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}`;
  const withKey = history
    .map((h) => ({ h, key: monthKeyOf(h) }))
    .sort((a, b) => a.key.localeCompare(b.key));
  const atOrBefore = withKey.filter((x) => x.key <= targetKey);
  const prior = (atOrBefore.length ? atOrBefore[atOrBefore.length - 1] : withKey[0])?.h;
  if (!prior) return [];

  // Current occupancy by unitRef.
  const currentByRef = new Map<string, { occupantName: string; isVacant: boolean }>();
  for (const p of current.properties) for (const u of p.units) {
    currentByRef.set(u.unitRef, { occupantName: u.occupantName, isVacant: u.isVacant });
  }

  const out: VacatedTenant[] = [];
  const seen = new Set<string>();
  for (const prop of prior.properties) {
    for (const unit of prop.units) {
      if (unit.isVacant || unit.amenity || !unit.occupantName) continue;
      const cur = currentByRef.get(unit.unitRef);
      const gone = !cur || cur.isVacant || norm(cur.occupantName) !== norm(unit.occupantName);
      if (!gone) continue;
      const dedup = `${unit.unitRef}|${norm(unit.occupantName)}`;
      if (seen.has(dedup)) continue;
      seen.add(dedup);
      out.push({
        propertyCode: prop.propertyCode,
        unitRef: unit.unitRef,
        occupantName: unit.occupantName,
        sqft: unit.sqft,
        leaseTo: unit.leaseTo,
      });
    }
  }
  return out.sort((a, b) => a.occupantName.localeCompare(b.occupantName));
}

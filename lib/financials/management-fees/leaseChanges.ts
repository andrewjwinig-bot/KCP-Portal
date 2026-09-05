// Lease changes month-over-month for a building — who commenced and who vacated,
// derived by diffing consecutive rent-roll snapshots. Used to annotate the
// Management Fees modal so a revenue swing (and the fee that rides on it) ties
// directly to the lease event that caused it.
//
// The revenue a tenant contributes is base rent + their estimated CAM/INS/RET
// (the rent roll's `grossRentTotal` = base + opexMonth + reTaxMonth + otherMonth),
// so that's the $/mo we report as gained/lost.

import "server-only";
import { getJSON } from "@/lib/storage";
import type { RentRollData } from "@/lib/rentroll/parseRentRollExcel";

const HISTORY_PREFIX = "rentroll-history";
const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

export type LeaseChange = {
  kind: "commenced" | "vacated";
  tenant: string;
  unitRef: string;
  /** Monthly revenue gained (commenced, +) or lost (vacated, −): base + CAM/INS/RET. */
  amount: number;
};

type UnitLite = { unitRef: string; occupantName: string; grossRentTotal: number };

async function snapshot(year: number, month: number): Promise<RentRollData | null> {
  return (await getJSON(HISTORY_PREFIX, `${year}-${String(month).padStart(2, "0")}`)) as RentRollData | null;
}

/** Occupied units of one building (property code), keyed by unitRef. */
function occupiedUnits(snap: RentRollData | null, code: string): Map<string, UnitLite> {
  const out = new Map<string, UnitLite>();
  if (!snap) return out;
  for (const p of snap.properties ?? []) {
    if (String(p.propertyCode).toUpperCase() !== code.toUpperCase()) continue;
    for (const u of p.units ?? []) {
      if (u.isVacant || u.amenity || !u.occupantName) continue;
      out.set(u.unitRef, { unitRef: u.unitRef, occupantName: u.occupantName, grossRentTotal: u.grossRentTotal ?? 0 });
    }
  }
  return out;
}

/** Per-month (1–12) lease changes for a building. A month's list compares that
 *  month's snapshot to the prior month's (December of the prior year for
 *  January), so a tenant who appears/disappears — or a unit that swaps tenants —
 *  shows as a commencement and/or a vacate with the revenue delta. */
export async function leaseChangesByMonth(code: string, year: number): Promise<LeaseChange[][]> {
  const snaps: (RentRollData | null)[] = [];
  for (let m = 1; m <= 12; m++) snaps.push(await snapshot(year, m));
  const decPrev = await snapshot(year - 1, 12);

  const out: LeaseChange[][] = [];
  for (let m = 1; m <= 12; m++) {
    const curr = occupiedUnits(snaps[m - 1], code);
    const prev = occupiedUnits(m === 1 ? decPrev : snaps[m - 2], code);
    // No comparison possible (missing either snapshot) → no annotations.
    if (!curr.size && !prev.size) { out.push([]); continue; }
    if ((m === 1 && !decPrev) || (m > 1 && !snaps[m - 2]) || !snaps[m - 1]) { out.push([]); continue; }

    const changes: LeaseChange[] = [];
    // Commenced: occupied now, but not by the same tenant before.
    for (const [ref, u] of curr) {
      const before = prev.get(ref);
      if (!before || norm(before.occupantName) !== norm(u.occupantName)) {
        changes.push({ kind: "commenced", tenant: u.occupantName, unitRef: ref, amount: Math.round(u.grossRentTotal ?? 0) });
      }
    }
    // Vacated: occupied before, but not by the same tenant now.
    for (const [ref, u] of prev) {
      const after = curr.get(ref);
      if (!after || norm(after.occupantName) !== norm(u.occupantName)) {
        changes.push({ kind: "vacated", tenant: u.occupantName, unitRef: ref, amount: -Math.round(u.grossRentTotal ?? 0) });
      }
    }
    // Vacates first, then commencements — reads as "lost X, gained Y".
    changes.sort((a, b) => (a.kind === b.kind ? Math.abs(b.amount) - Math.abs(a.amount) : a.kind === "vacated" ? -1 : 1));
    out.push(changes);
  }
  return out;
}

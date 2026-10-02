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
import { sameTenant } from "@/lib/leasing/confirmedMoveouts";
import type { RentRollData } from "@/lib/rentroll/parseRentRollExcel";

const HISTORY_PREFIX = "rentroll-history";

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

/** Occupied units of one building (property code), keyed by unitRef — or
 *  NULL when the snapshot does not carry the building at all (a partial,
 *  office-only import), which says nothing about who is there. */
function occupiedUnits(snap: RentRollData | null, code: string): Map<string, UnitLite> | null {
  const out = new Map<string, UnitLite>();
  if (!snap) return null;
  const has = (snap.properties ?? []).some((p) => String(p.propertyCode).toUpperCase() === code.toUpperCase());
  if (!has) return null;
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
    // No comparison possible (either month missing, or a partial import that
    // doesn't carry this building) → no annotations, rather than every tenant
    // "vacating" one month and "commencing" the next.
    if (!curr || !prev) { out.push([]); continue; }
    if (!curr.size && !prev.size) { out.push([]); continue; }

    // A tenant still in the BUILDING (moved suites, or a name that drifted —
    // `sameTenant`, the move-out rule) neither vacated nor commenced.
    const prevNames = [...prev.values()].map((u) => u.occupantName);
    const currNames = [...curr.values()].map((u) => u.occupantName);
    const changes: LeaseChange[] = [];
    // Commenced: occupied now by a tenant not in the building before.
    for (const [ref, u] of curr) {
      if (!prevNames.some((n) => sameTenant(n, u.occupantName))) {
        changes.push({ kind: "commenced", tenant: u.occupantName, unitRef: ref, amount: Math.round(u.grossRentTotal ?? 0) });
      }
    }
    // Vacated: in the building before, nowhere in it now.
    for (const [ref, u] of prev) {
      if (!currNames.some((n) => sameTenant(n, u.occupantName))) {
        changes.push({ kind: "vacated", tenant: u.occupantName, unitRef: ref, amount: -Math.round(u.grossRentTotal ?? 0) });
      }
    }
    // Vacates first, then commencements — reads as "lost X, gained Y".
    changes.sort((a, b) => (a.kind === b.kind ? Math.abs(b.amount) - Math.abs(a.amount) : a.kind === "vacated" ? -1 : 1));
    out.push(changes);
  }
  return out;
}

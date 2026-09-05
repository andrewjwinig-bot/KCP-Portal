// Move-out candidates — recently-vacated and expiring-soon tenants across the
// portfolio, limited to properties that have a reconciliation fixture (office or
// retail) so each one can actually be closed out. Shared by the interim page's
// picker (via the route) and the daily watcher, so both see the same set.

import "server-only";
import { getJSON } from "@/lib/storage";
import type { RentRollData } from "@/lib/rentroll/parseRentRollExcel";
import { recentlyVacatedTenants } from "@/lib/leasing/recentlyVacated";
import { RETAIL_RECON_FIXTURES } from "@/lib/cam/retail/registry";
import { OFFICE_RECON_FIXTURES } from "@/lib/cam/office/registry";
import { parseUS, propName } from "./compute";

export type MoveoutCandidate = {
  propertyCode: string;
  propertyName: string;
  unitRef: string;
  name: string;
  leaseTo: string | null;
  kind: "vacated" | "expiring";
  /** Days until (>0) / since (<0) the lease end. */
  days: number | null;
  /** Lease-end year / month parsed from leaseTo (the recon year + as-of month). */
  year: number | null;
  month: number | null;
  /** Which recon engine closes this property out. */
  reconKind: "office" | "retail";
};

const DAY = 86_400_000;
const parseDate = (s: string | null | undefined): Date | null => {
  const m = s?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2])) : null;
};
const keyOf = (ref: string, name: string) => `${ref}|${name.toLowerCase().replace(/[^a-z0-9]/g, "")}`;

/** reconKind for a fixtured property, or null when it has no fixture. */
export function reconKindFor(code: string): "office" | "retail" | null {
  if (RETAIL_RECON_FIXTURES[code]) return "retail";
  if (OFFICE_RECON_FIXTURES[code]) return "office";
  return null;
}

export async function moveoutCandidates(now = new Date()): Promise<MoveoutCandidate[]> {
  const byRef = new Map<string, MoveoutCandidate>();

  // Recently vacated (dropped off the roll in ~last 60 days).
  const vacated = await recentlyVacatedTenants(now).catch(() => []);
  for (const v of vacated) {
    const reconKind = reconKindFor(v.propertyCode);
    if (!reconKind) continue;
    const d = parseDate(v.leaseTo);
    const p = parseUS(v.leaseTo);
    // A vacated tenant with a missing/unparseable lease-end would otherwise get
    // year/month = null and be skipped by the watcher forever. But we know when
    // they left: the last history snapshot they still occupied. Fall back to
    // that so they still get reconciled.
    let year = p?.y ?? null, month = p?.m ?? null;
    if ((year == null || month == null) && v.lastSeen) {
      const mm = v.lastSeen.match(/^(\d{4})-(\d{2})$/);
      if (mm) { year = Number(mm[1]); month = Number(mm[2]); }
    }
    byRef.set(keyOf(v.unitRef, v.occupantName), {
      propertyCode: v.propertyCode, propertyName: propName(v.propertyCode), unitRef: v.unitRef, name: v.occupantName,
      leaseTo: v.leaseTo, kind: "vacated", days: d ? Math.round((d.getTime() - now.getTime()) / DAY) : null,
      year, month, reconKind,
    });
  }

  // Expiring soon / recently expired but still on the roll (−60…+90 days).
  const rr = (await getJSON("rentroll", "current")) as RentRollData | null;
  for (const prop of rr?.properties ?? []) {
    const reconKind = reconKindFor(prop.propertyCode);
    if (!reconKind) continue;
    for (const u of prop.units) {
      if (u.isVacant || !u.occupantName || !u.leaseTo) continue;
      const d = parseDate(u.leaseTo);
      if (!d) continue;
      const days = Math.round((d.getTime() - now.getTime()) / DAY);
      if (days < -60 || days > 90) continue;
      const key = keyOf(u.unitRef, u.occupantName);
      if (byRef.has(key)) continue; // a vacated match takes precedence
      const p = parseUS(u.leaseTo);
      byRef.set(key, {
        propertyCode: prop.propertyCode, propertyName: propName(prop.propertyCode), unitRef: u.unitRef, name: u.occupantName,
        leaseTo: u.leaseTo, kind: "expiring", days, year: p?.y ?? null, month: p?.m ?? null, reconKind,
      });
    }
  }

  return [...byRef.values()].sort((a, b) => (a.days ?? 99_999) - (b.days ?? 99_999));
}

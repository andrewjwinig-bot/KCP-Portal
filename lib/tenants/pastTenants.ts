// Past-tenants archive — derived, not stored. There is no "tenant" entity in
// the portal (everything is keyed by unitRef), but every monthly rent-roll
// snapshot IS a point-in-time record of who occupied each unit and what they
// paid. Walking the snapshots reconstructs each tenancy's full timeline; a
// tenancy is "past" when its tenant is no longer the current occupant of the
// unit. Enriched on the detail view with their security deposits and their final
// move-out close-out.

import "server-only";
import { listJSON } from "@/lib/storage";
import { snapshotMonthKey } from "@/lib/rentroll/snapshot";
import { resolveCurrentRentroll } from "@/lib/rentroll/current";
import type { RentRollData, RentRollUnit } from "@/lib/rentroll/parseRentRollExcel";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import { listDeposits } from "@/lib/deposits/storage";
import type { SecurityDeposit } from "@/lib/deposits/deposits";
import { listMoveoutSends, type MoveoutSendEntry } from "@/lib/cam/moveout/sendLog";

const HISTORY_PREFIX = "rentroll-history";
const propName = (code: string) => PROPERTY_DEFS.find((p) => p.id.toUpperCase() === (code ?? "").toUpperCase())?.name ?? code;

// Legal-entity boilerplate stripped before comparing names, so "Acme LLC" and
// "Acme Inc" read as the same tenant across months (mirrors lib/tenants/match).
const NOISE = new Set([
  "the", "llc", "llc.", "inc", "inc.", "incorporated", "corp", "corp.", "corporation",
  "co", "co.", "company", "ltd", "ltd.", "limited", "lp", "llp", "plc", "pllc",
  "group", "holdings", "enterprises", "associates", "partners", "and", "of",
]);
export function normTenantName(s: string): string {
  const toks = (s ?? "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean).filter((t) => !NOISE.has(t));
  return (toks.length ? toks.join(" ") : (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")) || "(unnamed)";
}

export type PastTenancyMonth = {
  month: string; // YYYY-MM
  sqft: number;
  baseRent: number;
  annualRent: number;
  cam: number; // opexMonth
  ret: number; // reTaxMonth
  ins: number; // otherMonth
  leaseFrom: string | null;
  leaseTo: string | null;
};

export type PastTenancy = {
  key: string; // `${unitRef}|${normName}` (URL-safe-ish; the API passes unitRef + name instead)
  unitRef: string;
  suite: string;
  propertyCode: string;
  propertyName: string;
  name: string; // most-recent occupantName spelling
  firstMonth: string;
  lastMonth: string;
  monthsOccupied: number;
  leaseFrom: string | null;
  leaseTo: string | null;
  lastSqft: number;
  lastBaseRent: number;
  lastAnnualRent: number;
  lastCam: number;
  lastRet: number;
  lastIns: number;
};

export type PastTenancyDetail = PastTenancy & {
  timeline: PastTenancyMonth[];
  deposits: SecurityDeposit[];
  closeOut: MoveoutSendEntry | null;
};

const isRealTenant = (u: RentRollUnit) => !u.isVacant && !!u.occupantName && !u.amenity;

/** All rent-roll snapshots, oldest → newest by month key. */
async function snapshotsByMonth(): Promise<{ month: string; data: RentRollData }[]> {
  const all = ((await listJSON(HISTORY_PREFIX)) as RentRollData[]) ?? [];
  return all
    .filter((s) => s && Array.isArray(s.properties))
    .map((data) => ({ month: snapshotMonthKey(data), data }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

/** Current occupant (normalized) per unit — used to exclude the live tenant of
 *  each unit from the "past" set. */
async function currentOccupantByUnit(): Promise<Map<string, string>> {
  const current = await resolveCurrentRentroll();
  const map = new Map<string, string>();
  for (const p of current?.properties ?? []) {
    for (const u of p.units) if (isRealTenant(u)) map.set(u.unitRef, normTenantName(u.occupantName));
  }
  return map;
}

type Acc = {
  unitRef: string; propertyCode: string; name: string; suite: string;
  firstMonth: string; lastMonth: string; months: Set<string>;
  leaseFrom: string | null; leaseTo: string | null;
  last: RentRollUnit;
};

/** Every PAST tenancy across the portfolio, newest departure first. */
export async function listPastTenancies(): Promise<PastTenancy[]> {
  const snaps = await snapshotsByMonth();
  const currentByUnit = await currentOccupantByUnit();
  const acc = new Map<string, Acc>();

  for (const { month, data } of snaps) {
    for (const p of data.properties) {
      for (const u of p.units) {
        if (!isRealTenant(u)) continue;
        const norm = normTenantName(u.occupantName);
        const key = `${u.unitRef}|${norm}`;
        const cur = acc.get(key);
        if (!cur) {
          acc.set(key, {
            unitRef: u.unitRef, propertyCode: u.propertyCode || p.propertyCode, name: u.occupantName,
            suite: u.unitRef.split("-").slice(1).join("-"),
            firstMonth: month, lastMonth: month, months: new Set([month]),
            leaseFrom: u.leaseFrom, leaseTo: u.leaseTo, last: u,
          });
        } else {
          cur.lastMonth = month; cur.months.add(month); cur.name = u.occupantName; cur.last = u;
          if (u.leaseTo) cur.leaseTo = u.leaseTo;
          if (!cur.leaseFrom && u.leaseFrom) cur.leaseFrom = u.leaseFrom;
        }
      }
    }
  }

  const out: PastTenancy[] = [];
  for (const [key, a] of acc) {
    // Past = not the current occupant of that unit.
    if (currentByUnit.get(a.unitRef) === normTenantName(a.name)) continue;
    out.push({
      key, unitRef: a.unitRef, suite: a.suite, propertyCode: a.propertyCode, propertyName: propName(a.propertyCode),
      name: a.name, firstMonth: a.firstMonth, lastMonth: a.lastMonth, monthsOccupied: a.months.size,
      leaseFrom: a.leaseFrom, leaseTo: a.leaseTo,
      lastSqft: a.last.sqft ?? 0, lastBaseRent: a.last.baseRent ?? 0, lastAnnualRent: a.last.annualRent ?? 0,
      lastCam: a.last.opexMonth ?? 0, lastRet: a.last.reTaxMonth ?? 0, lastIns: a.last.otherMonth ?? 0,
    });
  }
  return out.sort((a, b) => (a.lastMonth < b.lastMonth ? 1 : a.lastMonth > b.lastMonth ? -1 : a.name.localeCompare(b.name)));
}

/** One past tenancy's full profile: monthly charge/rent timeline + their
 *  security deposits + their finalized move-out close-out. Matched by unitRef +
 *  normalized name. */
export async function getPastTenancy(unitRef: string, name: string): Promise<PastTenancyDetail | null> {
  const norm = normTenantName(name);
  const snaps = await snapshotsByMonth();
  const timeline: PastTenancyMonth[] = [];
  let a: Acc | null = null;

  for (const { month, data } of snaps) {
    let unit: RentRollUnit | undefined;
    for (const p of data.properties) {
      const u = p.units.find((x) => x.unitRef === unitRef && isRealTenant(x) && normTenantName(x.occupantName) === norm);
      if (u) { unit = u; break; }
    }
    if (!unit) continue;
    timeline.push({
      month, sqft: unit.sqft ?? 0, baseRent: unit.baseRent ?? 0, annualRent: unit.annualRent ?? 0,
      cam: unit.opexMonth ?? 0, ret: unit.reTaxMonth ?? 0, ins: unit.otherMonth ?? 0,
      leaseFrom: unit.leaseFrom, leaseTo: unit.leaseTo,
    });
    if (!a) a = { unitRef, propertyCode: unit.propertyCode, name: unit.occupantName, suite: unitRef.split("-").slice(1).join("-"), firstMonth: month, lastMonth: month, months: new Set([month]), leaseFrom: unit.leaseFrom, leaseTo: unit.leaseTo, last: unit };
    else { a.lastMonth = month; a.months.add(month); a.name = unit.occupantName; a.last = unit; if (unit.leaseTo) a.leaseTo = unit.leaseTo; if (!a.leaseFrom && unit.leaseFrom) a.leaseFrom = unit.leaseFrom; }
  }
  if (!a) return null;

  // Deposits: by unit ref, else a company-name contains match.
  const allDeposits = await listDeposits().catch(() => [] as SecurityDeposit[]);
  const byUnit = allDeposits.filter((d) => d.unitRef.toLowerCase() === unitRef.toLowerCase());
  const byName = allDeposits.filter((d) => normTenantName(d.tenantCompany) === norm);
  const deposits = byUnit.length ? byUnit : byName;

  // Final move-out close-out, if one was finalized for this tenancy.
  const sends = await listMoveoutSends(200).catch(() => [] as MoveoutSendEntry[]);
  const closeOut = sends.find((s) => s.unitRef === unitRef && normTenantName(s.name) === norm) ?? null;

  return {
    key: `${unitRef}|${norm}`, unitRef, suite: a.suite, propertyCode: a.propertyCode, propertyName: propName(a.propertyCode),
    name: a.name, firstMonth: a.firstMonth, lastMonth: a.lastMonth, monthsOccupied: a.months.size,
    leaseFrom: a.leaseFrom, leaseTo: a.leaseTo,
    lastSqft: a.last.sqft ?? 0, lastBaseRent: a.last.baseRent ?? 0, lastAnnualRent: a.last.annualRent ?? 0,
    lastCam: a.last.opexMonth ?? 0, lastRet: a.last.reTaxMonth ?? 0, lastIns: a.last.otherMonth ?? 0,
    timeline, deposits, closeOut,
  };
}

import "server-only";
import { resolveCurrentRentroll } from "@/lib/rentroll/current";
import type { RentRollUnit } from "@/lib/rentroll/parseRentRollExcel";
import { allRuns } from "@/lib/statements/store";
import { summarize } from "@/lib/statements/summary";
import type { StatementRun } from "@/lib/statements/types";
import { centerByCode } from "../registry";
import { designedPlan, liveDesignedSuites } from "./render";
import { sameOccupant, UNPROFILED_TENANT } from "./sync";
import { isoDate, type StaffPlan, type StaffSuite, type StaffSuiteAr, type StaffSuiteMoney } from "./staffPlanMath";
import { buildingPlanFor, floorLabel, floorMeta } from "@/lib/buildings/plans";
import { isSharedSpace } from "@/lib/officeWorks/offices";
import { PROPERTY_DEFS } from "@/lib/properties/data";

// The property page's INTERNAL site plan: the designed centre's drawing (the
// same shapes the public page draws — `liveDesignedSuites`, so the two can
// never disagree about who is where) with what staff need laid on each suite:
// the roll's own occupant name, lease dates, rent and recoveries, and the
// tenant's open A/R from their newest monthly statement.

/** Properties whose page shows the plan — every designed centre (Parkwood
 *  first, then the rest: owner, "roll it out to the other centers"). A new
 *  designed centre joins by adding its slug here once its `plan` is set. */
export const STAFF_PLAN_SLUGS = new Set(["parkwood", "brookwood", "grays-ferry", "lafayette-hill", "parkwood-professional"]);

export function staffPlanSlug(code: string): string | null {
  const slug = centerByCode(code)?.slug;
  return slug && STAFF_PLAN_SLUGS.has(slug) && designedPlan(slug) ? slug : null;
}

const suiteOf = (unitRef: string) => unitRef.split("-").slice(1).join("-").toUpperCase();
const round2 = (n: number) => Math.round(n * 100) / 100;

/** The tenant's newest statement — by suite AND name, so a re-leased suite
 *  never shows the last occupant's balance (the move-out rule, `openAr.ts`). */
function arFor(unitRefs: string[], occupant: string | null, runs: StatementRun[]): StaffSuiteAr | null {
  if (!occupant) return null;
  const refs = new Set(unitRefs.map((r) => r.toUpperCase()));
  for (const run of runs) {
    const st = run.statements.find((s) => refs.has(s.unitRef.toUpperCase()) && sameOccupant(s.tenantName, occupant));
    if (!st) continue;
    if (st.noOpenItems) return { totalDue: 0, pastDue: 0, period: run.period, asOf: st.importedAt ?? null };
    const sum = summarize(st, run.period);
    return { totalDue: round2(sum.totalDue), pastDue: round2(sum.pastDueAmount), period: run.period, asOf: st.importedAt ?? null };
  }
  return null;
}

/** What a suite's rent-roll rows say: the lead occupant, lease dates, money. */
function fromRoll(rows: RentRollUnit[], sfFallback: number, money: boolean) {
  const occ = rows.filter((u) => !u.isVacant && u.occupantName);
  const lead = occ[0] ?? null;
  const sum = (f: (u: RentRollUnit) => number) => round2(occ.reduce((t, u) => t + (f(u) || 0), 0));
  const sf = rows.length ? Math.round(rows.reduce((t, u) => t + (u.sqft || 0), 0)) : sfFallback;
  const annual = sum((u) => u.annualRent);
  const m: StaffSuiteMoney | undefined = money && occ.length ? {
    baseRent: sum((u) => u.baseRent),
    rentPsf: sf > 0 ? round2(annual / sf) : 0,
    cam: sum((u) => u.opexMonth),
    ret: sum((u) => u.reTaxMonth),
    other: sum((u) => u.otherMonth),
    gross: sum((u) => u.grossRentTotal),
  } : undefined;
  return {
    occupant: lead?.occupantName ?? null,
    sf,
    leased: occ.length > 0,
    leaseFrom: isoDate(lead?.leaseFrom),
    leaseTo: isoDate(lead?.leaseTo),
    money: m,
  };
}

export async function buildStaffPlan(code: string, opts: { money: boolean; ar: boolean }): Promise<StaffPlan | null> {
  const slug = staffPlanSlug(code);
  if (!slug) return buildBuildingPlan(code, opts);
  const plan = designedPlan(slug)!;
  const [live, roll, runs] = await Promise.all([
    liveDesignedSuites(slug),
    resolveCurrentRentroll().catch(() => null),
    opts.ar ? allRuns().catch((): StatementRun[] => []) : Promise.resolve([] as StatementRun[]),
  ]);
  if (!live) return null;
  const prop = roll?.properties.find((p) => p.propertyCode.toUpperCase() === code.toUpperCase());
  const bySuite = new Map<string, RentRollUnit[]>();
  for (const u of prop?.units ?? []) {
    if (u.amenity) continue;
    const k = suiteOf(u.unitRef);
    bySuite.set(k, [...(bySuite.get(k) ?? []), u]);
  }
  // The designed suites as synced (who / SF / status), with the curated ids;
  // `units` comes from the design itself, which sync does not carry through.
  const designedUnits = new Map(live.designed.suites.map((s) => [s.id, s.units ?? [s.id]]));

  const suites: StaffSuite[] = live.suites.filter((s) => !s.ref).map((s) => {
    const rows = (designedUnits.get(s.id) ?? [s.id]).flatMap((id) => bySuite.get(id.toUpperCase()) ?? []);
    const occ = rows.filter((u) => !u.isVacant && u.occupantName);
    const lead = occ[0] ?? null;
    const sum = (f: (u: RentRollUnit) => number) => round2(occ.reduce((t, u) => t + (f(u) || 0), 0));
    const sf = rows.length ? Math.round(rows.reduce((t, u) => t + (u.sqft || 0), 0)) : s.sf;
    const annual = sum((u) => u.annualRent);
    const occupant = lead?.occupantName ?? null;
    const publicName = s.tenant && s.tenant !== UNPROFILED_TENANT && s.tenant !== "Available" ? s.tenant : "";
    const unitRefs = rows.map((u) => u.unitRef);
    return {
      id: s.id,
      label: /^\d{5}$/.test(s.id) ? s.id.slice(-3) : s.id,
      pts: s.pts ? ([] as string[]).concat(s.pts) : undefined,
      rects: s.pts ? undefined : (s.rects ?? [[s.x, s.y, s.w, s.h]]),
      cx: s.cx ?? s.x + s.w / 2, cy: s.cy ?? s.y + s.h / 2, rot: s.rot ?? 0, fs: s.fs, w: s.w, h: s.h,
      tenant: publicName || occupant || (s.status === "available" ? "Vacant" : s.tenant),
      occupant,
      unitRefs,
      sf,
      status: s.status,
      shadow: s.shadow || undefined,
      addr: typeof s.addr === "string" ? s.addr : undefined,
      leaseFrom: isoDate(lead?.leaseFrom),
      leaseTo: isoDate(lead?.leaseTo),
      money: opts.money && occ.length ? {
        baseRent: sum((u) => u.baseRent),
        rentPsf: sf > 0 ? round2(annual / sf) : 0,
        cam: sum((u) => u.opexMonth),
        ret: sum((u) => u.reTaxMonth),
        other: sum((u) => u.otherMonth),
        gross: sum((u) => u.grossRentTotal),
      } : undefined,
      ar: opts.ar && s.status === "leased" ? arFor(unitRefs, occupant, runs) : undefined,
    };
  });

  return {
    code: live.profile.code, slug, name: live.profile.name, plan,
    suites,
    rollImportedAt: prop?.importedAt ?? null,
    canSeeMoney: opts.money,
    canSeeAr: opts.ar,
  };
}

/** An office building's floor plans (lib/buildings/plans): each mapped suite
 *  coloured from the live rent roll, floor by floor — the same card, colours
 *  and hover as a centre's site plan (owner: "show the leased vs occupied
 *  space color coded and filled in … on the property info page as well"). */
async function buildBuildingPlan(code: string, opts: { money: boolean; ar: boolean }): Promise<StaffPlan | null> {
  const bp = buildingPlanFor(code);
  if (!bp) return null;
  const [roll, runs] = await Promise.all([
    resolveCurrentRentroll().catch(() => null),
    opts.ar ? allRuns().catch((): StatementRun[] => []) : Promise.resolve([] as StatementRun[]),
  ]);
  const prop = roll?.properties.find((p) => p.propertyCode.toUpperCase() === code.toUpperCase());
  const byRef = new Map<string, RentRollUnit[]>();
  for (const u of prop?.units ?? []) {
    if (u.amenity) continue;
    const k = u.unitRef.toUpperCase();
    byRef.set(k, [...(byRef.get(k) ?? []), u]);
  }
  const mapped = new Set<string>();
  const suites: StaffSuite[] = [];
  for (const f of bp.floors) {
    const floor = String(f.floor);
    for (const m of f.suites) {
      const ref = m.unit.toUpperCase();
      mapped.add(ref);
      const rows = byRef.get(ref) ?? [];
      const r = fromRoll(rows, 0, opts.money);
      const xs = m.pts.flatMap((p) => p.split(" ").map((q) => Number(q.split(",")[0])));
      const ys = m.pts.flatMap((p) => p.split(" ").map((q) => Number(q.split(",")[1])));
      const id = m.unit.split("-").slice(1).join("-");
      suites.push({
        id: m.unit, label: id, pts: m.pts,
        cx: m.cx, cy: m.cy, rot: 0,
        w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys),
        tenant: r.occupant ?? (rows.length ? "Vacant" : "Not on the rent roll"),
        occupant: r.occupant,
        unitRefs: rows.length ? [rows[0].unitRef] : [m.unit],
        sf: r.sf,
        status: r.leased ? "leased" : "available",
        // A mapped suite the roll no longer carries (combined, renumbered) is drawn but not counted.
        shadow: rows.length ? undefined : true,
        leaseFrom: r.leaseFrom, leaseTo: r.leaseTo,
        money: r.money,
        ar: opts.ar && r.leased ? arFor(rows.map((u) => u.unitRef), r.occupant, runs) : undefined,
        floor,
      });
    }
  }
  const unmapped = [...byRef.entries()]
    .filter(([ref, rows]) => !mapped.has(ref) && !isSharedSpace(ref.split("-").slice(1).join("-"), rows[0].occupantName ?? ""))
    .map(([, rows]) => {
      const r = fromRoll(rows, 0, false);
      return { unitRef: rows[0].unitRef, tenant: r.occupant ?? "Vacant", sf: r.sf, vacant: !r.leased };
    })
    .sort((a, b) => a.unitRef.localeCompare(b.unitRef, undefined, { numeric: true }));
  const first = bp.floors[0];
  return {
    code: bp.code, slug: "", name: PROPERTY_DEFS.find((p) => p.id === code)?.name ?? code,
    plan: floorMeta(first),
    suites,
    rollImportedAt: prop?.importedAt ?? null,
    canSeeMoney: opts.money,
    canSeeAr: opts.ar,
    floors: bp.floors.map((f) => ({ floor: String(f.floor), label: floorLabel(f.floor), plan: floorMeta(f) })),
    unmapped,
  };
}

import "server-only";
import { resolveCurrentRentroll } from "@/lib/rentroll/current";
import type { RentRollUnit } from "@/lib/rentroll/parseRentRollExcel";
import { allRuns } from "@/lib/statements/store";
import { summarize } from "@/lib/statements/summary";
import type { StatementRun } from "@/lib/statements/types";
import { centerByCode } from "../registry";
import { designedPlan, liveDesignedSuites } from "./render";
import { sameOccupant, UNPROFILED_TENANT } from "./sync";
import { isoDate, type StaffPlan, type StaffSuite, type StaffSuiteAr } from "./staffPlanMath";

// The property page's INTERNAL site plan: the designed centre's drawing (the
// same shapes the public page draws — `liveDesignedSuites`, so the two can
// never disagree about who is where) with what staff need laid on each suite:
// the roll's own occupant name, lease dates, rent and recoveries, and the
// tenant's open A/R from their newest monthly statement.

/** Properties whose page shows the plan. Parkwood first (owner: "start with
 *  parkwood"); the other designed centres carry a `plan` already and join by
 *  adding their slug here. */
export const STAFF_PLAN_SLUGS = new Set(["parkwood"]);

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

export async function buildStaffPlan(code: string, opts: { money: boolean; ar: boolean }): Promise<StaffPlan | null> {
  const slug = staffPlanSlug(code);
  if (!slug) return null;
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

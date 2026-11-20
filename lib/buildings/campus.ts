import "server-only";
import { resolveCurrentRentroll } from "@/lib/rentroll/current";
import { allRuns } from "@/lib/statements/store";
import type { StatementRun } from "@/lib/statements/types";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import { arFor } from "@/lib/centers/designed/staffPlan";
import { CAMPUS, CAMPUS_PAGES } from "./plans";
import { buildingFigures, type CampusView } from "./campusMath";

/** The campus map for a holding entity's page (3610A JV III Condo, 4000 NI LLC):
 *  every Interplex building on the map, each with its figures off the CURRENT
 *  rent roll. What a viewer may see is decided by the caller (the siteplan
 *  route), as for a building's floor plans. */
export async function buildCampus(code: string, opts: { money: boolean; ar: boolean }): Promise<CampusView | null> {
  const fund = CAMPUS_PAGES[code.toUpperCase()];
  if (!fund) return null;
  const [roll, runs] = await Promise.all([
    resolveCurrentRentroll().catch(() => null),
    opts.ar ? allRuns().catch((): StatementRun[] => []) : Promise.resolve([] as StatementRun[]),
  ]);
  const today = new Date();
  let importedAt: string | null = null;
  const buildings = CAMPUS.buildings.map((b) => {
    const prop = roll?.properties.find((p) => p.propertyCode.toUpperCase() === b.code);
    if (prop?.importedAt && (!importedAt || prop.importedAt > importedAt)) importedAt = prop.importedAt;
    const units = prop?.units ?? [];
    const f = buildingFigures(units, today);
    const def = PROPERTY_DEFS.find((p) => p.id === b.code);
    let pastDue: number | undefined;
    if (opts.ar) {
      pastDue = 0;
      for (const u of units) {
        if (u.amenity || u.isVacant || !u.occupantName) continue;
        pastDue += arFor([u.unitRef], u.occupantName, runs)?.pastDue ?? 0;
      }
      pastDue = Math.round(pastDue * 100) / 100;
    }
    return {
      ...b,
      name: def?.name ?? b.name,
      fund: (def?.fundGroup === "JV III" || def?.fundGroup === "NI LLC" ? def.fundGroup : null) as "JV III" | "NI LLC" | null,
      onRoll: !!prop,
      ...f,
      baseRentAnnual: opts.money ? f.baseRentAnnual : undefined,
      avgRentPsf: opts.money ? f.avgRentPsf : undefined,
      pastDue,
    };
  });
  return {
    src: CAMPUS.src, width: CAMPUS.width, height: CAMPUS.height, fund, buildings,
    rollImportedAt: importedAt, canSeeMoney: opts.money, canSeeAr: opts.ar,
  };
}

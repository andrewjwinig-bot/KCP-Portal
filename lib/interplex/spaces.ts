// The Neshaminy Interplex Business Center website's Available Space table
// (client-safe, pure). The handoff shipped sample suites; the page now lists
// the CURRENT RENT ROLL's vacancies in the park's ten buildings — a suite
// that leases leaves the table on the next import, a vacancy appears.

import { isSharedSpace } from "@/lib/officeWorks/offices";
import { chosenTurn, isPlanCrop, type PlanCrop } from "@/lib/suites/floorplanTurn";

/** The page's building ids (its campus map) → the portal's property codes.
 *  Building Five's Office Works suites are 4900, deliberately not here: they
 *  are offered on The Office Works' own page. */
export const INTERPLEX_BUILDINGS: Record<string, string> = {
  "1": "3610", "2": "3620", "4": "3640",
  "5": "4050", "6": "4060", "7": "4070", "8": "4080",
  A: "40A0", B: "40B0", C: "40C0",
};

/** The handoff's figure, kept for a page served before any roll is reachable. */
export const DESIGN_TOTAL_SF = 379315;

export type InterplexSpace = {
  bldg: string; suite: string; sf: number; floor?: string; available: string;
  /** The roll's unit ref — the key the unit page's floor plan is stored under. */
  unit: string;
  /** The unit page's floor plan, through the public /api/website/floorplan. */
  floorplan?: string; floorplanPdf?: boolean;
  /** A turn chosen by hand for the PDF; absent → the rule (`planRotation`). */
  floorplanTurn?: number;
  /** The suite's part of the sheet, chosen on the unit page (`PlanCrop`). */
  floorplanCrop?: PlanCrop;
};

export type RollUnitForSpace = { unitRef: string; occupantName: string; isVacant: boolean; sqft: number; amenity?: unknown };
export type RollPropertyForSpace = { propertyCode: string; totalSqft?: number; units: RollUnitForSpace[] };

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;

/** "110" → "1st", "300" → "3rd"; anything but a three-digit suite has no floor. */
export function floorOf(suite: string): string | undefined {
  return /^[1-9]\d\d$/.test(suite) ? ordinal(Number(suite[0])) : undefined;
}

/** Every vacant, rentable suite in the park, smallest first (the page sorts too). */
export function spacesFromRoll(properties: RollPropertyForSpace[]): InterplexSpace[] {
  const byCode = new Map(properties.map((p) => [p.propertyCode.toUpperCase(), p]));
  const out: InterplexSpace[] = [];
  for (const [bldg, code] of Object.entries(INTERPLEX_BUILDINGS)) {
    for (const u of byCode.get(code)?.units ?? []) {
      const suite = u.unitRef.split("-").slice(1).join("-");
      if (!u.isVacant || u.amenity || !(u.sqft > 0) || !suite || isSharedSpace(suite, u.occupantName || "")) continue;
      out.push({ bldg, suite: `Suite ${suite}`, sf: Math.round(u.sqft), floor: floorOf(suite), available: "Now", unit: u.unitRef });
    }
  }
  return out.sort((a, b) => a.sf - b.sf);
}

/** The park's rentable SF off the roll (every building on it), else the design's. */
export function totalSfFromRoll(properties: RollPropertyForSpace[]): number {
  const codes = new Set(Object.values(INTERPLEX_BUILDINGS));
  const total = properties
    .filter((p) => codes.has(p.propertyCode.toUpperCase()))
    .reduce((t, p) => t + (p.totalSqft || 0), 0);
  return total > 0 ? Math.round(total) : DESIGN_TOTAL_SF;
}

/** The hero's SF, rounded DOWN to the nearest 25K with a plus (owner: "you
 *  dont need to show exact sf … maybe say +525K sf"): 536,950 → "525K+". */
export function sfHeadline(totalSf: number): string {
  const k = Math.floor(totalSf / 25000) * 25;
  return k > 0 ? `${k}K+` : `${Math.round(totalSf).toLocaleString("en-US")}`;
}

/** Where a listed suite's floor plan is served from: the public route, keyed
 *  by unit — never the private blob URL itself. */
export const floorplanPath = (unitRef: string) => `/api/website/floorplan?unit=${encodeURIComponent(unitRef)}`;

/** Lay the unit pages' floor plans (Unit Info → Floorplan) onto the listed
 *  suites; a PDF is drawn by the page, the right way up (`planRotation`). */
export function withFloorplans(
  spaces: InterplexSpace[],
  plans: Map<string, { contentType: string; name?: string; turn?: number; crop?: unknown }>,
): InterplexSpace[] {
  return spaces.map((s) => {
    const fp = plans.get(s.unit.toUpperCase());
    if (!fp) return s;
    const pdf = /pdf/i.test(fp.contentType);
    const turn = pdf ? chosenTurn(s.unit, { name: fp.name ?? "", turn: fp.turn }) : undefined;
    return { ...s, floorplan: floorplanPath(s.unit), ...(pdf ? { floorplanPdf: true } : {}), ...(turn != null ? { floorplanTurn: turn } : {}),
      ...(pdf && isPlanCrop(fp.crop) ? { floorplanCrop: fp.crop } : {}) };
  });
}

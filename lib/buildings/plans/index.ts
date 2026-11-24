import type { PlanMeta } from "@/lib/centers/designed/staffPlanMath";
import p3610 from "./3610.json";
import p3620 from "./3620.json";
import p3640 from "./3640.json";
import p4050 from "./4050.json";
import p4060 from "./4060.json";
import p4070 from "./4070.json";
import p4080 from "./4080.json";
import campusJson from "./campus.json";

// Office buildings' FLOOR PLANS, mapped from the architect's drawings by
// scripts/floorplans/map_suites.py: each floor is its base plan (walls only,
// cropped to the floor, public/buildings/<code>/floor-<n>.png) with each
// mapped suite's PERIMETER as a polygon in that image's pixels, taken from
// the shaded KEY PLAN on the suite's own sheet. Who is in a suite and how
// big it is come from the rent roll at request time (staffPlan.ts), never
// from here. A building joins by running the script and adding its JSON below.
// Buildings 1, 2, 4, 5, 6, 7 and 8 come from the Claude Design handoff
// (korman-siteplans, 11/2026), imported by scripts/floorplans/import_handoff.py:
// each floor has a SHELL image (`src`, what the card draws), a DETAIL image
// with the interiors (`detailSrc`, revealed only inside the hovered suite) and
// a small PNG for the status report (`pdfSrc` — pdf-lib cannot read WebP).
// The images sit in public/buildings, which middleware keeps behind sign-in.

export type MappedSuite = {
  /** The rent roll's unit ref ("4050-101"). */
  unit: string;
  /** One polygon per piece, "x,y x,y …" in floor-image pixels. */
  pts: string[];
  /** Label spot — the point deepest inside the suite. */
  cx: number; cy: number;
  /** The sheet it was mapped from. */
  source?: string;
  /** A common room the roll carries with no tenant (a conference / training room). */
  amenity?: boolean;
};

export type MappedFloor = {
  floor: string | number;
  /** The shell image; `width` × `height` is the coordinate space the suites are in. */
  src: string;
  detailSrc?: string | null;
  pdfSrc?: string;
  width: number; height: number;
  suites: MappedSuite[];
};

export type BuildingPlan = { code: string; floors: MappedFloor[] };

const PLANS: Record<string, BuildingPlan> = {
  "3610": p3610 as BuildingPlan,
  "3620": p3620 as BuildingPlan,
  "3640": p3640 as BuildingPlan,
  "4050": p4050 as BuildingPlan,
  "4060": p4060 as BuildingPlan,
  "4070": p4070 as BuildingPlan,
  "4080": p4080 as BuildingPlan,
};

export function buildingPlanFor(code: string): BuildingPlan | null {
  return PLANS[code.toUpperCase()] ?? null;
}

export const floorLabel = (f: string | number) => (/^\d+$/.test(String(f)) ? `Floor ${f}` : String(f));

export const floorMeta = (f: MappedFloor): PlanMeta => ({
  src: f.src, detailSrc: f.detailSrc ?? undefined, viewBox: `0 0 ${f.width} ${f.height}`, width: f.width, height: f.height,
});

/** The Neshaminy Interplex campus map: each building's footprint, keyed to its property code. */
export type CampusBuilding = { id: string; code: string; name: string; pts: string[]; cx: number; cy: number };
export type CampusPlan = { src: string; pdfSrc?: string; width: number; height: number; buildings: CampusBuilding[] };
export const CAMPUS = campusJson as CampusPlan;
/** The pages that carry the campus map: the two holding entities. */
export const CAMPUS_PAGES: Record<string, "JV III" | "NI LLC"> = { "3610A": "JV III", "4000": "NI LLC" };

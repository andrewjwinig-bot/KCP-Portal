import type { PlanMeta } from "@/lib/centers/designed/staffPlanMath";
import p4050 from "./4050.json";

// Office buildings' FLOOR PLANS, mapped from the architect's drawings by
// scripts/floorplans/map_suites.py: each floor is its base plan (walls only,
// cropped to the floor, public/buildings/<code>/floor-<n>.png) with each
// mapped suite's PERIMETER as a polygon in that image's pixels, taken from
// the shaded KEY PLAN on the suite's own sheet. Who is in a suite and how
// big it is come from the rent roll at request time (staffPlan.ts), never
// from here. A building joins by running the script and adding its JSON below.

export type MappedSuite = {
  /** The rent roll's unit ref ("4050-101"). */
  unit: string;
  /** One polygon per piece, "x,y x,y …" in floor-image pixels. */
  pts: string[];
  /** Label spot — the point deepest inside the suite. */
  cx: number; cy: number;
  /** The sheet it was mapped from. */
  source?: string;
};

export type MappedFloor = { floor: string | number; src: string; width: number; height: number; suites: MappedSuite[] };

export type BuildingPlan = { code: string; floors: MappedFloor[] };

const PLANS: Record<string, BuildingPlan> = {
  "4050": p4050 as BuildingPlan,
};

export function buildingPlanFor(code: string): BuildingPlan | null {
  return PLANS[code.toUpperCase()] ?? null;
}

export const floorLabel = (f: string | number) => (/^\d+$/.test(String(f)) ? `Floor ${f}` : String(f));

export const floorMeta = (f: MappedFloor): PlanMeta => ({ src: f.src, viewBox: `0 0 ${f.width} ${f.height}`, width: f.width, height: f.height });

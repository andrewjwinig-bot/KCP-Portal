import { existsSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { buildingPlanFor } from "./index";

// Every mapped suite must sit on its floor image, and every image must exist —
// a bad run of scripts/floorplans/map_suites.py should fail here, not on the page.
describe("building floor plans", () => {
  for (const code of ["4050"]) {
    const bp = buildingPlanFor(code)!;
    it(`${code}: images exist and suites lie on their floor`, () => {
      expect(bp.floors.length).toBeGreaterThan(0);
      for (const f of bp.floors) {
        expect(existsSync(path.join(process.cwd(), "public", f.src))).toBe(true);
        for (const s of f.suites) {
          expect(s.unit.startsWith(`${code}-`)).toBe(true);
          expect(s.pts.length).toBeGreaterThan(0);
          for (const poly of s.pts) {
            const pts = poly.split(" ").map((q) => q.split(",").map(Number));
            expect(pts.length).toBeGreaterThanOrEqual(3);
            for (const [x, y] of pts) {
              expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(f.width);
              expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(f.height);
            }
          }
        }
      }
    });
    it(`${code}: a suite is mapped once`, () => {
      const units = bp.floors.flatMap((f) => f.suites.map((s) => s.unit));
      expect(new Set(units).size).toBe(units.length);
    });
  }
});

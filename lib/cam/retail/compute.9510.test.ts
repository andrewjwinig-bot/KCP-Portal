import { describe, it, expect } from "vitest";
import { reconcileRetailBuilding } from "./compute";
import { POOL_9510, TENANTS_9510_2025 } from "./seed/9510";

// Ties each tenant's CAM / RET balance to the 2025 Lafayette Hill CAM Billings
// workbook ("9510 LH" master, Net Due CAM = col 15, Net Due RET = col 21).
// 9510 has no separate INS pool (insurance is in CAM) → INS balance is 0.
describe("9510 Shops of Lafayette Hill — 2025 tie-out", () => {
  const result = reconcileRetailBuilding(POOL_9510, TENANTS_9510_2025);
  const by = (u: string) => result.tenants.find((t) => t.unitRef === u)!;
  const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1);

  it("Wawa (406): 21% lease share of the pool less Parking Lot Cap Ex, no admin, billed $0 (quarterly)", () => {
    const w = by("9510-406");
    near(w.camPoolEffective, 138209.53); // full pool 173,780.53 less the 35,571 cap-ex line
    near(w.camBalance, 29024.00);        // 21% × 138,209.53
    near(w.retBalance, 6911.61);         // 21% × 32,912.45
    near(w.insBalance, 0);
  });

  it("per-tenant balances tie to the workbook Net Due", () => {
    const expected: Record<string, [number, number]> = {
      "9510-408": [-828.93, 188.06],   // Vino's Pizza
      "9510-410": [-999.06, 182.77],   // Hunan Wok
      "9510-412": [304.76, 206.90],    // Touch of Class
      "9510-414": [138.79, 309.94],    // Hair Concepts
      "9510-420": [-814.84, 306.83],   // Lafayette Hill Cleaners
      "9510-422": [163.91, 154.48],    // Liang Jiang
      "9510-424": [163.91, 154.48],    // DKMNK
      "9510-426": [763.91, 70.48],     // Marvel Agency
    };
    for (const [unit, [cam, ret]] of Object.entries(expected)) {
      near(by(unit).camBalance, cam);
      near(by(unit).retBalance, ret);
      near(by(unit).insBalance, 0);
    }
  });
});

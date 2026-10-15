import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the storage layer so the test drives which months have a snapshot.
const store = new Map<string, any>();
vi.mock("@/lib/storage", () => ({
  getJSON: async (prefix: string, id: string) => store.get(`${prefix}/${id}`) ?? null,
}));

import { sumRentRollEscrow } from "./escrowFromRolls";

const UNIT = "2300-1879";

/** Seed a month's rent-roll snapshot with a unit's escrow. */
function seedMonth(year: number, month: number, cam: number, ret: number) {
  const id = `${year}-${String(month).padStart(2, "0")}`;
  store.set(`rentroll-history/${id}`, {
    properties: [{ units: [{ unitRef: UNIT, opexMonth: cam, reTaxMonth: ret }] }],
  });
}

describe("sumRentRollEscrow", () => {
  beforeEach(() => store.clear());

  it("sums only the months that have snapshots when no fill is given", () => {
    seedMonth(2026, 1, 100, 20);
    seedMonth(2026, 3, 100, 20);
    const r = { camEscrow: 0, retEscrow: 0 };
    return sumRentRollEscrow(UNIT, 2026, 1, 3).then((res) => {
      expect(res).not.toBeNull();
      expect(res!.camEscrow).toBe(200); // Jan + Mar only — Feb missing, contributes 0
      expect(res!.retEscrow).toBe(40);
      expect(res!.monthsFound).toBe(2);
      expect(res!.monthsExpected).toBe(3);
      expect(res!.monthsFilled).toBe(0);
      void r;
    });
  });

  it("fills a missing month from the per-month estimate so escrow isn't understated", async () => {
    seedMonth(2026, 1, 100, 20);
    seedMonth(2026, 3, 100, 20);
    // Feb has no snapshot → filled from the estimate (100 CAM / 20 RET).
    const res = await sumRentRollEscrow(UNIT, 2026, 1, 3, { cam: 100, ret: 20 });
    expect(res).not.toBeNull();
    expect(res!.camEscrow).toBe(300); // Jan actual + Feb filled + Mar actual
    expect(res!.retEscrow).toBe(60);
    expect(res!.monthsFound).toBe(2);
    expect(res!.monthsExpected).toBe(3);
    expect(res!.monthsFilled).toBe(1);
  });

  it("fills the whole window from the estimate when no snapshot exists at all", async () => {
    const res = await sumRentRollEscrow(UNIT, 2026, 4, 6, { cam: 50, ret: 10 });
    expect(res).not.toBeNull();
    expect(res!.camEscrow).toBe(150); // 3 months × 50
    expect(res!.retEscrow).toBe(30);
    expect(res!.monthsFound).toBe(0);
    expect(res!.monthsFilled).toBe(3);
  });

  it("returns null when nothing is found and no fill is requested", async () => {
    const res = await sumRentRollEscrow(UNIT, 2026, 4, 6);
    expect(res).toBeNull();
  });
});

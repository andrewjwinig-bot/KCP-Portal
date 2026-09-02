import { describe, it, expect, vi, beforeEach } from "vitest";

const store = new Map<string, any>();
vi.mock("@/lib/storage", () => ({
  getJSON: async (prefix: string, id: string) => store.get(`${prefix}/${id}`) ?? null,
}));

import { leaseChangesByMonth } from "./leaseChanges";

const CODE = "2300";
function seed(year: number, month: number, units: { unitRef: string; occupantName: string; isVacant?: boolean; grossRentTotal?: number }[]) {
  store.set(`rentroll-history/${year}-${String(month).padStart(2, "0")}`, {
    properties: [{ propertyCode: CODE, units: units.map((u) => ({ isVacant: false, grossRentTotal: 0, ...u })) }],
  });
}

describe("leaseChangesByMonth", () => {
  beforeEach(() => store.clear());

  it("detects a commencement with the tenant's full base+CAM/INS/RET revenue", async () => {
    seed(2026, 1, [{ unitRef: "2300-100", occupantName: "Acme", grossRentTotal: 5000 }]);
    seed(2026, 2, [
      { unitRef: "2300-100", occupantName: "Acme", grossRentTotal: 5000 },
      { unitRef: "2300-200", occupantName: "Panera", grossRentTotal: 8000 },
    ]);
    const changes = await leaseChangesByMonth(CODE, 2026);
    expect(changes[1]).toEqual([{ kind: "commenced", tenant: "Panera", unitRef: "2300-200", amount: 8000 }]);
  });

  it("detects a vacate as a negative revenue swing", async () => {
    seed(2026, 3, [{ unitRef: "2300-100", occupantName: "Acme", grossRentTotal: 5000 }]);
    seed(2026, 4, [{ unitRef: "2300-100", occupantName: "Acme", isVacant: true }]);
    const changes = await leaseChangesByMonth(CODE, 2026);
    expect(changes[3]).toEqual([{ kind: "vacated", tenant: "Acme", unitRef: "2300-100", amount: -5000 }]);
  });

  it("treats a tenant swap in one unit as a vacate + a commencement", async () => {
    seed(2026, 5, [{ unitRef: "2300-100", occupantName: "OldCo", grossRentTotal: 4000 }]);
    seed(2026, 6, [{ unitRef: "2300-100", occupantName: "NewCo", grossRentTotal: 6000 }]);
    const changes = await leaseChangesByMonth(CODE, 2026);
    // Vacate sorts before commencement.
    expect(changes[5]).toEqual([
      { kind: "vacated", tenant: "OldCo", unitRef: "2300-100", amount: -4000 },
      { kind: "commenced", tenant: "NewCo", unitRef: "2300-100", amount: 6000 },
    ]);
  });

  it("emits nothing for a month with no comparable prior snapshot", async () => {
    seed(2026, 7, [{ unitRef: "2300-100", occupantName: "Acme", grossRentTotal: 5000 }]);
    const changes = await leaseChangesByMonth(CODE, 2026);
    expect(changes[6]).toEqual([]); // July present, June missing → no diff
    expect(changes[7]).toEqual([]); // August missing entirely
  });
});

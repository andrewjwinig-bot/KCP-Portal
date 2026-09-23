import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/cam/retail/registry", () => ({ RETAIL_RECON_FIXTURES: { "2300": { byYear: { 2024: {}, 2025: {} } } } }));
vi.mock("@/lib/cam/office/registry", () => ({ OFFICE_RECON_FIXTURES: { "4070": { byYear: { 2025: {} } } } }));

const loadRetailRecon = vi.fn();
const loadOfficeRecon = vi.fn();
vi.mock("@/lib/cam/retail/loadResult", () => ({ loadRetailRecon: (...a: any[]) => loadRetailRecon(...a) }));
vi.mock("@/lib/cam/office/loadResult", () => ({ loadOfficeRecon: (...a: any[]) => loadOfficeRecon(...a) }));

vi.mock("@/lib/rentroll/current", () => ({ resolveCurrentRentroll: async () => null }));

import { estimateReimbursements, tenancyMonths, type SuiteTenancy } from "./reimbursementEstimate";

const suite = (unitRef: string, months: number[], assumedFrom = 13, status: SuiteTenancy["status"] = "contracted"): SuiteTenancy => ({
  unitRef, tenant: "T", sqft: 1000, months, status,
  assumed: months.map((_, i) => i + 1 >= assumedFrom),
});
const flat = (n: number) => new Array(12).fill(n);

describe("recoveries follow the rent months", () => {
  it("pays from the first rent month to the last — a free-rent month inside the lease still pays", () => {
    const m = [0, 0, 100, 0, 100, 100, 100, 100, 0, 0, 0, 0];
    expect(tenancyMonths(suite("x", m)).months).toEqual([false, false, true, true, true, true, true, true, false, false, false, false]);
  });

  it("a lease ending with no decision stops paying when its rent stops; a renewal carries on, assumed", async () => {
    loadRetailRecon.mockResolvedValue({ result: { tenants: [
      { unitRef: "2300-1", name: "Ends", camDue: 12000, insDue: 0, retDue: 0, occPct: 1 },
      { unitRef: "2300-2", name: "Renews", camDue: 12000, insDue: 0, retDue: 0, occPct: 1 },
      { unitRef: "2300-3", name: "Holdover", camDue: 12000, insDue: 0, retDue: 0, occPct: 1 },
    ] } });
    const ends = flat(0).map((_, i) => (i < 6 ? 500 : 0));
    const e = (await estimateReimbursements("2300", 2026, 0, {
      poolRatios: { cam: 1, ins: 1, ret: 1 },
      tenancy: [suite("2300-1", ends, 13, "expiring"), suite("2300-2", flat(500), 7, "expiring"), suite("2300-3", flat(0), 13, "holdover")],
    }))!;
    const [a, b, c] = e.tenants;
    expect(a.cam).toEqual([...new Array(6).fill(1000), ...new Array(6).fill(0)]);
    expect(a.note).toMatch(/Lease ends Jun — no decision yet/);
    expect(b.camAnnual).toBe(12000);
    expect(b.assumed.slice(6).every(Boolean)).toBe(true);
    expect(b.assumed.slice(0, 6).some(Boolean)).toBe(false);
    expect(c.camAnnual).toBe(0);
    // The building total is the sum of the tenants, month by month.
    expect(e.monthly.cam[0]).toBe(2000);
    expect(e.monthly.cam[11]).toBe(1000);
  });

  it("a tenant on no reconciliation is assumed NNN at its pro-rata share", async () => {
    loadRetailRecon.mockResolvedValue({ result: { tenants: [
      { unitRef: "2300-1", name: "Old", camDue: 12000, insDue: 0, retDue: 0, occPct: 1, camDenom: 10000, insDenom: 10000, retDenom: 10000, camPoolFull: 100000, insPool: 0, retPool: 0 },
    ] } });
    const e = (await estimateReimbursements("2300", 2026, 0, {
      poolRatios: { cam: 1, ins: 1, ret: 1 },
      tenancy: [suite("2300-1", flat(500)), { ...suite("2300-9", flat(400)), sqft: 1000 }],
    }))!;
    const n = e.tenants.find((t) => t.unitRef === "2300-9")!;
    expect(n.camAnnual).toBe(10000); // 1,000 of 10,000 SF × $100,000
    expect(n.method).toMatchObject({ kind: "new", assumption: "nnn" });
  });

  it("scales a part-year recon tenant up to a full year", async () => {
    loadRetailRecon.mockResolvedValue({ result: { tenants: [
      { unitRef: "2300-1", name: "Half", camDue: 6000, insDue: 600, retDue: 3000, occPct: 0.5 },
    ] } });
    const e = (await estimateReimbursements("2300", 2026, 0, { poolRatios: { cam: 1, ins: 1, ret: 1 }, tenancy: [suite("2300-1", flat(500))] }))!;
    expect(e.tenants[0].camAnnual).toBe(12000);
    expect(e.tenants[0].retAnnual).toBe(6000);
    expect(e.tenants[0].method).toMatchObject({ kind: "retail", reconOcc: 0.5 });
  });
});

describe("estimateReimbursements", () => {
  it("scales the latest retail recon to the budget year (CAM/INS/RET)", async () => {
    loadRetailRecon.mockResolvedValue({ result: { tenants: [
      { unitRef: "2300-1", name: "Acme", camDue: 10000, insDue: 1000, retDue: 5000 },
    ] } });
    const e = (await estimateReimbursements("2300", 2027, 3))!;   // 1.03^(2027-2025) = 1.0609
    expect(e.kind).toBe("retail");
    expect(e.reconYear).toBe(2025);       // latest available
    expect(loadRetailRecon).toHaveBeenCalledWith("2300", 2025);
    expect(e.factor).toBe(1.0609);
    expect(e.tenants[0].camAnnual).toBe(10609);
    expect(e.tenants[0].camMonthly).toBe(884); // 10609/12
    expect(e.totals.retAnnual).toBe(5305);
  });

  it("uses opex/ret for an office property and reports no INS", async () => {
    loadOfficeRecon.mockResolvedValue({ result: { tenants: [
      { unitRef: "4070-1", name: "OSSV", opexAmountDue: 8000, retAmountDue: 400 },
    ] } });
    const e = (await estimateReimbursements("4070", 2026, 0))!;   // 0% → factor 1
    expect(e.kind).toBe("office");
    expect(e.factor).toBe(1);
    expect(e.tenants[0].camAnnual).toBe(8000);
    expect(e.tenants[0].insAnnual).toBe(0);
    expect(e.totals.retAnnual).toBe(400);
  });

  it("returns null for a property with no recon fixture", async () => {
    expect(await estimateReimbursements("0000", 2027, 3)).toBeNull();
  });
});

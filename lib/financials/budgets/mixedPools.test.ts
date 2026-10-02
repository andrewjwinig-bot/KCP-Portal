import { describe, expect, it, vi } from "vitest";

// ── the two-pot estimate for a mixed centre ────────────────────────────────
vi.mock("@/lib/cam/retail/registry", () => ({ RETAIL_RECON_FIXTURES: {
  "7010": { pool: { propertyCode: "7010" }, byYear: { 2025: {} }, mixedOfficeCode: "7010O" },
  "7010O": { pool: { propertyCode: "7010" }, byYear: { 2025: {} } },
} }));
vi.mock("@/lib/cam/office/registry", () => ({ OFFICE_RECON_FIXTURES: {} }));
const loadRetailRecon = vi.fn();
vi.mock("@/lib/cam/retail/loadResult", () => ({ loadRetailRecon: (...a: any[]) => loadRetailRecon(...a) }));
vi.mock("@/lib/cam/office/loadResult", () => ({ loadOfficeRecon: async () => null }));
vi.mock("@/lib/rentroll/current", () => ({ resolveCurrentRentroll: async () => null }));

import { mixedCenterFor, officeShare, splitLine, DEFAULT_OFFICE_SHARE } from "./mixedPools";
import { estimateReimbursements, type SuiteTenancy } from "./reimbursementEstimate";

const mc = mixedCenterFor("7010")!;

describe("which part of a 7010 line is office", () => {
  it("a line of -8503 accounts only is wholly office", () => {
    expect(officeShare(mc, "cam", "6130-8503")).toBe(1);
    expect(officeShare(mc, "cam", "6250-8503")).toBe(1);
  });
  it("a shared line takes the CAM recon's own split for it", () => {
    // Building Maintenance: retail 87,239 / office 21,956 in MIXED_7010.
    expect(officeShare(mc, "cam", "6220-8502,6220-8503")).toBeCloseTo(21956 / (87239 + 21956), 4);
    // Maintenance Salaries: 86% retail.
    expect(officeShare(mc, "cam", "6030-8502,6030-8503")).toBeCloseTo(0.14, 4);
  });
  it("taxes and insurance take the recon's tax / insurance split", () => {
    expect(officeShare(mc, "ret", "6410-*")).toBeCloseTo(22129 / (141941.88 + 22129), 4);
    expect(officeShare(mc, "ins", "6510-*")).toBeCloseTo(1281.07 / (7869.41 + 1281.07), 4);
  });
  it("a line split by GL account is split BY ITS ACCOUNTS — -8503 is office", () => {
    const sp = splitLine(mc, "cam", { mask: "6220-8502,6220-8503", total: 1000, basisTotal: 900, subLines: [
      { account: "6220-8502", total: 700, basisTotal: 650 }, { account: "6220-8503", total: 300, basisTotal: 250 },
    ] });
    expect(sp.office).toEqual([300, 250]);
    expect(sp.retail).toEqual([700, 650]);
  });
  it("a line nobody allocated but carrying an office account falls back to 86 / 14", () => {
    expect(officeShare(mc, "cam", "6999-8502,6999-8503")).toBe(DEFAULT_OFFICE_SHARE);
    expect(officeShare(mc, "cam", "6999-8502")).toBe(0);
  });
});

describe("7010 recovers in two pots", () => {
  const suite = (unitRef: string): SuiteTenancy => ({ unitRef, tenant: unitRef, sqft: 1000, months: new Array(12).fill(100), assumed: new Array(12).fill(false), status: "contracted" });
  it("office tenants on the office recon and office ratios; no suite counted twice", async () => {
    loadRetailRecon.mockImplementation(async (code: string) => code === "7010O"
      ? { result: { tenants: [{ unitRef: "7010-201", name: "Office Co", sqft: 1000, camDue: 1200, insDue: 0, retDue: 600, occPct: 1 }] } }
      : { result: { tenants: [{ unitRef: "7010-1", name: "Shop", sqft: 5000, camDue: 12000, insDue: 1200, retDue: 2400, occPct: 1, camDenom: 50000, camPoolFull: 100000, insPool: 10000, retPool: 20000, insDenom: 50000, retDenom: 50000 }] } });
    const e = (await estimateReimbursements("7010", 2026, 0, {
      poolRatios: { cam: 1, ins: 1, ret: 1 },
      officePoolRatios: { cam: 2, ins: 1, ret: 1 },
      tenancy: [suite("7010-1"), suite("7010-201")],
    }))!;
    const office = e.tenants.filter((t) => t.unitRef === "7010-201");
    expect(office).toHaveLength(1);                 // never also a retail "new tenant"
    expect(office[0].portion).toBe("office");
    expect(office[0].camAnnual).toBe(2400);         // 1,200 × the OFFICE ratio of 2
    expect(e.tenants.find((t) => t.unitRef === "7010-1")!.portion).toBe("retail");
    // The building's recovery months carry both pots.
    expect(e.monthly.cam[0]).toBe(1000 + 200);
    expect(e.totals.camAnnual).toBe(12000 + 2400);
  });
});

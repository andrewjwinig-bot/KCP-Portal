import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/cam/retail/registry", () => ({ RETAIL_RECON_FIXTURES: { "2300": { byYear: { 2024: {}, 2025: {} } } } }));
vi.mock("@/lib/cam/office/registry", () => ({ OFFICE_RECON_FIXTURES: { "4070": { byYear: { 2025: {} } } } }));

const loadRetailRecon = vi.fn();
const loadOfficeRecon = vi.fn();
vi.mock("@/lib/cam/retail/loadResult", () => ({ loadRetailRecon: (...a: any[]) => loadRetailRecon(...a) }));
vi.mock("@/lib/cam/office/loadResult", () => ({ loadOfficeRecon: (...a: any[]) => loadOfficeRecon(...a) }));

import { estimateReimbursements } from "./reimbursementEstimate";

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

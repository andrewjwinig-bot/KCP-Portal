import { describe, it, expect } from "vitest";
import { monthsOccupiedInYear, annualizedEscrow, escrowFromMonthlyCharges } from "./escrow";
import { assembleTenantInputs, type RosterUnit, type OfficeLeaseConfig } from "./assemble";

describe("monthsOccupiedInYear", () => {
  it("counts calendar months the lease touched", () => {
    expect(monthsOccupiedInYear("2/15/2011", "6/30/2025", 2025)).toBe(6); // Jan–Jun
    expect(monthsOccupiedInYear("12/1/2025", "11/30/2026", 2025)).toBe(1); // Dec only
    expect(monthsOccupiedInYear("3/4/2005", "7/31/2025", 2025)).toBe(7); // Jan–Jul
    expect(monthsOccupiedInYear(null, null, 2025)).toBe(12); // full year
    expect(monthsOccupiedInYear("1/1/2026", "12/31/2026", 2025)).toBe(0); // no overlap
  });
});

describe("escrow defaults", () => {
  it("annualizes monthly charge over months occupied (workbook figures)", () => {
    expect(annualizedEscrow(350, 6)).toBe(2100); // Bucks-style, if still billed
    expect(annualizedEscrow(350, 12)).toBe(4200); // OSSV: $350/mo full year
  });
  it("sums actual monthly charges when a full year is available", () => {
    // $350/mo Jan–Jun, then raised to $375 Jul–Dec.
    expect(escrowFromMonthlyCharges([350, 350, 350, 350, 350, 350, 375, 375, 375, 375, 375, 375])).toBe(4350);
  });
});

describe("assembleTenantInputs escrow", () => {
  const cfg: Record<string, OfficeLeaseConfig> = {
    "4070-107": { baseYear: 2018, grossUp: true, proRataPct: 2.24 }, // no escrow override
    "4070-103": { baseYear: 2022, grossUp: true, proRataPct: 2.2, opexEscrow: 2100, retEscrow: 120 }, // override
  };
  const roster: RosterUnit[] = [
    // Full-year tenant, $350/mo CAM on the roll → annualized 4200.
    { unitRef: "4070-107", occupantName: "OSSV", sqft: 1311, isVacant: false, leaseFrom: "1/1/2000", leaseTo: "12/31/2030", opexMonth: 350, reTaxMonth: 0 },
    // Vacated mid-year, $0 on the December roll → override carries the truth.
    { unitRef: "4070-103", occupantName: "Bucks", sqft: 1285, isVacant: false, leaseFrom: "2/15/2011", leaseTo: "6/30/2025", opexMonth: 0, reTaxMonth: 0 },
  ];

  it("annualizes the monthly charge when no override is set", () => {
    const t = assembleTenantInputs(roster, 2025, cfg).find((x) => x.unitRef === "4070-107")!;
    expect(t.opexEscrow).toBe(4200);
    expect(t.retEscrow).toBe(0);
  });

  it("uses the config override when present (mid-year/$0 December charge)", () => {
    const t = assembleTenantInputs(roster, 2025, cfg).find((x) => x.unitRef === "4070-103")!;
    expect(t.opexEscrow).toBe(2100);
    expect(t.retEscrow).toBe(120);
  });
});

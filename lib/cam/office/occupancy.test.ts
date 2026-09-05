import { describe, it, expect } from "vitest";
import { occupancyPctForYear } from "./occupancy";

const r6 = (n: number) => Math.round(n * 1e6) / 1e6;

describe("occupancyPctForYear — ties to 4070 Tenant Inputs % Occ", () => {
  it("full year when the lease spans all of it", () => {
    // OSSV: lease runs through 11/30/2026 → full 2025.
    expect(occupancyPctForYear("3/1/2005", "11/30/2026", 2025)).toBe(1);
    // No dates → treated as in place all year.
    expect(occupancyPctForYear(null, null, 2025)).toBe(1);
  });

  it("Bucks County — through 6/30/2025 → 181/365", () => {
    expect(r6(occupancyPctForYear("2/15/2011", "6/30/2025", 2025))).toBe(r6(181 / 365));
    expect(r6(occupancyPctForYear("2/15/2011", "6/30/2025", 2025))).toBe(0.49589);
  });

  it("Belden — through 7/31/2025 → 212/365", () => {
    expect(r6(occupancyPctForYear("3/4/2005", "7/31/2025", 2025))).toBe(r6(212 / 365));
  });

  it("GLT — 12/1/2025 to 12/31/2025 → 31/365", () => {
    expect(r6(occupancyPctForYear("12/1/2025", "12/31/2025", 2025))).toBe(r6(31 / 365));
  });

  it("zero when the lease does not overlap the year", () => {
    expect(occupancyPctForYear("1/1/2026", "12/31/2026", 2025)).toBe(0);
    expect(occupancyPctForYear("1/1/2020", "12/31/2020", 2025)).toBe(0);
  });

  it("mid-year start clamps to the year start of the window", () => {
    // Lease starts 7/1/2025, open-ended → Jul 1 .. Dec 31 = 184 days.
    expect(r6(occupancyPctForYear("7/1/2025", null, 2025))).toBe(r6(184 / 365));
  });
});

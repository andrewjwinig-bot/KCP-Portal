import { describe, it, expect } from "vitest";
import { openArSummary, pickOpenAr, totalDue, escrowNote } from "./openAr";
import type { TenantStatement } from "@/lib/statements/types";

// SEOM 3640-300 (10/2026): CAM escrow $400/mo, Jan–Sep billed ($3,600), Aug
// and Sep never paid. The close-out credits $3,600 as billed; the open balance
// carries the unpaid $800, so the tenant is charged it exactly once.
const st = (name: string, charges: TenantStatement["charges"], bal: number): TenantStatement => ({
  unitRef: "3640-300", skylineUnitRef: "3640-300-CU", propertyCode: "3640", suite: "300",
  tenantName: name, address: [], charges, reportedBalance: bal, chargeTotal: bal, tiesOut: true,
  importedAt: "2026-10-02T12:00:00Z",
});
const seom = st("SEOM", [
  { dateISO: "2026-08-01", description: "Rent", amount: 10000, category: "rent" },
  { dateISO: "2026-08-01", description: "CAM Estimate", amount: 400, category: "cam" },
  { dateISO: "2026-09-01", description: "Rent", amount: 10000, category: "rent" },
  { dateISO: "2026-09-01", description: "CAM Estimate", amount: 400, category: "cam" },
  { dateISO: "2026-04-30", description: "2025 Year End RET Adjustment", amount: 3810, category: "ret", reconYear: 2025 },
  { dateISO: "2026-09-15", description: "Electric", amount: 850.39, category: "utilities" },
], 25460.39);

describe("move-out open balance", () => {
  it("carries the whole open balance and names the unpaid escrow months", () => {
    const ar = openArSummary(seom, "2026-10", 2026);
    expect(ar.balance).toBe(25460.39);
    expect(ar.escrowUnpaid).toBe(800);           // the year-end adjustment is not escrow
    expect(ar.escrowMonths).toBe("Aug – Sep 2026");
    expect(escrowNote(ar)).toContain("$800.00");
  });
  it("never counts a posted move-out true-up in the open balance", () => {
    const posted = st("SEOM", [...seom.charges, { dateISO: "2026-09-30", description: "2026 Move-Out CAM Adjustment", amount: -1200, category: "cam" }], 24260.39);
    expect(openArSummary(posted, "2026-11", 2026).balance).toBe(25460.39);
  });
  it("adds the true-up to the open balance", () => {
    expect(totalDue(-1200, openArSummary(seom, "2026-10", 2026))).toBe(24260.39);
    expect(totalDue(-1200, null)).toBe(-1200);
  });
  it("reads the departing tenant's statement, not the suite's next tenant", () => {
    const next = st("Acme Dental Group", [], 5000);
    const runs = [{ period: "2026-11", statements: [next] }, { period: "2026-10", statements: [seom] }];
    expect(pickOpenAr(runs, "3640-300", "SEOM", 2026)?.period).toBe("2026-10");
    // No name match: never the suite's current occupant…
    expect(pickOpenAr(runs, "3640-300", "Nobody Inc", 2026, "Acme Dental Group")?.period).toBe("2026-10");
  });
  it("finds a former tenant Skyline lists as <suite>-FO", () => {
    const fo = { ...st("Search Engines Marketer, Inc.", seom.charges, 31460.39), unitRef: "3640-300-FO", skylineUnitRef: "3640-300-FO" };
    const ar = pickOpenAr([{ period: "2026-10", statements: [fo] }], "3640-300", "Search Engines Marketer", 2026, null);
    expect(ar?.balance).toBe(31460.39);
    expect(ar?.nameMatched).toBe(true);
  });
  it("falls back to the suite when Skyline prints a different name", () => {
    const legal = st("Southeastern Orthopedic Medicine LLC", seom.charges, seom.reportedBalance);
    const ar = pickOpenAr([{ period: "2026-09", statements: [legal] }], "3640-300", "SEOM", 2026, null);
    expect(ar?.balance).toBe(25460.39);
    expect(ar?.nameMatched).toBe(false);
    expect(ar?.tenantName).toBe("Southeastern Orthopedic Medicine LLC");
  });
});

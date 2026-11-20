import { describe, it, expect } from "vitest";
import { creditsForLine, netCreditsByProperty } from "./tenantCredits";

const t = (unitRef: string, balanceDue: number, propertyCode = unitRef.slice(0, 4)) => ({ unitRef, tenantName: unitRef, propertyCode, balanceDue, asOf: "2026-11-01" });

describe("tenant credits held in reserve", () => {
  it("holds only the net credit, and nothing for a tenant who owes on balance", () => {
    const m = netCreditsByProperty([t("3610-101", -2000 + 1500), t("3610-102", 800), t("3610-103", -3), t("3610-104-FO", -1200, "3610")]);
    const c = m.get("3610")!;
    expect(c.total).toBe(1700); // 500 net + 1,200 former tenant; the $3 and the $800 owed add nothing
    expect(c.tenants.map((x) => x.unitRef)).toEqual(["3610-101", "3610-104-FO"]);
  });

  it("sums a fund line's buildings, largest credit first", () => {
    const m = netCreditsByProperty([t("3610-101", -100), t("3620-201", -900), t("4050-1", -50)]);
    const line = creditsForLine(m, ["3610", "3620", "3640"]);
    expect(line.total).toBe(1000);
    expect(line.tenants[0].unitRef).toBe("3620-201");
  });
});

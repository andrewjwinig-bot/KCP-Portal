import { describe, expect, it } from "vitest";
import { commissionInvoiceNumber, commissionInvoiceDate, commissionBuildingLabel } from "@/lib/pdf/renderCommissionInvoicePdf";

describe("commission invoice numbers", () => {
  it("reads quarter-year, Int Com, building, suite", () => {
    expect(commissionInvoiceNumber({ quarter: "Q3 26", building: "4050", suite: "113" })).toBe("Q3-26 Int Com - 5-113");
    expect(commissionInvoiceNumber({ quarter: "3rd Quarter 2026", building: "4050", suite: "0113" })).toBe("Q3-26 Int Com - 5-113");
  });
  it("names the building", () => {
    expect(commissionBuildingLabel("3610")).toBe("1");
    expect(commissionBuildingLabel("40A0")).toBe("KCA");
    expect(commissionBuildingLabel("4500")).toBe("4500");
    expect(commissionBuildingLabel("Building 5")).toBe("5");
  });
  it("is dated the last day of the quarter", () => {
    expect(commissionInvoiceDate({ quarter: "Q3 26" })).toBe("9/30/2026");
    expect(commissionInvoiceDate({ quarter: "Q4 26" })).toBe("12/31/2026");
    expect(commissionInvoiceDate({ quarter: "Q1 27" })).toBe("3/31/2027");
  });
});

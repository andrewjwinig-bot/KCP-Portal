import { describe, expect, it } from "vitest";
import { commissionInvoiceNumber, commissionInvoiceDate, commissionBuildingLabel } from "@/lib/pdf/renderCommissionInvoicePdf";

describe("commission invoice numbers", () => {
  it("reads quarter-year, Int Com, building, suite", () => {
    expect(commissionInvoiceNumber({ quarter: "Q3 26", building: "4050", suite: "113" })).toBe("Q326ICom-5-113");
    expect(commissionInvoiceNumber({ quarter: "3rd Quarter 2026", building: "4050", suite: "0113" })).toBe("Q326ICom-5-113");
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

describe("Skyline's 20-character invoice number", () => {
  it("fits an office suite and still knows an invoice sent with spaces", async () => {
    const n = commissionInvoiceNumber({ quarter: "Q3 26", building: "4050", suite: "315" });
    expect(n.length).toBeLessThanOrEqual(20);
    const { inLedger } = await import("./sendQuarterToAvidBill");
    const entry = { id: "x", quarter: "Q3 26", building: "4050", suite: "113", tenant: "Acme" } as any;
    expect(inLedger({ "Q3-26 Int Com - 5-113 - Acme.pdf": "2026-10-01" }, entry)).toBe(true);
    expect(inLedger({ "Q3-26 Int Com-5-113 - Acme.pdf": "2026-10-01" }, entry)).toBe(true);
    expect(inLedger({ "Q3-26 ICom-5-113 - Acme.pdf": "2026-10-01" }, entry)).toBe(true);
    expect(inLedger({ "Q3-26ICom-5-113 - Acme.pdf": "2026-10-01" }, entry)).toBe(true);
    expect(inLedger({ "Q326ICom-5-113 - Acme.pdf": "2026-10-01" }, entry)).toBe(true);
    expect(commissionInvoiceNumber({ quarter: "Q3 26", building: "7010", suite: "12311" })).toBe("Q326ICom-7010-12311");
    expect(inLedger({}, entry)).toBe(false);
  });
});

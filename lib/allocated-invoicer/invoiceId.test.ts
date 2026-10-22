import { describe, it, expect } from "vitest";
import { makeAllocInvoiceId } from "./invoice";

describe("makeAllocInvoiceId", () => {
  it("AE + property + MMYY", () => expect(makeAllocInvoiceId("4500", "2026-07")).toBe("AE45000726"));
  it("a full-year GL takes its last month", () => expect(makeAllocInvoiceId("40A0", "2026-01_to_2026-08")).toBe("AE40A00826"));
  it("a late-charge invoice is a true-up", () => expect(makeAllocInvoiceId("2300", "2026-08", true)).toBe("TU23000826"));
  it("is deterministic", () => expect(makeAllocInvoiceId("9510", "2026-07")).toBe(makeAllocInvoiceId("9510", "2026-07")));
});

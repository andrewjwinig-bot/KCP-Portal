import { describe, it, expect } from "vitest";
import { makeInvoiceId } from "./invoice";

describe("makeInvoiceId — credit card", () => {
  it("CC + property + MMYY", () => expect(makeInvoiceId("2300", "2026-08")).toBe("CC23000826"));
  it("a reimbursement", () => expect(makeInvoiceId("REIMB", "2026-08")).toBe("CCREIMB0826"));
  it("is deterministic", () => expect(makeInvoiceId("4500", "2026-08")).toBe(makeInvoiceId("4500", "2026-08")));
});

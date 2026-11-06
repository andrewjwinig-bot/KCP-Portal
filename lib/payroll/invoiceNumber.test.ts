import { describe, it, expect } from "vitest";
import { payPeriodOfMonth, payrollInvoiceNumber, parsePayDate } from "./invoiceNumber";

describe("payroll invoice numbering", () => {
  it("numbers the biweekly paydays within a month", () => {
    // May 2026 paydays (from the 5/8 anchor): 5/8 and 5/22.
    expect(payPeriodOfMonth(new Date(2026, 4, 8))).toBe(1);
    expect(payPeriodOfMonth(new Date(2026, 4, 22))).toBe(2);
    // A 3-payday month: Jan 2027 has paydays on 1/1, 1/15, 1/29.
    expect(payPeriodOfMonth(new Date(2027, 0, 1))).toBe(1);
    expect(payPeriodOfMonth(new Date(2027, 0, 15))).toBe(2);
    expect(payPeriodOfMonth(new Date(2027, 0, 29))).toBe(3);
  });

  it("builds PR<code><MM><YY><period>", () => {
    expect(payrollInvoiceNumber({ propertyCode: "3610" }, "5/8/2026")).toBe("PR361005261");
    expect(payrollInvoiceNumber({ propertyCode: "1100" }, "5/22/2026")).toBe("PR110005262");
    // ISO date + key fallback when no code.
    expect(payrollInvoiceNumber({ propertyKey: "PJV3" }, "2026-05-08")).toBe("PRPJV305261");
    // No pay date → just the PR + code.
    expect(payrollInvoiceNumber({ propertyCode: "3610" }, null)).toBe("PR3610");
  });

  it("parses both date formats", () => {
    expect(parsePayDate("5/8/2026")?.getMonth()).toBe(4);
    expect(parsePayDate("2026-05-08")?.getDate()).toBe(8);
    expect(parsePayDate("")).toBeNull();
  });
});

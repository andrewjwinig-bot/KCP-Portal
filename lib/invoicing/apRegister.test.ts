import { describe, expect, it } from "vitest";
import { registerEmail } from "./apRegister";

describe("Allocated Expenses register to AP", () => {
  const rows = [
    { invoiceNumber: "AE45001026", code: "4500", name: "Gray's Ferry Shopping Center", amount: 1234.56 },
    { invoiceNumber: "AE36101026", code: "3610", name: "Building 1", amount: 765.44 },
  ];
  const mail = registerEmail({ periodLabel: "October 2026", rows, by: "Drew" });

  it("lists every invoice number with its amount and the total", () => {
    expect(mail.subject).toBe("Allocated Expenses register: October 2026 · 2 invoices · $2,000.00");
    expect(mail.text).toContain("AE45001026");
    expect(mail.text).toContain("AE36101026");
    expect(mail.text).toContain("1,234.56");
    expect(mail.text).toContain("2,000.00");
  });

  it("notes properties held under $100, so AP knows not to look for them", () => {
    const m = registerEmail({ periodLabel: "October 2026", rows, held: [{ code: "9840", name: "Joshua Rd", amount: 42.18 }], by: "Drew" });
    expect(m.text).toContain("Held under $100");
    expect(m.text).toContain("9840 Joshua Rd · $42.18");
    expect(mail.text).not.toContain("Held under $100");
  });
});

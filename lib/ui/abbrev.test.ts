import { describe, expect, it } from "vitest";
import { abbrev } from "./abbrev";

describe("abbrev", () => {
  it("applies the shared short forms", () => {
    expect(abbrev("Net Operating Income")).toBe("NOI");
    expect(abbrev("Total Operating Expenses")).toBe("Total Op Ex");
    expect(abbrev("Building Maintenance")).toBe("Building Maint.");
    expect(abbrev("Total Non-Reimbursable Expenses")).toBe("Total Non-Reimb. Expenses");
    expect(abbrev("Tenant Improvements")).toBe("TI");
    expect(abbrev("Outside Leasing Commissions")).toBe("Outside LC");
    expect(abbrev("NOI · Year to Date")).toBe("NOI · YTD");
  });
  it("keeps uppercase text uppercase", () => {
    expect(abbrev("CASH FLOW AFTER DEBT SERVICE")).toBe("CASH FLOW AFTER DEBT SVC");
    expect(abbrev("TOTAL REIMBURSEMENTS")).toBe("TOTAL REIMB.");
  });
  it("leaves text with nothing to shorten alone", () => {
    expect(abbrev("Utilities")).toBe("Utilities");
  });
});

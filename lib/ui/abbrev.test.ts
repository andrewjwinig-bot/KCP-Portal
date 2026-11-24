import { describe, expect, it } from "vitest";
import { abbrev } from "./abbrev";

describe("abbrev", () => {
  it("applies the shared short forms", () => {
    expect(abbrev("Net Operating Income")).toBe("NOI");
    expect(abbrev("Total Operating Expenses")).toBe("TTL Op Ex");
    expect(abbrev("Building Maintenance")).toBe("Building Maint.");
    expect(abbrev("Total Non-Reimbursable Expenses")).toBe("TTL Non-Reimb. Expenses");
    expect(abbrev("Tenant Improvements")).toBe("TI");
    expect(abbrev("Outside Leasing Commissions")).toBe("Outside LC");
    expect(abbrev("NOI · Year to Date")).toBe("NOI · YTD");
    expect(abbrev("Total Revenue and Other")).toBe("TTL Rev. & Other");
    expect(abbrev("Reprojected Revenue")).toBe("Reproj. Rev.");
    expect(abbrev("TOTAL REVENUE AND OTHER")).toBe("TTL REV. & OTHER");
  });
  it("keeps uppercase text uppercase", () => {
    expect(abbrev("CASH FLOW AFTER DEBT SERVICE")).toBe("CASH FLOW AFTER DEBT SVC");
    expect(abbrev("TOTAL REIMBURSEMENTS")).toBe("TTL REIMB.");
  });
  it("leaves text with nothing to shorten alone", () => {
    expect(abbrev("Utilities")).toBe("Utilities");
  });
});

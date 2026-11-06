import { describe, expect, it } from "vitest";
import { bucketsFor } from "./lineBuckets";

describe("bucketsFor", () => {
  it("splits recoverable maintenance three ways", () => {
    expect(bucketsFor("reimbursable-expense", "Building Maintenance")?.buckets).toEqual(["Contractual", "Recurring", "Big Projects"]);
    expect(bucketsFor("reimbursable-expense", "Parking Lot Maintenance")?.buckets).toEqual(["Contractual", "Recurring", "Big Projects"]);
    expect(bucketsFor("reimbursable-expense", "Landscaping")?.base).toBe("Recurring");
  });
  it("gives non-recoverable building maintenance no contract bucket", () => {
    expect(bucketsFor("non-reimbursable-expense", "Building Maintenance")?.buckets).toEqual(["Recurring", "Big Projects"]);
  });
  it("splits insurance and cleaning", () => {
    expect(bucketsFor("reimbursable-expense", "Insurance")?.buckets).toEqual(["Liability", "Property", "Other"]);
    expect(bucketsFor("reimbursable-expense", "Cleaning & Supplies")?.buckets).toEqual(["Cleaning & Supplies", "Vacancies"]);
  });
  it("leaves revenue lines and other expense lines alone", () => {
    expect(bucketsFor("reimbursement", "Insurance")).toBeNull();
    expect(bucketsFor("reimbursable-expense", "Liability Insurance")).toBeNull();
    expect(bucketsFor("reimbursable-expense", "Electric")).toBeNull();
  });
});

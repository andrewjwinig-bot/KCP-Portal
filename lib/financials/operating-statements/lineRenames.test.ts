import { describe, it, expect } from "vitest";
import { currentLineKey, withCurrentLineKeys } from "./lineRenames";

describe("2010's lines keep what was saved under their old names", () => {
  it("both expense sections read as Expenses; LIK Management Clearing as Salaries & Benefits", () => {
    expect(currentLineKey("2010", "Reimbursable Expenses::LIK Management Clearing")).toBe("Expenses::Salaries & Benefits");
    expect(currentLineKey("2010", "Reimbursable Expenses::LIK Management Clearing#8000-9900")).toBe("Expenses::Salaries & Benefits#8000-9900");
    expect(currentLineKey("2010", "Non-Reimbursable Expenses::Office Rental")).toBe("Expenses::Office Rental");
    expect(currentLineKey("2010", "Revenues::Management Fees")).toBe("Revenues::Management Fees");
    expect(currentLineKey("9510", "Reimbursable Expenses::Snow Removal")).toBe("Reimbursable Expenses::Snow Removal");
  });
  it("a value saved under the new key wins", () => {
    const doc = withCurrentLineKeys("2010", { "Reimbursable Expenses::LIK Management Clearing": "old", "Expenses::Salaries & Benefits": "new", "Non-Reimbursable Expenses::Telephone": "t" });
    expect(doc).toEqual({ "Expenses::Salaries & Benefits": "new", "Expenses::Telephone": "t" });
  });
});

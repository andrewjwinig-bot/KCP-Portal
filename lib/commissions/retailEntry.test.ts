import { describe, expect, it } from "vitest";
import { retailJournalEntryRows } from "./sendRetailEntry";

describe("retail commission GL import", () => {
  it("is the bare BTCH/INVH/DIST import, billed × 1.2 to the centre", () => {
    const rows = retailJournalEntryRows({
      id: "x", quarter: "Q3 26", tenant: "Wawa", building: "9510", suite: "12", sqft: 3000,
      leaseFrom: "", leaseTo: "", termYears: 5, incentiveAmount: 3000, comments: "", createdAt: 0,
    }, 97400, 1234567)!;
    expect(rows[0][0]).toBe("BTCH"); // row 1 is data — never a title
    expect(rows[1]).toEqual(["INVH", "Q326 InHouse Comm", "9/30/26", "", 3600, "9510 Q326 Comm", "LIKM4", "9/30/26", "9/30/26"]);
    expect(rows[2]).toEqual(["DIST", "9510", "1940-8501", "Q326 InHouse Comm", "", 3600]);
  });
});

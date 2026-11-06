import { describe, it, expect } from "vitest";
import { glFromPosting } from "./postingIntake";
import type { PostingProperty } from "@/lib/financials/operating-statements/postingReport";

function prop(transactions: PostingProperty["transactions"]): PostingProperty {
  return { property: "2000", monthly: {}, net: {}, months: [], transactions };
}
const tx = (month: number, date: string, amount: number, ref = "V1") =>
  ({ month, date, description: "inv", ref, amount, vendor: "acme" });

describe("glFromPosting — posting report → allocated GL", () => {
  it("keeps only allocated suffixes (9301/9302/9303) and builds a single-month GL", () => {
    const gl = glFromPosting(prop({
      "8220-9301": [tx(7, "07/10/2026", 1000)],
      "6330-8502": [tx(7, "07/10/2026", 500)], // office suffix → excluded
    }));
    expect(gl).not.toBeNull();
    expect(gl!.statementMonth).toBe("2026-07");
    expect([...gl!.accountTotals.keys()]).toEqual(["8220-9301"]);
    expect(gl!.transactions).toHaveLength(1);
    expect(gl!.transactions[0].net).toBe(1000);
    expect(gl!.transactions[0].accountSuffix).toBe("9301");
  });

  it("becomes a range GL across months so the invoicer splits it per month", () => {
    const gl = glFromPosting(prop({
      "8220-9301": [tx(5, "05/03/2026", 400), tx(7, "07/10/2026", 600)],
    }));
    expect(gl!.statementMonth).toBe("2026-05_to_2026-07");
    expect(gl!.transactions).toHaveLength(2);
  });

  it("splits a signed amount into debit/credit correctly", () => {
    const gl = glFromPosting(prop({ "8220-9302": [tx(7, "07/10/2026", -250)] }));
    expect(gl!.transactions[0].debit).toBe(0);
    expect(gl!.transactions[0].credit).toBe(250);
    expect(gl!.transactions[0].net).toBe(-250);
  });

  it("returns null when the property has no allocated activity", () => {
    expect(glFromPosting(prop({ "6330-8502": [tx(7, "07/10/2026", 500)] }))).toBeNull();
  });
});

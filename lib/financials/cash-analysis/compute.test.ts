import { describe, it, expect } from "vitest";
import { bucketCodeFor, computeCashFlow } from "./compute";

const at = (period: number, v: number) => { const a = new Array(12).fill(0); a[period - 1] = v; return a; };

describe("cash-analysis bucket mapping", () => {
  it("maps accounts by exact code, prefix fallback, exclusion, and unknown", () => {
    expect(bucketCodeFor("0410-0000")).toBe(1);   // exact (receipts)
    expect(bucketCodeFor("0250-0000")).toBe(8);   // exact (security deposits)
    expect(bucketCodeFor("0430-0000")).toBe(6);   // exact (inter-entity)
    expect(bucketCodeFor("0110-0000")).toBe("excluded"); // cash account (N/A)
    expect(bucketCodeFor("0410-9999")).toBe(1);   // prefix fallback on 0410
    expect(bucketCodeFor("ZZZZ-0000")).toBeNull();// unknown
  });
});

describe("cash-analysis compute", () => {
  it("flips GL sign, sums by bucket, and collects unmapped activity", () => {
    const monthly = {
      "0410-0000": at(12, 100),   // code 1 → flow -100
      "0250-0000": at(12, -50),   // code 8 → flow +50
      "0110-0000": at(12, 999),   // excluded → skipped
      "ZZZZ-9999": at(12, 7),     // unknown → unmapped (-7)
    };
    const r = computeCashFlow(monthly, 12);
    expect(r.byBucket[1]).toBe(-100);
    expect(r.byBucket[8]).toBe(50);
    expect(r.netChange).toBe(-50);
    expect(r.unmapped).toEqual([{ account: "ZZZZ-9999", amount: -7 }]);
  });

  it("YTD sums months 1..period", () => {
    const monthly = { "0410-0000": [0, 0, 10, 0, 5, 0, 0, 0, 0, 0, 0, 0] }; // code 1
    expect(computeCashFlow(monthly, 5, { ytd: true }).byBucket[1]).toBe(-15); // Mar 10 + May 5
    expect(computeCashFlow(monthly, 4).byBucket[1]).toBe(0);   // April alone = 0
    expect(computeCashFlow(monthly, 3).byBucket[1]).toBe(-10); // March alone
  });
});

import { describe, it, expect } from "vitest";
import { cashAtStartOfMonth, CASH_ACCT, type CashGl } from "./cash";

// A Mar–May GL for 0110-0000: opening (Mar 1) = 100,000, with net cash changes
// in March (+20k), April (−5k), May (+8k). Jan/Feb aren't covered (nets 0).
function marMayCash(): CashGl {
  const nets = new Array(12).fill(0);
  nets[2] = 20_000; // March
  nets[3] = -5_000; // April
  nets[4] = 8_000;  // May
  return { beginning: { [CASH_ACCT]: 100_000 }, monthly: { [CASH_ACCT]: nets }, maxPeriodInFile: 5 };
}

describe("cashAtStartOfMonth", () => {
  it("each month's opening = prior month's ending (true running balance)", () => {
    const gl = marMayCash();
    expect(cashAtStartOfMonth(gl, 3)).toBe(100_000);             // March opens at the Mar-1 balance
    expect(cashAtStartOfMonth(gl, 4)).toBe(120_000);             // April opens at March's ending (+20k)
    expect(cashAtStartOfMonth(gl, 5)).toBe(115_000);             // May opens at April's ending (−5k)
    expect(cashAtStartOfMonth(gl, 6)).toBe(123_000);             // June opens at May's ending (+8k)
  });

  it("start of January is the year's opening balance", () => {
    const gl: CashGl = { beginning: { [CASH_ACCT]: 42_000 }, monthly: { [CASH_ACCT]: new Array(12).fill(0) }, maxPeriodInFile: 1 };
    expect(cashAtStartOfMonth(gl, 1)).toBe(42_000);
  });

  it("returns null past the months the file covers", () => {
    expect(cashAtStartOfMonth(marMayCash(), 7)).toBeNull(); // needs Jun activity, not in the file
  });

  it("returns null with no captured opening balance", () => {
    const gl: CashGl = { monthly: { [CASH_ACCT]: new Array(12).fill(0) }, maxPeriodInFile: 5 };
    expect(cashAtStartOfMonth(gl, 4)).toBeNull();
  });
});

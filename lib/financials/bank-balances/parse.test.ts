import { describe, it, expect } from "vitest";
import { parseBankBalances } from "./parse";

// Shapes copied from the real exports; the figures are made up.
const CHASE = `Printed from Chase for Business
Bank accounts
Bank accounts \tTotal available balance $1,234.00
2300 Brookwood OP (...5615) \t$1,000.50 \t$1,100.75 Checking
PARENT HK Co (...5623) \t$20.00 \t$20.00 Checking
Account
Available
balance
Present balance Account type
-- 1 of 3 --
Eastwick (...5303) \t$0.00 \t$5,000.00 Checking
9820 KH SPRING
GARDE (...2296)
$2,157.86 \t$2,157.86 Checking`;

const LIBERTY = `Liberty Bank will be closing early
Total Balances
Account Summary
Deposits
Total Current Balance
$9,999.99
Edit Accounts View
SD Account - All but NILLC
x7216 \tAvailable Balance
$100.00
Current Balance
$100.00
SD Account -NILLC \t$650.00
-- 1 of 4 --
x7448 \tAvailable Balance
Current Balance
$650.00
Business M M Revere
x8177 \tAvailable Balance
$800.00
-- 2 of 4 --
Quick Links
Current Balance
$810.00
Business M M LIK Mgmt
x8276 \tAvailable Balance
$5.00
Current Balance
$5.00`;

const MT = `Previous Day Deposit Accounts List View | Previous Business Day
Date Account Name Account # Closing Ledger Closing Available Avail + 1 Day 1-Day Float
10/09/2026 OFFICE WORKS PARTNERSHIP 9857593777 51,806.56 51,000.00 51,806.56 0.00 0.00 0.00 4,127.93
10/09/2026 TKD-NESHAMINY LLC-020,030,090,421,4 9867466063 177.63 177.63 177.63 0.00 0.00 0.00 0.00`;

describe("bank balance parsers", () => {
  it("Chase: present balance, wrapped names", () => {
    const r = parseBankBalances(CHASE)!;
    expect(r.bank).toBe("JPM-Chase");
    expect(r.accounts.map((a) => [a.last4, a.balance, a.available])).toEqual([
      ["x5615", 1100.75, 1000.5], ["x5623", 20, 20], ["x5303", 5000, 0], ["x2296", 2157.86, 2157.86],
    ]);
    expect(r.accounts[3].name).toBe("9820 KH SPRING GARDE");
  });
  it("Liberty: current balance even when the label is split from its figure", () => {
    const r = parseBankBalances(LIBERTY)!;
    expect(r.bank).toBe("Liberty Bank");
    expect(r.accounts.map((a) => [a.last4, a.balance])).toEqual([["x7216", 100], ["x7448", 650], ["x8177", 810], ["x8276", 5]]);
  });
  it("M&T: closing ledger, dated", () => {
    const r = parseBankBalances(MT)!;
    expect(r.bank).toBe("M&T");
    expect(r.asOf).toBe("2026-10-09");
    expect(r.accounts.map((a) => [a.last4, a.balance, a.available])).toEqual([["x3777", 51806.56, 51000], ["x6063", 177.63, 177.63]]);
  });
  it("refuses a file that is no bank's export", () => {
    expect(parseBankBalances("hello world")).toBeNull();
  });
});

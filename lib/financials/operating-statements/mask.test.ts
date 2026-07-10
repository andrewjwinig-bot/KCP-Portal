import { describe, it, expect } from "vitest";
import { accountMatchesMask, accountsMatchingMask, claimAccounts } from "./mask";

describe("claimAccounts — most-specific mask wins (no double-count)", () => {
  it("a specific mask beats a catch-all in the same section", () => {
    const masks = ["8210-8501", "8310-8501", "8*-*"]; // Business Taxes, Legal, G&A
    const accounts = ["8210-8501", "8310-8501", "8400-8501", "8900-0000"];
    const owned = claimAccounts(masks, accounts);
    expect(owned[0]).toEqual(["8210-8501"]);        // Business Taxes
    expect(owned[1]).toEqual(["8310-8501"]);        // Legal & Accounting
    expect(owned[2].sort()).toEqual(["8400-8501", "8900-0000"]); // G&A: only the rest
  });

  it("every matched account is claimed exactly once (tie-out preserved)", () => {
    const masks = ["8210-8501", "8*-*"];
    const accounts = ["8210-8501", "8211-8501", "7000-0000"]; // 7000 matches neither
    const owned = claimAccounts(masks, accounts);
    const claimed = owned.flat().sort();
    expect(claimed).toEqual(["8210-8501", "8211-8501"]); // 7000 unclaimed (unmapped)
    expect(new Set(claimed).size).toBe(claimed.length);  // no account claimed twice
  });

  it("prefix specificity: 89* beats 8*", () => {
    const owned = claimAccounts(["8*-*", "89*-*"], ["8950-8501"]);
    expect(owned[0]).toEqual([]);           // 8*-* loses
    expect(owned[1]).toEqual(["8950-8501"]); // 89*-* wins
  });
});

describe("operating-statement GL mask matcher", () => {
  it("exact account", () => {
    expect(accountMatchesMask("6030-8502", "6030-8502")).toBe(true);
    expect(accountMatchesMask("6030-8502", "6030-8501")).toBe(false);
    expect(accountMatchesMask("6030-8502", "6031-8502")).toBe(false);
  });

  it("comma OR list", () => {
    const m = "6510-8501,6510-8502";
    expect(accountMatchesMask(m, "6510-8501")).toBe(true);
    expect(accountMatchesMask(m, "6510-8502")).toBe(true);
    expect(accountMatchesMask(m, "6510-8503")).toBe(false);
  });

  it("full cost-center wildcard (4230-*)", () => {
    expect(accountMatchesMask("4230-*", "4230-8501")).toBe(true);
    expect(accountMatchesMask("4230-*", "4230-0000")).toBe(true);
    expect(accountMatchesMask("4230-*", "4231-8501")).toBe(false);
  });

  it("root prefix + exact cost-center (6*-8503)", () => {
    expect(accountMatchesMask("6*-8503", "6220-8503")).toBe(true);
    expect(accountMatchesMask("6*-8503", "6990-8503")).toBe(true);
    expect(accountMatchesMask("6*-8503", "6220-8502")).toBe(false);
    expect(accountMatchesMask("6*-8503", "7220-8503")).toBe(false);
  });

  it("root prefix + cost-center prefix (8*-85*)", () => {
    expect(accountMatchesMask("8*-85*", "8190-8501")).toBe(true);
    expect(accountMatchesMask("8*-85*", "8990-8599")).toBe(true);
    expect(accountMatchesMask("8*-85*", "8190-8401")).toBe(false);
    expect(accountMatchesMask("8*-85*", "9190-8501")).toBe(false);
  });

  it("two-digit root prefix (89*-*)", () => {
    expect(accountMatchesMask("89*-*", "8910-8501")).toBe(true);
    expect(accountMatchesMask("89*-*", "8999-0000")).toBe(true);
    expect(accountMatchesMask("89*-*", "8190-8501")).toBe(false);
  });

  it("numeric range on root (4980..4999-*)", () => {
    expect(accountMatchesMask("4980..4999-*", "4980-8501")).toBe(true);
    expect(accountMatchesMask("4980..4999-*", "4999-0000")).toBe(true);
    expect(accountMatchesMask("4980..4999-*", "4990-1234")).toBe(true);
    expect(accountMatchesMask("4980..4999-*", "4979-8501")).toBe(false);
    expect(accountMatchesMask("4980..4999-*", "5000-8501")).toBe(false);
  });

  it("mixed list with wildcard and exact (4710-*,4910-8503)", () => {
    const m = "4710-*,4910-8503";
    expect(accountMatchesMask(m, "4710-8501")).toBe(true);
    expect(accountMatchesMask(m, "4910-8503")).toBe(true);
    expect(accountMatchesMask(m, "4910-8501")).toBe(false);
  });

  it("range within a comma list (8120..8999-*)", () => {
    expect(accountMatchesMask("8120..8999-*", "8310-8501")).toBe(true);
    expect(accountMatchesMask("8120..8999-*", "8110-8501")).toBe(false);
  });

  it("tolerates whitespace around tokens", () => {
    expect(accountMatchesMask(" 6030-8502 , 6031-8502 ", "6031-8502")).toBe(true);
  });

  it("filters a set of accounts by mask", () => {
    const accounts = ["6220-8501", "6220-8502", "6220-8503", "6330-8502"];
    expect(accountsMatchingMask("6220-8502,6220-8503", accounts)).toEqual([
      "6220-8502",
      "6220-8503",
    ]);
    expect(accountsMatchingMask("6*-8502", accounts)).toEqual(["6220-8502", "6330-8502"]);
  });
});

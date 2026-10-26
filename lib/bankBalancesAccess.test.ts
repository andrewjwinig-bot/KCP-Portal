import { describe, it, expect } from "vitest";
import { authorizeRequest, canEditCashSheet, USERS } from "./users";

describe("Harry views Bank Balances (owner), and only that of /financials", () => {
  it("opens the page and its API, view-only", () => {
    expect(authorizeRequest("harry", "/financials/cash-analysis")).toBe(true);
    expect(authorizeRequest("harry", "/api/financials/bank-balances")).toBe(true);
    expect(authorizeRequest("harry", "/api/financials/bank-balances/export")).toBe(true);
    expect(USERS.harry.navKeys.has("bank-balances")).toBe(true);
    expect(canEditCashSheet("harry")).toBe(false);
  });
  it("does not reach the rest of the financials", () => {
    expect(authorizeRequest("harry", "/financials/operating-statements")).toBe(false);
    expect(authorizeRequest("harry", "/api/financials/operating-statements")).toBe(false);
    expect(authorizeRequest("harry", "/api/financials/cash-sheet")).toBe(false);
  });
  it("everyone who saw it before still does", () => {
    for (const u of ["drew", "alison"] as const) expect(USERS[u].navKeys.has("bank-balances")).toBe(true);
  });
});

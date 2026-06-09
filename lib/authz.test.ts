import { describe, it, expect } from "vitest";
import { authorizeRequest } from "./users";

describe("server-side authorizeRequest", () => {
  it("admin can reach everything (pages + sensitive APIs)", () => {
    for (const p of ["/financials/operating-statements", "/api/financials/x", "/api/deposits", "/history", "/api/bank-rec"]) {
      expect(authorizeRequest("admin", p)).toBe(true);
    }
  });

  it("blocks out-of-scope pages", () => {
    expect(authorizeRequest("maint", "/financials/budgets")).toBe(false); // maint has no financials
    expect(authorizeRequest("marie", "/deposits")).toBe(false);           // marie has no deposits
    expect(authorizeRequest("harry", "/financials/operating-statements")).toBe(false);
  });

  it("blocks out-of-scope sensitive APIs (mapped to their page)", () => {
    expect(authorizeRequest("maint", "/api/financials/operating-statements")).toBe(false);
    expect(authorizeRequest("marie", "/api/deposits")).toBe(false);
    expect(authorizeRequest("harry", "/api/financials/reprojections")).toBe(false);
  });

  it("allows in-scope sensitive APIs", () => {
    expect(authorizeRequest("nancy", "/api/financials/operating-statements")).toBe(true); // nancy has /financials
    expect(authorizeRequest("harry", "/api/deposits")).toBe(true);                        // harry has /deposits
    expect(authorizeRequest("harry", "/api/commissions/retail")).toBe(true);
    expect(authorizeRequest("marie", "/api/bank-rec")).toBe(true);
  });

  it("leaves cross-cutting APIs open to any signed-in user", () => {
    for (const u of ["maint", "marie", "harry", "nancy"] as const) {
      expect(authorizeRequest(u, "/api/rentroll")).toBe(true);
      expect(authorizeRequest(u, "/api/properties/x")).toBe(true);
      expect(authorizeRequest(u, "/api/financials/budgets/kpis")).toBe(true); // exempt (global search)
    }
  });
});

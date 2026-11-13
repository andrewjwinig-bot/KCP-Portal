import { describe, it, expect } from "vitest";
import { authorizeRequest, canEditCashSheet, canEditOwnership } from "./users";

describe("cash sheet edit access", () => {
  it("admin and drew can edit; alison (and others) are view-only", () => {
    expect(canEditCashSheet("admin")).toBe(true);
    expect(canEditCashSheet("drew")).toBe(true);
    expect(canEditCashSheet("alison")).toBe(false);
    expect(canEditCashSheet("nancy")).toBe(false);
  });
});

describe("ownership (contact / trustee) edit access", () => {
  it("harry, alison, drew, admin can edit; others are view-only", () => {
    for (const u of ["harry", "alison", "drew", "admin"] as const) expect(canEditOwnership(u)).toBe(true);
    for (const u of ["nancy", "marie", "greg", "charles", "jay", "maint"] as const) expect(canEditOwnership(u)).toBe(false);
  });
});

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
    expect(authorizeRequest("harry", "/api/deposits")).toBe(true);                        // harry has /deposits
    expect(authorizeRequest("harry", "/api/commissions/retail")).toBe(true);
    // Harry has CAM Reconciliation access (Lafayette Hill 9510 Wawa quarterly billing).
    expect(authorizeRequest("harry", "/cam-recon")).toBe(true);
    expect(authorizeRequest("harry", "/api/cam-recon")).toBe(true);
    expect(authorizeRequest("harry", "/api/cam-recon/quarterly")).toBe(true);
    expect(authorizeRequest("marie", "/api/bank-rec")).toBe(true);
    expect(authorizeRequest("drew", "/api/financials/operating-statements")).toBe(true);  // drew has full /financials
  });

  it("profile-switchers (admin/drew) reach pages outside their own profile", () => {
    // Drew switches to view another user's profile; the cookie still carries
    // Drew, so the server must grant him access to pages his curated profile
    // doesn't list (e.g. viewing Alison's Debt Tracker, or the Bank Acc
    // Tracker). Regression guard: this used to redirect to /dashboard.
    expect(authorizeRequest("drew", "/debt")).toBe(true);
    expect(authorizeRequest("drew", "/bank-rec")).toBe(true);      // not in drew's profile
    expect(authorizeRequest("drew", "/api/bank-rec")).toBe(true);
    expect(authorizeRequest("drew", "/commissions/retail")).toBe(true);
  });

  it("limits nancy's financials to Budgets only", () => {
    // Budgets page + API are allowed (mapped to the more-specific prefix).
    expect(authorizeRequest("nancy", "/financials/budgets")).toBe(true);
    expect(authorizeRequest("nancy", "/api/financials/budgets")).toBe(true);
    expect(authorizeRequest("nancy", "/api/financials/budgets/kpis")).toBe(true);
    // The other financials pages + their APIs are blocked.
    expect(authorizeRequest("nancy", "/financials/operating-statements")).toBe(false);
    expect(authorizeRequest("nancy", "/financials/cash-sheet")).toBe(false);
    expect(authorizeRequest("nancy", "/api/financials/operating-statements")).toBe(false);
    expect(authorizeRequest("nancy", "/api/financials/reprojections")).toBe(false);
    expect(authorizeRequest("nancy", "/api/financials/cash-sheet")).toBe(false);
  });

  it("leaves cross-cutting APIs open to any signed-in user", () => {
    for (const u of ["maint", "marie", "harry", "nancy"] as const) {
      expect(authorizeRequest(u, "/api/rentroll")).toBe(true);
      expect(authorizeRequest(u, "/api/properties/x")).toBe(true);
      expect(authorizeRequest(u, "/api/financials/budgets/kpis")).toBe(true); // exempt (global search)
    }
  });
});

describe("Randy — the staff accountant, read-only", () => {
  it("reads the books, bank balances, budgets, A/R and reports", () => {
    for (const p of ["/financials/operating-statements", "/financials/cash-analysis", "/financials/budgets/draft", "/financials/balance-sheet", "/tenant-statements", "/reports/monthly"]) {
      expect(authorizeRequest("randy", p)).toBe(true);
    }
    expect(authorizeRequest("randy", "/api/financials/operating-statements", "GET")).toBe(true);
    expect(authorizeRequest("randy", "/api/financials/bank-balances", "GET")).toBe(true);
  });

  it("writes nothing — a GL upload, a note, a budget edit are all refused", () => {
    for (const p of ["/api/financials/operating-statements", "/api/financials/budgets/line-overrides", "/api/financials/ten99", "/api/tenant-statements", "/api/rentroll"]) {
      expect(authorizeRequest("randy", p, "POST")).toBe(false);
      expect(authorizeRequest("randy", p, "DELETE")).toBe(false);
    }
  });

  it("can still sign in and out, set up 2FA and ask the assistant", () => {
    for (const p of ["/api/site/logout", "/api/2fa/enroll", "/api/search/agent"]) expect(authorizeRequest("randy", p, "POST")).toBe(true);
    expect(authorizeRequest("randy", "/api/search/preferences", "POST")).toBe(false);
  });

  it("does not reach debt, bank recs, investors, payroll or the invoicers", () => {
    for (const p of ["/debt", "/bank-rec", "/investors", "/investor-k1", "/payroll", "/allocated-invoicer", "/expenses", "/commissions"]) {
      expect(authorizeRequest("randy", p)).toBe(false);
    }
  });

  it("other users' writes are unchanged", () => {
    expect(authorizeRequest("alison", "/api/financials/operating-statements", "POST")).toBe(true);
  });
});

describe("Tami — tenant receipts, a narrow view", () => {
  it("works Monthly Statements and Receipt Reconciliation, reads unit pages", () => {
    for (const p of ["/dashboard", "/tenant-statements", "/tenant-statements/receipts", "/units/2300-1817"]) {
      expect(authorizeRequest("tami", p)).toBe(true);
    }
    for (const p of ["/api/tenant-statements", "/api/tenant-statements/payment", "/api/tenant-statements/credit-apply", "/api/tenant-statements/receipts", "/api/cam-recon/tenant-link"]) {
      expect(authorizeRequest("tami", p, "POST")).toBe(true);
    }
  });

  it("has no Operating Statements, Report Center, Rent Roll or Property Info", () => {
    for (const p of ["/financials/operating-statements", "/api/financials/operating-statements", "/reports", "/reports/monthly", "/rentroll", "/properties", "/properties/2300"]) {
      expect(authorizeRequest("tami", p)).toBe(false);
    }
  });

  it("cannot upload a GL, import a rent roll, or write anywhere else", () => {
    for (const p of ["/api/financials/operating-statements", "/api/rentroll", "/api/suites/2300-1817/information", "/api/cam-recon/office"]) {
      expect(authorizeRequest("tami", p, "POST")).toBe(false);
    }
  });

  it("sees none of financials, banking, payroll or investors", () => {
    for (const p of ["/financials/budgets", "/financials/cash-analysis", "/api/financials/budgets", "/api/financials/bank-balances", "/bank-rec", "/payroll", "/investors", "/cam-recon", "/deposits"]) {
      expect(authorizeRequest("tami", p)).toBe(false);
    }
  });

  it("everyone else keeps the Report Center", () => {
    for (const u of ["drew", "harry", "nancy", "randy"] as const) expect(authorizeRequest(u, "/reports")).toBe(true);
  });
});

describe("Open Credits — Harry, Alison and Nancy VIEW it", () => {
  const viewers = ["harry", "alison", "nancy"] as const;
  it("open the page and read its data", () => {
    for (const u of viewers) {
      expect(authorizeRequest(u, "/tenant-statements/credits")).toBe(true);
      expect(authorizeRequest(u, "/api/tenant-statements/aging")).toBe(true);
      expect(authorizeRequest(u, "/api/tenant-statements/correspondence")).toBe(true);
    }
  });
  it("cannot import, email or note — writes are Monthly Statements'", () => {
    for (const u of viewers) {
      expect(authorizeRequest(u, "/api/tenant-statements/aging", "POST")).toBe(false);
      expect(authorizeRequest(u, "/api/tenant-statements/credit-notes", "POST")).toBe(false);
      expect(authorizeRequest(u, "/api/tenant-statements/correspondence", "POST")).toBe(false);
    }
  });
  it("get nothing else of Monthly Statements", () => {
    for (const u of viewers) {
      expect(authorizeRequest(u, "/tenant-statements")).toBe(false);
      expect(authorizeRequest(u, "/tenant-statements/receipts")).toBe(false);
      expect(authorizeRequest(u, "/api/tenant-statements/2026-11")).toBe(false);
      expect(authorizeRequest(u, "/api/tenant-statements/receipts")).toBe(false);
    }
  });
  it("tenant A/R is no longer open to every login", () => {
    expect(authorizeRequest("maint", "/api/tenant-statements/2026-11")).toBe(false);
    expect(authorizeRequest("maint", "/api/tenant-statements/aging")).toBe(false);
  });
  it("Tami still works it", () => {
    expect(authorizeRequest("tami", "/api/tenant-statements/aging", "POST")).toBe(true);
    expect(authorizeRequest("tami", "/api/tenant-statements/credit-notes", "POST")).toBe(true);
  });
});

describe("Tenant Notices — Greg approves and sends the month's notices", () => {
  it("Greg opens the page, works it, and views Open Credits", () => {
    expect(authorizeRequest("greg", "/tenant-statements/notices")).toBe(true);
    expect(authorizeRequest("greg", "/api/tenant-notices")).toBe(true);
    expect(authorizeRequest("greg", "/api/tenant-notices", "POST")).toBe(true);
    expect(authorizeRequest("greg", "/tenant-statements/credits")).toBe(true);
    expect(authorizeRequest("greg", "/api/tenant-statements/aging")).toBe(true);
  });
  it("Greg gets nothing else of Monthly Statements, and cannot import or email credits", () => {
    expect(authorizeRequest("greg", "/tenant-statements")).toBe(false);
    expect(authorizeRequest("greg", "/api/tenant-statements/2026-11")).toBe(false);
    expect(authorizeRequest("greg", "/api/tenant-statements/aging", "POST")).toBe(false);
  });
  it("Tami marks credits posted; the other service logins have no access", () => {
    expect(authorizeRequest("tami", "/api/tenant-notices", "POST")).toBe(true);
    for (const u of ["maint", "charles", "jay"] as const) {
      expect(authorizeRequest(u, "/tenant-statements/notices")).toBe(false);
      expect(authorizeRequest(u, "/api/tenant-notices")).toBe(false);
    }
  });
});

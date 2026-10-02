import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The site-auth matcher lists PUBLIC paths by PREFIX, so an entry without a
// boundary leaks every internal route that merely starts the same way:
// "api/statement" exposed /api/statements (the credit-card statements) and
// "api/tenants" exposed /api/tenants/past (former tenants' rents and deposits).
const src = readFileSync(join(__dirname, "middleware.ts"), "utf8").match(/"(\/\(\(\?!.*\)\.\*\))"/)![1];
const gated = (p: string) => new RegExp(`^${src}$`).test(p);

describe("middleware matcher", () => {
  it("keeps internal routes behind login", () => {
    for (const p of ["/api/statements", "/api/statements/x", "/api/tenants/past", "/dashboard", "/investors",
      "/api/investor-k1", "/reservations", "/api/reservations", "/tenant-statements", "/api/tenant-statements"]) {
      expect(gated(p), p).toBe(true);
    }
  });
  it("leaves the public pages and token routes open", () => {
    for (const p of ["/statement/t", "/api/statement/t", "/portal/t", "/api/portal/t", "/investor/t", "/api/investor/t",
      "/api/tenants/lookup", "/api/tenants/companies", "/reserve", "/submit", "/service", "/centers/x", "/login",
      "/budget-review/t", "/api/cron/allocated-send"]) {
      expect(gated(p), p).toBe(false);
    }
  });
});

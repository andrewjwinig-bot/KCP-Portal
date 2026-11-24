import { describe, expect, it } from "vitest";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { API_AUTHZ_EXEMPT, OPEN_API, SENSITIVE_API_PREFIXES, authorizeRequest } from "./users";

// DEFAULT-DENY: every /api route is either gated to a page
// (SENSITIVE_API_PREFIXES), exempt, or reviewed as open (OPEN_API). A new
// route that is none of these is refused for everyone but admin / Drew — this
// test says so at build time instead of a user finding a 403.
function routes(dir = "app/api", out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) routes(p, out);
    else if (f === "route.ts") out.push("/" + path.dirname(p).replace(/^app\//, "").replace(/\[[^\]]+\]/g, "x"));
  }
  return out;
}
const under = (p: string, pre: string) => p === pre || p.startsWith(pre + "/");

describe("API default-deny coverage", () => {
  it("every API route is gated, exempt, or explicitly open", () => {
    const unclassified = routes().filter((r) =>
      !SENSITIVE_API_PREFIXES.some(([a]) => under(r, a)) &&
      !API_AUTHZ_EXEMPT.some((a) => under(r, a)) &&
      !OPEN_API.some((a) => under(r, a)));
    expect(unclassified).toEqual([]);
  });

  it("an unlisted API is refused", () => {
    expect(authorizeRequest("nancy", "/api/some-new-thing", "GET")).toBe(false);
    expect(authorizeRequest("greg", "/api/some-new-thing", "POST")).toBe(false);
  });

  it("the routes that checked nothing are gated to their page", () => {
    expect(authorizeRequest("tami", "/api/status-report", "POST")).toBe(false);
    expect(authorizeRequest("greg", "/api/expenses/carryover", "GET")).toBe(false);
    expect(authorizeRequest("harry", "/api/expenses/carryover", "GET")).toBe(true);
    expect(authorizeRequest("tami", "/api/tenants/past", "GET")).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { safeNext, loginDestination } from "./loginNext";

const approval = "/cam-recon/interim?property=3640&unitRef=3640-105&year=2026&asOf=6";

describe("sign-in keeps an emailed link", () => {
  it("the middleware hands /login the query string, not just the path", () => {
    const src = readFileSync(join(__dirname, "..", "middleware.ts"), "utf8");
    expect(src).toMatch(/searchParams\.set\("next", pathname \+ req\.nextUrl\.search\)/);
  });
  it("a record link survives even the day's first sign-in", () => {
    expect(loginDestination(approval, true)).toBe(approval);
    expect(loginDestination("/rentroll", true)).toBe("/dashboard");
    expect(loginDestination("/rentroll", false)).toBe("/rentroll");
  });
  it("never redirects off the site", () => {
    expect(safeNext("https://evil.example")).toBe("/dashboard");
    expect(safeNext("//evil.example")).toBe("/dashboard");
    expect(safeNext("/\\evil.example")).toBe("/dashboard");
    expect(safeNext(null)).toBe("/dashboard");
    expect(safeNext(approval)).toBe(approval);
  });
});

import { describe, it, expect } from "vitest";
import { REPORTS, REPORT_CATEGORIES, matchesReport } from "./catalog";
import { existsSync } from "node:fs";
import { join } from "node:path";

describe("report catalog", () => {
  it("every report points at a page that exists", () => {
    for (const r of REPORTS) {
      const page = join(process.cwd(), "app", r.href, "page.tsx");
      expect(existsSync(page), `${r.name} → ${r.href}`).toBe(true);
    }
  });
  it("ids are unique and every category is listed", () => {
    expect(new Set(REPORTS.map((r) => r.id)).size).toBe(REPORTS.length);
    for (const r of REPORTS) expect(REPORT_CATEGORIES).toContain(r.category);
  });
  it("search reads name, description, category and format", () => {
    const rr = REPORTS.find((r) => r.id === "rent-roll")!;
    expect(matchesReport(rr, "rent")).toBe(true);
    expect(matchesReport(rr, "excel")).toBe(true);
    expect(matchesReport(rr, "tenants")).toBe(true);
    expect(matchesReport(rr, "mortgage")).toBe(false);
  });
});

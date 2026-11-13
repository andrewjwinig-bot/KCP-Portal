import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { MODULES, PARTS, CHECKLIST } from "./modules";
import { authorizeRequest, isPathAllowed } from "@/lib/users";

describe("orientation modules", () => {
  it("ids are unique and every module sits in a part", () => {
    expect(new Set(MODULES.map((m) => m.id)).size).toBe(MODULES.length);
    for (const m of MODULES) expect(PARTS.some((p) => p.id === m.part)).toBe(true);
    const items = CHECKLIST.flatMap((g) => g.items.map((i) => i.id));
    expect(new Set(items).size).toBe(items.length);
  });
  it("every check has three questions with a valid answer", () => {
    for (const m of MODULES) {
      expect(m.quiz).toHaveLength(3);
      for (const q of m.quiz) expect(q.answer).toBeGreaterThanOrEqual(0), expect(q.answer).toBeLessThan(q.options.length);
    }
  });
  it("every portal link is a real page Randy can open", () => {
    for (const m of MODULES) for (const l of m.portal) {
      expect(existsSync(path.join(process.cwd(), "app", l.href, "page.tsx")), l.href).toBe(true);
      expect(isPathAllowed("randy", l.href), l.href).toBe(true);
    }
  });
  it("Randy opens the orientation and records progress, though read-only", () => {
    expect(isPathAllowed("randy", "/onboarding")).toBe(true);
    expect(authorizeRequest("randy", "/api/onboarding", "POST")).toBe(true);
    expect(authorizeRequest("randy", "/api/onboarding/handbook", "GET")).toBe(true);
    expect(authorizeRequest("randy", "/api/financials/operating-statements", "POST")).toBe(false);
  });
  it("the handbook (EINs, bank details) is not open to every login", () => {
    expect(authorizeRequest("tami", "/api/onboarding/handbook", "GET")).toBe(false);
    expect(authorizeRequest("greg", "/api/onboarding/handbook", "GET")).toBe(false);
  });
  it("the handbook file ships with the app", () => {
    expect(existsSync(path.join(process.cwd(), "data", "onboarding", "Korman New Accountant Handbook.docx"))).toBe(true);
  });
});

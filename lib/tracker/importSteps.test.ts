import { describe, expect, it } from "vitest";
import { IMPORT_REMINDERS } from "./imports";
import { CLOSE_ITEM_STEPS, IMPORT_STEPS, importStepsFor } from "./importSteps";

// Every import prompt carries the (i) with its steps — so every import the
// portal asks for must HAVE steps. A new reminder without them fails here.
describe("import steps", () => {
  it("covers every import reminder", () => {
    for (const r of IMPORT_REMINDERS) expect(importStepsFor(r.id), r.id).not.toBeNull();
  });
  it("covers every close checklist import", () => {
    for (const id of Object.values(CLOSE_ITEM_STEPS)) expect(IMPORT_STEPS[id], id).toBeDefined();
  });
  it("every entry says where it comes from, how, and where it goes", () => {
    for (const [id, s] of Object.entries(IMPORT_STEPS)) {
      expect(s.where.length, id).toBeGreaterThan(0);
      expect(s.steps.length, id).toBeGreaterThan(0);
      expect(s.importAt.href.startsWith("/"), id).toBe(true);
    }
  });
});

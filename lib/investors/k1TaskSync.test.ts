import { describe, expect, it } from "vitest";
import { isTaskEffectivelyDone } from "@/app/tracker/tax-data";
import type { TaxTask } from "@/app/tracker/tax-data";

const task = (ids: string[]): TaxTask => ({
  id: "k1-7010", entity: "7010 Parkwood SC", category: "k1", dueMonth: 3, dueDay: 15,
  investors: ids.map((id) => ({ id, name: id })),
} as TaxTask);

describe("K-1 task completion merges portal sends with manual ticks", () => {
  it("is done when the portal delivered to everyone, with nothing ticked", () => {
    expect(isTaskEffectivelyDone(task(["a", "b"]), {}, { a: true, b: true })).toBe(true);
  });

  it("counts a K-1 handed over outside the portal", () => {
    // Paper copy for b — the manual tick still carries it.
    expect(isTaskEffectivelyDone(task(["a", "b"]), { b: true }, { a: true })).toBe(true);
  });

  it("stays open while one investor has neither", () => {
    expect(isTaskEffectivelyDone(task(["a", "b", "c"]), { b: true }, { a: true })).toBe(false);
  });

  it("never un-ticks what a person marked done", () => {
    // The portal knows nothing about these; the manual ticks stand alone.
    expect(isTaskEffectivelyDone(task(["a", "b"]), { a: true, b: true }, {})).toBe(true);
  });

  it("leaves non-investor filings on their own checkbox", () => {
    const filing = { id: "ret-7010", entity: "x", category: "ret", dueMonth: 3, dueDay: 31 } as TaxTask;
    expect(isTaskEffectivelyDone(filing, {}, { "ret-7010": true })).toBe(false);
    expect(isTaskEffectivelyDone(filing, { "ret-7010": true }, {})).toBe(true);
  });

  it("defaults to the old behaviour when no portal data is passed", () => {
    expect(isTaskEffectivelyDone(task(["a"]), { a: true })).toBe(true);
    expect(isTaskEffectivelyDone(task(["a"]), {})).toBe(false);
  });
});

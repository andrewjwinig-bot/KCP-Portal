import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, unknown>();
vi.mock("@/lib/storage", () => ({
  getJSON: async (_p: string, id: string) => store.get(id) ?? null,
  storeJSON: async (_p: string, id: string, v: unknown) => { store.set(id, JSON.parse(JSON.stringify(v))); },
}));

import { getLeasingAssumptions, isLeaseKind, leasingDecisionFromBody, setLeasingAssumption } from "./leasingAssumptions";

beforeEach(() => store.clear());

describe("leasing decisions", () => {
  it("accepts a back-out everywhere a decision is validated", () => {
    expect(isLeaseKind("stop")).toBe(true);
    const p = leasingDecisionFromBody({ unitRef: "7010-12311", kind: "stop", startMonth: 3 }, "ANDREW");
    expect(p.ok && p.decision.kind === "stop" && p.decision.startMonth === 3).toBe(true);
  });

  it("backs Rite Aid out of 2027 from January with nothing saved", async () => {
    const a = await getLeasingAssumptions(2027, ["7010"]);
    expect(a["7010-12311"]).toMatchObject({ kind: "stop", startMonth: 1 });
    expect((await getLeasingAssumptions(2026, ["7010"]))["7010-12311"]).toBeUndefined();
    expect((await getLeasingAssumptions(2027, ["9510"]))["7010-12311"]).toBeUndefined();
  });

  it("a saved decision replaces the seed, and undoing it stays undone", async () => {
    await setLeasingAssumption(2027, "7010", { unitRef: "7010-12311", kind: "stop", startMonth: 6, updatedBy: "DREW" });
    expect((await getLeasingAssumptions(2027, ["7010"]))["7010-12311"]).toMatchObject({ startMonth: 6 });
    await setLeasingAssumption(2027, "7010", { unitRef: "7010-12311", kind: null });
    expect((await getLeasingAssumptions(2027, ["7010"]))["7010-12311"]).toBeUndefined();
    // Backing it out again clears the undo.
    await setLeasingAssumption(2027, "7010", { unitRef: "7010-12311", kind: "stop", startMonth: 1 });
    expect((await getLeasingAssumptions(2027, ["7010"]))["7010-12311"]).toMatchObject({ kind: "stop" });
  });
});

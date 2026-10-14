import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, unknown>();
vi.mock("@/lib/storage", () => ({
  getJSON: async (p: string, id: string) => store.get(`${p}/${id}`) ?? null,
  storeJSON: async (p: string, id: string, v: unknown) => { store.set(`${p}/${id}`, JSON.parse(JSON.stringify(v))); },
  listJSON: async (p: string) => [...store.entries()].filter(([k]) => k.startsWith(`${p}/`)).map(([, v]) => v),
}));

import { getLeasingAssumptions, isLeaseKind, leasingDecisionFromBody, setLeasingAssumption } from "./leasingAssumptions";

beforeEach(() => store.clear());

describe("leasing decisions", () => {
  it("accepts a back-out everywhere a decision is validated", () => {
    expect(isLeaseKind("stop")).toBe(true);
    const p = leasingDecisionFromBody({ unitRef: "7010-12311", kind: "stop", startMonth: 3 }, "ANDREW");
    expect(p.ok && p.decision.kind === "stop" && p.decision.startMonth === 3).toBe(true);
  });

  it("keeps a back-out's THROUGH month, never before its start, and only on a back-out", () => {
    const one = leasingDecisionFromBody({ unitRef: "7300-1", kind: "stop", startMonth: 1, endMonth: 1 }, "ANDREW");
    expect(one.ok && one.decision).toMatchObject({ startMonth: 1, endMonth: 1 });
    const back = leasingDecisionFromBody({ unitRef: "7300-1", kind: "stop", startMonth: 5, endMonth: 2 }, "ANDREW");
    expect(back.ok && back.decision.endMonth).toBe(5);
    const renew = leasingDecisionFromBody({ unitRef: "7300-1", kind: "renew", endMonth: 3 }, "ANDREW");
    expect(renew.ok && renew.decision.endMonth).toBeUndefined();
  });

  it("a save writes ONLY its suite — it cannot erase another suite's call (9510-416 lost on refresh)", async () => {
    // An old per-property document, as stored before the split.
    store.set("budget-leasing-assumptions/2027-9510", { assumptions: { "9510-100": { unitRef: "9510-100", kind: "vacate" } } });
    await setLeasingAssumption(2027, "9510", { unitRef: "9510-416", kind: "leaseup", startMonth: 8, rentPsf: 30, tiPsf: 50, updatedBy: "DREW" });
    await setLeasingAssumption(2027, "9510", { unitRef: "9510-200", kind: "renew", updatedBy: "HARRY" });
    const a = await getLeasingAssumptions(2027, ["9510"]);
    expect(a["9510-416"]).toMatchObject({ kind: "leaseup", startMonth: 8, rentPsf: 30, tiPsf: 50, updatedBy: "DREW" });
    expect(a["9510-200"]).toMatchObject({ kind: "renew" });
    expect(a["9510-100"]).toMatchObject({ kind: "vacate" });  // the old document still reads
    // Clearing one suite leaves the others.
    await setLeasingAssumption(2027, "9510", { unitRef: "9510-100", kind: null });
    const b = await getLeasingAssumptions(2027, ["9510"]);
    expect(b["9510-100"]).toBeUndefined();
    expect(b["9510-416"]).toBeDefined();
  });

  it("takes a SET rent (no TI / LC — not a deal), January by default, and refuses one with no rent", () => {
    const p = leasingDecisionFromBody({ unitRef: "7010-12349", kind: "rent", monthlyRent: 2500, tiPsf: 10, lcPct: 5 }, "ANDREW");
    expect(p.ok && p.decision).toMatchObject({ kind: "rent", monthlyRent: 2500, startMonth: 1, tiPsf: undefined, lcPct: undefined });
    expect(leasingDecisionFromBody({ unitRef: "7010-12349", kind: "rent" }, "ANDREW").ok).toBe(false);
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

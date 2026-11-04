import { describe, it, expect } from "vitest";
import { confirmedMoveouts, sameTenant } from "./confirmedMoveouts";

const u = (unitRef: string, occupantName: string, leaseTo: string | null, isVacant = false) =>
  ({ unitRef, occupantName, leaseTo, isVacant, sqft: 1000 });
const roll = (reportTo: string, properties: { propertyCode: string; units: ReturnType<typeof u>[] }[]) => ({ reportTo, properties });

const NOW = new Date("2026-10-01T12:00:00Z");
const AUG = "8/31/2026", SEP = "9/30/2026";

describe("confirmedMoveouts — a renewal is never a move-out", () => {
  it("a tenant whose lease expired but is on the following roll with a new term is NOT a move-out", () => {
    const out = confirmedMoveouts([
      roll(AUG, [{ propertyCode: "4050", units: [u("4050-6", "Regional Cardiology Consultant", "8/31/2026")] }]),
      roll(SEP, [{ propertyCode: "4050", units: [u("4050-6", "Regional Cardiology Consultant", "8/31/2031")] }]),
    ], NOW);
    expect(out).toEqual([]);
  });

  it("an expired lease still on the following roll (renewal not keyed yet) is NOT a move-out", () => {
    const out = confirmedMoveouts([
      roll(AUG, [{ propertyCode: "4050", units: [u("4050-8", "Reliant Care Solutions, LP", "7/31/2026")] }]),
      roll(SEP, [{ propertyCode: "4050", units: [u("4050-8", "Reliant Care Solutions, LP", "7/31/2026")] }]),
    ], NOW);
    expect(out).toEqual([]);
  });

  it("an expired lease with no roll since is NOT a move-out — the next import decides", () => {
    const out = confirmedMoveouts([
      roll(SEP, [{ propertyCode: "4050", units: [u("4050-1", "Julia Meehan-Haley Eicher LLC", "9/15/2026")] }]),
    ], NOW);
    expect(out).toEqual([]);
  });

  it("naming drift on the later roll still reads as the same tenant", () => {
    expect(sameTenant("Regional Cardiology Consultant", "Regional Cardiology Consultants")).toBe(true);
    expect(sameTenant("Land Medical, Inc.", "Land Medical Inc")).toBe(true);
    expect(sameTenant("Acme", "Acme Plumbing")).toBe(false);
  });

  it("a tenant gone from the following roll IS a move-out, dated by the last roll that showed them", () => {
    const out = confirmedMoveouts([
      roll(AUG, [{ propertyCode: "4050", units: [u("4050-4", "Search Engines Marketer, Inc.", "8/31/2026")] }]),
      roll(SEP, [{ propertyCode: "4050", units: [u("4050-4", "", null, true)] }]),
    ], NOW);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ unitRef: "4050-4", lastSeen: "2026-08", goneAsOf: "2026-09" });
  });

  it("a property missing from a later import is not evidence anyone left", () => {
    const out = confirmedMoveouts([
      roll(AUG, [
        { propertyCode: "4050", units: [u("4050-4", "Office Tenant", "12/31/2027")] },
        { propertyCode: "2300", units: [u("2300-1879", "Retail Tenant", "12/31/2027")] },
      ]),
      roll(SEP, [{ propertyCode: "4050", units: [u("4050-4", "Office Tenant", "12/31/2027")] }]),
    ], NOW);
    expect(out).toEqual([]);
  });

  it("a tenant who moved to another suite in the property has not moved out", () => {
    const out = confirmedMoveouts([
      roll(AUG, [{ propertyCode: "4050", units: [u("4050-4", "Land Medical, Inc.", "8/31/2026"), u("4050-9", "", null, true)] }]),
      roll(SEP, [{ propertyCode: "4050", units: [u("4050-4", "", null, true), u("4050-9", "Land Medical, Inc.", "8/31/2031")] }]),
    ], NOW);
    expect(out).toEqual([]);
  });
});

describe("confirmedMoveouts — a close-out looks further back than the candidate list", () => {
  // Gilson (3640-105): lease ended 6/30/2026, off the July roll; opened to
  // close out in November, he read "still on the rent roll" because the
  // candidate list only reaches ~60 days back.
  const rolls = [
    roll("6/30/2026", [{ propertyCode: "3640", units: [u("3640-105", "Edward J. Gilson Jr.", "6/30/2026"), u("3640-106", "Stays", "12/31/2028")] }]),
    roll("7/31/2026", [{ propertyCode: "3640", units: [u("3640-105", "", null, true), u("3640-106", "Stays", "12/31/2028")] }]),
    roll("10/31/2026", [{ propertyCode: "3640", units: [u("3640-105", "", null, true), u("3640-106", "Stays", "12/31/2028")] }]),
  ];
  const nov = new Date("2026-11-04T12:00:00Z");
  it("is outside the 60-day candidate window", () => {
    expect(confirmedMoveouts(rolls, nov).some((m) => m.unitRef === "3640-105")).toBe(false);
  });
  it("is confirmed gone over the close-out lookback, and a tenant still there is not", () => {
    const out = confirmedMoveouts(rolls, nov, 730);
    expect(out.some((m) => m.unitRef === "3640-105" && sameTenant(m.occupantName, "Edward J. Gilson Jr."))).toBe(true);
    expect(out.some((m) => m.unitRef === "3640-106")).toBe(false);
  });
});

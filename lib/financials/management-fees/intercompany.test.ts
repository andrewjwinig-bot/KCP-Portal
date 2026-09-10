import { describe, it, expect } from "vitest";
import { intercompanyTieOut, suggestedEntry } from "./intercompany";

const m = (v: Partial<Record<number, number>>) =>
  Array.from({ length: 12 }, (_, i) => v[i + 1] ?? 0);

/**
 * The 2026 shape that prompted this, from the posted GL: the buildings expense a
 * fee every month, while 2010's revenue is two hand-keyed journal entries that
 * drift — and in February were never posted at all.
 */
const BUILDINGS = m({ 1: 51_175, 2: 59_868, 3: 63_584, 4: 56_528, 5: 63_357, 6: 50_137, 7: 65_200 });
const LIK       = m({ 1: 60_754, 2: 0,      3: 118_676, 4: 63_584, 5: 57_857, 6: 62_030, 7: 51_372 });

describe("management-fee intercompany tie-out", () => {
  const t = intercompanyTieOut(BUILDINGS, LIK, 7);

  it("names February as a missed journal entry, not a rounding difference", () => {
    // The buildings billed $59,868 and 2010 booked nothing. That is a step
    // somebody did not do, and it is the one finding worth interrupting for.
    expect(t.missed).toEqual([2]);
    expect(t.months[1].status).toBe("not-posted");
    expect(t.months[1].buildingsFee).toBe(59_868);
    expect(t.months[1].likRevenue).toBe(0);
  });

  it("flags every month the two sides disagree — which is ALL of them", () => {
    // Not one month ties. April looks like a match at a glance because 2010's
    // April figure ($63,584) equals the buildings' MARCH total — the entry
    // running a month behind — but April against April is $56,528 vs $63,584.
    // This is not drift on a mostly-correct process; the two sides are simply
    // never reconciled.
    expect(t.months[3].buildingsFee).toBe(56_528);
    expect(t.months[3].likRevenue).toBe(63_584);
    expect(t.disagreeing).toEqual([1, 3, 4, 5, 6, 7]);
    expect(t.months.filter((x) => x.status === "ties")).toEqual([]);
    expect(t.clean).toBe(false);
  });

  it("shows the YTD gap netting small while the months are wild", () => {
    // The trap this is built to defeat: the annual figure looks fine, so
    // nothing prompts anyone to look, and the monthly reality goes unseen.
    expect(t.buildingsYtd).toBe(409_849);
    expect(t.likYtd).toBe(414_273);
    expect(t.varianceYtd).toBe(4_424);
    expect(Math.abs(t.varianceYtd) / t.buildingsYtd).toBeLessThan(0.011); // ~1%
  });

  it("reports the worst month, which dwarfs the year's gap", () => {
    // February, the month with no entry at all: $59,868 against $4,424 for the
    // whole year. March is nearly as bad in the other direction (+$55,092 —
    // February's entry arriving late), which is what a catch-up looks like.
    expect(t.worstMonth?.month).toBe(2);
    expect(t.worstMonth?.variance).toBe(-59_868);
    expect(t.months[2].variance).toBe(55_092);
    expect(Math.abs(t.worstMonth!.variance)).toBeGreaterThan(Math.abs(t.varianceYtd) * 10);
  });

  it("does not judge a month neither side has posted", () => {
    expect(t.months[7].status).toBe("pending"); // August
    expect(t.months.filter((x) => x.status === "pending").map((x) => x.month)).toEqual([8, 9, 10, 11, 12]);
  });

  it("does not count a not-yet-posted month against LIK", () => {
    // A building posting late must not read as LIK over-booking. Judged only
    // through `through`.
    const early = intercompanyTieOut(BUILDINGS, LIK, 1);
    expect(early.buildingsYtd).toBe(51_175);
    expect(early.months[1].status).toBe("pending");
  });

  it("calls a clean year clean", () => {
    const same = m({ 1: 1000, 2: 1000, 3: 1000 });
    const t2 = intercompanyTieOut(same, same, 3);
    expect(t2.clean).toBe(true);
    expect(t2.varianceYtd).toBe(0);
    expect(t2.worstMonth).toBeNull();
    expect(t2.months.slice(0, 3).every((x) => x.status === "ties")).toBe(true);
  });

  it("tolerates rounding but not a real difference", () => {
    expect(intercompanyTieOut(m({ 1: 1000 }), m({ 1: 1001 }), 1).clean).toBe(true);
    expect(intercompanyTieOut(m({ 1: 1000 }), m({ 1: 1002 }), 1).clean).toBe(false);
    expect(intercompanyTieOut(m({ 1: 1000 }), m({ 1: 1050 }), 1, { tolerance: 100 }).clean).toBe(true);
  });
});

describe("the entry that should be posted", () => {
  const buildings = [
    { code: "4050", group: "bp", feeMonthly: m({ 7: 10_000 }) },
    { code: "4060", group: "bp", feeMonthly: m({ 7: 11_437.72 }) },
    { code: "2300", group: "sc", feeMonthly: m({ 7: 7_971 }) },
    { code: "4500", group: "sc", feeMonthly: m({ 7: 16_113 }) },
  ];
  const NILLC = ["4050", "4060", "4070", "4080", "40A0", "40B0", "40C0"];

  it("splits the fees the way the entries are actually keyed", () => {
    // Two lines, matching the two journal entries already in use — so the
    // figure can be posted as-is rather than re-derived by hand.
    const e = suggestedEntry(buildings, m({ 7: 51_372 }), 7, NILLC);
    expect(e.lines.map((l) => [l.label, l.amount])).toEqual([
      ["Management Fees - NILLC", 21_438],
      ["Mgmt Fees - Other", 24_084],
    ]);
    expect(e.total).toBe(45_522);
  });

  it("states the correcting adjustment against what is already booked", () => {
    const e = suggestedEntry(buildings, m({ 7: 40_000 }), 7, NILLC);
    expect(e.posted).toBe(40_000);
    expect(e.adjustment).toBe(5_522);
  });

  it("is the whole entry when nothing was posted — the February case", () => {
    const e = suggestedEntry(buildings, m({}), 7, NILLC);
    expect(e.posted).toBe(0);
    expect(e.adjustment).toBe(e.total);
  });

  it("drops a group with no buildings rather than posting a zero line", () => {
    const e = suggestedEntry(buildings.filter((b) => b.group === "sc"), m({}), 7, NILLC);
    expect(e.lines.map((l) => l.label)).toEqual(["Mgmt Fees - Other"]);
  });
});

describe("an incomplete buildings column is the report's fault, not the ledger's", () => {
  it("carries the buildings whose GL is not loaded", () => {
    // No property pays an outside management fee — every 6610 dollar is
    // payable to 2010 — so the columns must be equal and a variance is an
    // error. The one way this report can manufacture a false gap is its own
    // input: a fee-paying building with no GL loaded contributes nothing to
    // the buildings column while 2010 booked its fee, which reads as 2010
    // over-booking by exactly that building's fee.
    const t = intercompanyTieOut(BUILDINGS, LIK, 7, { missingGl: ["7200", "8200"] });
    expect(t.missingGl).toEqual(["7200", "8200"]);
  });

  it("is empty when every building has a ledger", () => {
    expect(intercompanyTieOut(BUILDINGS, LIK, 7).missingGl).toEqual([]);
  });
});

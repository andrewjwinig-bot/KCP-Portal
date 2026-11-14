import { describe, it, expect } from "vitest";
import { priorFor, type Snapshot } from "./weekOverWeek";

const snap = (date: string, balance: number): Snapshot => ({ date, accounts: { "JPM-Chase|x5615": { balance, asOf: date } } });

describe("week-over-week baseline", () => {
  const snaps = [snap("2026-10-06", 900), snap("2026-10-13", 1000), snap("2026-10-15", 1050), snap("2026-10-20", 1200)];
  it("takes the newest balance at least a week back", () => {
    expect(priorFor("JPM-Chase|x5615", "2026-10-20", snaps)?.balance).toBe(1050);
  });
  it("a re-import in the same week is not the baseline", () => {
    // Wed 10/15 compares to last week's 10/6, not Monday's 10/13 two days ago.
    expect(priorFor("JPM-Chase|x5615", "2026-10-15", snaps)?.balance).toBe(900);
  });
  it("tolerates an uneven week (Mon then Wed)", () => {
    expect(priorFor("JPM-Chase|x5615", "2026-10-22", snaps)?.balance).toBe(1050);
  });
  it("shows nothing when no snapshot is a week old", () => {
    expect(priorFor("JPM-Chase|x5615", "2026-10-13", [snap("2026-10-13", 1000)])).toBeNull();
    expect(priorFor("Liberty Bank|x0598", "2026-10-20", snaps)).toBeNull();
  });
});

import { describe, it, expect } from "vitest";
import { annualStatementReminderState } from "./annualStatement";

const d = (s: string) => new Date(s + "T00:00:00");

describe("annualStatementReminderState", () => {
  it("is hidden outside the season (mid-year)", () => {
    expect(annualStatementReminderState(d("2026-07-24"), "")).toBeNull();
  });
  it("shows neutral in early January (run-up, >21 days out)", () => {
    const s = annualStatementReminderState(d("2027-01-15"), "");
    expect(s?.tone).toBe("neutral");
    expect(s?.sub).toContain("2026");
  });
  it("escalates to amber within 21 days of March 1", () => {
    expect(annualStatementReminderState(d("2027-02-20"), "")?.tone).toBe("soon");
  });
  it("goes red (action) once March 1 has passed unfinalized", () => {
    const s = annualStatementReminderState(d("2027-03-10"), "");
    expect(s?.tone).toBe("action");
    expect(s?.title).toBe("Finalize statement of values");
  });
  it("turns green once this season's estimates are set", () => {
    const s = annualStatementReminderState(d("2027-02-20"), "2027-02-18");
    expect(s?.tone).toBe("paid");
    expect(s?.title).toContain("finalized");
  });
  it("last year's asOf does NOT count as finalized for the new season", () => {
    expect(annualStatementReminderState(d("2027-02-20"), "2026-02-01")?.tone).toBe("soon");
  });
  it("disappears again by April", () => {
    expect(annualStatementReminderState(d("2027-04-05"), "")).toBeNull();
  });
});

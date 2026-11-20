import { describe, expect, it } from "vitest";
import { reminderEmail, remindersDue } from "./capexJeReminder";
import { capexFor } from "./capex";

// 12:45 UTC — the cron's hour — is morning Eastern.
const at = (iso: string) => new Date(`${iso}T12:45:00Z`);

describe("the yearly journal-entry reminder for 2300's capitalized CAM", () => {
  it("is due every December 1st from 2026 through 2031, and only then", () => {
    expect(remindersDue(at("2026-11-30"), new Set()).map((d) => d.key)).toEqual([]);
    expect(remindersDue(at("2026-12-01"), new Set()).map((d) => d.key)).toEqual(["2300-2026"]);
    expect(remindersDue(at("2031-12-01"), new Set()).map((d) => d.key)).toEqual(["2300-2031"]);
    expect(remindersDue(at("2032-12-01"), new Set())).toEqual([]);
    expect(remindersDue(at("2025-12-01"), new Set())).toEqual([]);
  });

  it("goes once a year, and a missed day is caught up that month only", () => {
    expect(remindersDue(at("2026-12-01"), new Set(["2300-2026"]))).toEqual([]);
    expect(remindersDue(at("2026-12-09"), new Set()).map((d) => d.key)).toEqual(["2300-2026"]);
    expect(remindersDue(at("2027-01-02"), new Set())).toEqual([]);
  });

  it("goes to Randy, Marie and Drew and names the year's amount", () => {
    const [c] = capexFor("2300");
    expect(c.jeReminder?.to).toEqual(["rlee@kormancommercial.com", "mjaster@kormancommercial.com", "dwinig@kormancommercial.com"]);
    const e = reminderEmail(c, 2026);
    expect(e.subject).toContain("2026 journal entry");
    expect(e.text).toContain("$46,353.44");
    expect(e.text).toContain("year 1 of 6");
    expect(reminderEmail(c, 2031).text).toContain("this is the last year");
  });
});

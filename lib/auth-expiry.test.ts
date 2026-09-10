import { describe, it, expect } from "vitest";
import { dailyExpiry } from "./auth-expiry";

const ET = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit",
});
function etClock(ms: number): string {
  const p = ET.formatToParts(new Date(ms));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("hour")}:${g("minute")}:${g("second")}`;
}

describe("dailyExpiry (daily midnight-ET logout)", () => {
  // Mid-month dates avoid DST transition days (where a day isn't 86400s).
  for (const iso of ["2026-06-10T14:30:00Z", "2026-01-15T09:00:00Z", "2026-06-10T03:45:00Z"]) {
    it(`expires at the next Eastern midnight (from ${iso})`, () => {
      const now = Date.parse(iso);
      const { expiresSec, maxAge } = dailyExpiry(now);
      expect(maxAge).toBeGreaterThan(0);
      expect(maxAge).toBeLessThanOrEqual(86400);
      expect(expiresSec).toBe(Math.floor(now / 1000) + maxAge);
      // The expiry instant read in Eastern time is exactly midnight.
      expect(etClock(expiresSec * 1000)).toMatch(/^(00|24):00:00$/);
      // …and it's still in the future.
      expect(expiresSec).toBeGreaterThan(Math.floor(now / 1000));
    });
  }
});

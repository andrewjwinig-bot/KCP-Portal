import { describe, expect, it } from "vitest";
import { arBucket, brandRamp, expiryBucket, isoDate, labelSize, monthsLeft, scaleOf } from "./staffPlanMath";

const today = new Date(2026, 9, 28); // 10/28/2026

describe("internal site plan colouring", () => {
  it("reads the rent roll's dates", () => {
    expect(isoDate("11/30/2026")).toBe("2026-11-30");
    expect(isoDate("2027-01-31")).toBe("2027-01-31");
    expect(isoDate("")).toBeNull();
  });
  it("counts whole months left on a lease", () => {
    expect(monthsLeft("11/30/2026", today)).toBe(1);
    expect(monthsLeft("10/27/2026", today)).toBe(-1);
    expect(monthsLeft("10/28/2027", today)).toBe(12);
  });
  it("buckets a suite by lease expiry, vacancy first", () => {
    const at = (leaseTo: string | null, status: "leased" | "available" = "leased") => expiryBucket({ status, leaseTo }, today);
    expect(at("12/31/2030", "available")).toBe("vacant");
    expect(at("09/30/2026")).toBe("expired");
    expect(at("11/30/2026")).toBe("lt12");
    expect(at("12/31/2027")).toBe("lt24");
    expect(at("12/31/2030")).toBe("later");
    expect(at(null)).toBe("unknown");
  });
  it("colours A/R by the exception — past due — not by a current month's charges", () => {
    expect(arBucket({ totalDue: 4200, pastDue: 0, period: "2026-10", asOf: null })).toBe("current");
    expect(arBucket({ totalDue: 9000, pastDue: 4800, period: "2026-10", asOf: null })).toBe("pastDue");
    expect(arBucket({ totalDue: 0, pastDue: 0, period: "2026-10", asOf: null })).toBe("none");
    expect(arBucket(null)).toBe("unknown");
  });
  it("scales rent $/SF across the centre's leased suites", () => {
    expect(scaleOf(20, [10, 20, 30])).toBe(0.5);
    expect(scaleOf(0, [10, 20])).toBe(0);
    expect(brandRamp(1)).toBe("rgb(11,74,125)");
  });
  it("shrinks a label to fit a narrow storefront", () => {
    expect(labelSize({ label: "355", w: 37, h: 246, rot: 0 }, 30)).toBeLessThan(20);
    expect(labelSize({ label: "319", w: 157, h: 212, rot: 0 }, 30)).toBe(30);
    expect(labelSize({ label: "210", w: 40, h: 40, rot: 0, fs: 22 }, 30)).toBe(22);
  });
});

import { describe, it, expect } from "vitest";
import { rentCheck, mdyToISO, suiteOf, type RentCheckUnit } from "./rentCheck";

const unit = (over: Partial<RentCheckUnit> & { unitRef: string }): RentCheckUnit => ({
  tenant: "Tenant", isVacant: false, sqft: 1000, baseRent: 5000,
  leaseFrom: "01/01/2020", leaseTo: "12/31/2030", ...over,
});

const rowFor = (res: ReturnType<typeof rentCheck>, ref: string) =>
  res.rows.find((r) => r.unitRef === ref)!;

describe("mdyToISO / suiteOf", () => {
  it("converts the rent roll's date format and leaves anything else null", () => {
    expect(mdyToISO("11/1/2026")).toBe("2026-11-01");
    expect(mdyToISO("12/31/2030")).toBe("2030-12-31");
    expect(mdyToISO("M-M")).toBeNull();
    expect(mdyToISO(null)).toBeNull();
  });
  it("takes the suite out of a unit ref", () => {
    expect(suiteOf("9510-406")).toBe("406");
    expect(suiteOf("9510-500C")).toBe("500C");
    expect(suiteOf("2300-1817")).toBe("1817");
  });
});

describe("rentCheck — billing variance, suite by suite", () => {
  const base = { year: 2026, period: 6, scope: "month" as const };

  it("a suite billed its contract rent ties", () => {
    const res = rentCheck({ ...base, units: [unit({ unitRef: "9510-406" })], billedByUnit: { "9510-406": 5000 } });
    expect(rowFor(res, "9510-406").status).toBe("ok");
    expect(rowFor(res, "9510-406").variance).toBe(0);
  });

  it("a leased suite with nothing posted is NOT-BILLED, not merely short", () => {
    const res = rentCheck({ ...base, units: [unit({ unitRef: "9510-406" })], billedByUnit: {} });
    const r = rowFor(res, "9510-406");
    expect(r.status).toBe("not-billed");
    expect(r.expected).toBe(5000);
    expect(r.variance).toBe(-5000);
  });

  it("separates under-billing from over-billing", () => {
    const res = rentCheck({
      ...base,
      units: [unit({ unitRef: "9510-406" }), unit({ unitRef: "9510-412" })],
      billedByUnit: { "9510-406": 4500, "9510-412": 5600 },
    });
    expect(rowFor(res, "9510-406").status).toBe("short");
    expect(rowFor(res, "9510-412").status).toBe("over");
  });

  it("a dollar of rounding is not a finding", () => {
    const res = rentCheck({ ...base, units: [unit({ unitRef: "9510-406" })], billedByUnit: { "9510-406": 5000.4 } });
    expect(rowFor(res, "9510-406").status).toBe("ok");
  });

  it("a vacant suite is owed nothing — billing one is flagged, not silently netted", () => {
    const res = rentCheck({
      ...base,
      units: [unit({ unitRef: "9510-412", isVacant: true, tenant: null })],
      billedByUnit: { "9510-412": 3000 },
    });
    const r = rowFor(res, "9510-412");
    expect(r.expected).toBe(0);
    expect(r.status).toBe("unexpected");
    // The usual cause is a lease signed since the roll was imported, and the
    // row says so — "unexpected" alone reads as a posting error.
    expect(r.caveats.join(" ")).toMatch(/new lease signed since/i);
  });

  it("a vacant suite with nothing billed is idle, not a finding", () => {
    const res = rentCheck({ ...base, units: [unit({ unitRef: "9510-412", isVacant: true })], billedByUnit: {} });
    expect(rowFor(res, "9510-412").status).toBe("idle");
  });

  it("a lease starting mid-window is PARTIAL — a prorated charge must not read as short", () => {
    // Lease starts 6/15; June is covered but only in part.
    const res = rentCheck({
      ...base,
      units: [unit({ unitRef: "9510-500C", leaseFrom: "06/15/2026" })],
      billedByUnit: { "9510-500C": 2500 },
    });
    const r = rowFor(res, "9510-500C");
    expect(r.status).toBe("partial");
    expect(r.caveats.join(" ")).toMatch(/prorated/i);
  });

  it("a lease that ended before the window is owed nothing", () => {
    const res = rentCheck({
      ...base,
      units: [unit({ unitRef: "9510-406", leaseTo: "03/31/2026" })],
      billedByUnit: {},
    });
    const r = rowFor(res, "9510-406");
    expect(r.expected).toBe(0);
    expect(r.monthsCovered).toBe(0);
    expect(r.status).toBe("idle");
  });

  it("a lease that has not started yet is owed nothing", () => {
    const res = rentCheck({
      ...base,
      units: [unit({ unitRef: "9510-406", leaseFrom: "09/01/2026" })],
      billedByUnit: {},
    });
    expect(rowFor(res, "9510-406").expected).toBe(0);
  });

  it("YTD multiplies contract rent by the months the lease covers, and says the rate is a snapshot", () => {
    const res = rentCheck({
      year: 2026, period: 6, scope: "ytd",
      units: [unit({ unitRef: "9510-406" })],
      billedByUnit: { "9510-406": 30000 },
    });
    const r = rowFor(res, "9510-406");
    expect(r.monthsInScope).toBe(6);
    expect(r.expected).toBe(30000);
    expect(r.status).toBe("ok");
    expect(r.caveats.join(" ")).toMatch(/escalation/i);
  });

  it("a single month asserts nothing it cannot know — no snapshot caveat", () => {
    const res = rentCheck({ ...base, units: [unit({ unitRef: "9510-406" })], billedByUnit: { "9510-406": 5000 } });
    expect(rowFor(res, "9510-406").caveats).toEqual([]);
  });

  it("rent billed to a suite the roll doesn't carry gets its own row, so billed still ties", () => {
    const res = rentCheck({
      ...base,
      units: [unit({ unitRef: "9510-406" })],
      billedByUnit: { "9510-406": 5000, "9510-999": 1200 },
    });
    const ghost = rowFor(res, "9510-999");
    expect(ghost.status).toBe("unexpected");
    expect(res.totals.billed).toBe(6200);
  });

  it("carries open A/R through, and reports it as absent rather than zero when no import covers it", () => {
    const withAr = rentCheck({
      ...base, units: [unit({ unitRef: "9510-406" })], billedByUnit: { "9510-406": 5000 },
      arByUnit: { "9510-406": { totalDue: 1250.5, pastDue: 1250.5 } },
    });
    expect(rowFor(withAr, "9510-406").openAr).toBe(1250.5);
    expect(withAr.totals.pastDue).toBe(1250.5);

    const noAr = rentCheck({ ...base, units: [unit({ unitRef: "9510-406" })], billedByUnit: { "9510-406": 5000 } });
    expect(rowFor(noAr, "9510-406").openAr).toBeNull();
    expect(noAr.totals.openAr).toBeNull(); // null = not loaded, NOT "nothing owed"
  });

  it("reports rental income it could not place on any suite", () => {
    const res = rentCheck({ ...base, units: [unit({ unitRef: "9510-406" })], billedByUnit: { "9510-406": 5000 }, unplacedBilled: 840 });
    expect(res.unplacedBilled).toBe(840);
  });

  it("sorts worst-first so the missing charge is the first thing read", () => {
    const res = rentCheck({
      ...base,
      units: [
        unit({ unitRef: "9510-100" }),                       // ok
        unit({ unitRef: "9510-200" }),                       // not billed
        unit({ unitRef: "9510-300" }),                       // short
        unit({ unitRef: "9510-400", isVacant: true }),       // idle
      ],
      billedByUnit: { "9510-100": 5000, "9510-300": 1000 },
    });
    expect(res.rows.map((r) => r.status)).toEqual(["not-billed", "short", "ok", "idle"]);
    expect(res.counts["not-billed"]).toBe(1);
  });

  it("totals tie to the rows", () => {
    const res = rentCheck({
      ...base,
      units: [unit({ unitRef: "9510-100" }), unit({ unitRef: "9510-200", baseRent: 2500 })],
      billedByUnit: { "9510-100": 5000 },
    });
    expect(res.totals.expected).toBe(7500);
    expect(res.totals.billed).toBe(5000);
    expect(res.totals.variance).toBe(-2500);
  });
});

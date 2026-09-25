import { describe, it, expect } from "vitest";
import { rentCheck, basisForLine, mdyToISO, suiteOf, type RentCheckUnit } from "./rentCheck";

const unit = (over: Partial<RentCheckUnit> & { unitRef: string }): RentCheckUnit => ({
  tenant: "Tenant", isVacant: false, sqft: 1000, baseRent: 5000,
  opexMonth: 0, reTaxMonth: 0, otherMonth: 0,
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

// WHICH rent-roll column a line is checked against. 4500's Common Area is the
// case that exposed it: the GL billed $30,030 of CAM, the rent roll's
// OPERATING EXPENSE column says $30,030 — and the table reported a $109,301
// "billing variance" because it had compared against $139,331 of base rent.
describe("the rent-roll column a line is checked against", () => {
  it("routes the four lines that have a column", () => {
    expect(basisForLine("Common Area", "4910-8501,4910-8502,4901-8506")).toBe("cam");
    expect(basisForLine("Common Area", "4910-0000,4910-8501,4910-8502,4910-8506")).toBe("cam");
    expect(basisForLine("Real Estate Taxes", "4920-*")).toBe("ret");
    expect(basisForLine("Insurance", "4930-*")).toBe("other");
    expect(basisForLine("Rental income", "4230-*")).toBe("base");
  });

  it("returns NULL where the rent roll has no column — never base rent", () => {
    // Each of these is billed per suite and each was being checked against
    // base rent. No basis means the table is not shown at all.
    expect(basisForLine("Electric", "4710-*,4910-8503")).toBeNull();
    expect(basisForLine("Condo Assn", "4970-*")).toBeNull();
    expect(basisForLine("Percentage Rents", "4240-*")).toBeNull();
    expect(basisForLine("Miscellaneous", "4980..4999-*")).toBeNull();
  });

  it("reads the LABEL before the mask, because the masks overlap", () => {
    // Electric's mask carries 4910-8503, and 4910 is the Common Area family.
    expect(basisForLine("Electric", "4910-8503")).toBeNull();
  });

  it("expects the CAM column on a CAM line — 4500's real July figures", () => {
    const units = [
      unit({ unitRef: "4500-2851", tenant: "McDonald's Corp", baseRent: 6666.67, opexMonth: 1550 }),
      unit({ unitRef: "4500-3021", tenant: "Wakefern Food Corp", baseRent: 61368.67, opexMonth: 23100 }),
      // Billed no CAM and owed none — must read as idle, not "NOT BILLED $26,057".
      unit({ unitRef: "4500-3007", tenant: "Pennsylvania LCB", baseRent: 26056.67, opexMonth: 0 }),
    ];
    const billedByUnit = { "4500-2851": 1550, "4500-3021": 23100 };
    const res = rentCheck({ year: 2026, period: 7, scope: "month", units, billedByUnit, basis: "cam" });
    expect(res.totals.expected).toBe(24650);
    expect(res.totals.variance).toBe(0);
    expect(rowFor(res, "4500-2851").status).toBe("ok");
    expect(rowFor(res, "4500-3021").status).toBe("ok");
    expect(rowFor(res, "4500-3007").status).toBe("idle");
  });

  it("still checks base rent against base rent", () => {
    const units = [unit({ unitRef: "4500-2851", baseRent: 6666.67, opexMonth: 1550 })];
    const res = rentCheck({ year: 2026, period: 7, scope: "month", units, billedByUnit: { "4500-2851": 6666.67 } });
    expect(rowFor(res, "4500-2851").status).toBe("ok");
  });
});

// The lease term is carried for the HOVER, not as columns — and the caveats
// name the actual date, because "starts or ends inside this window" leaves the
// reader to go and find out which, and when.
describe("what the lease dates explain", () => {
  const cam = (over: Partial<RentCheckUnit> & { unitRef: string }) => unit({ opexMonth: 4000, baseRent: 0, ...over });
  const july = (units: RentCheckUnit[], billedByUnit: Record<string, number>) =>
    rentCheck({ year: 2026, period: 7, scope: "month", units, billedByUnit, basis: "cam" });

  it("carries the term on every row, for the hover", () => {
    const r = rowFor(july([cam({ unitRef: "9510-406" })], { "9510-406": 4000 }), "9510-406");
    expect(r.leaseFrom).toBe("01/01/2020");
    expect(r.leaseTo).toBe("12/31/2030");
  });

  it("names the date on a lease that starts mid-window", () => {
    const r = rowFor(july([cam({ unitRef: "9510-414", leaseFrom: "07/15/2026" })], { "9510-414": 2000 }), "9510-414");
    expect(r.status).toBe("partial");
    expect(r.caveats.join(" ")).toContain("starts 07/15/2026");
  });

  it("names the date on a lease that ends mid-window", () => {
    const r = rowFor(july([cam({ unitRef: "9510-416", leaseTo: "07/20/2026" })], { "9510-416": 2600 }), "9510-416");
    expect(r.caveats.join(" ")).toContain("ends 07/20/2026");
  });

  it("calls out rent still posting after the lease ENDED", () => {
    // Its own finding, and the suite need not be flagged vacant for it.
    //
    // It used to also read "unexpected". It no longer does WHEN THE ROLL STILL
    // PRICES THE SUITE AND THE GL BILLS THAT RATE — that combination is a
    // holdover, the charge is correct, and calling a correct charge a variance
    // is what put 1100's August $3,733 out. The call-out is the point; the
    // variance was the error.
    const r = rowFor(july([cam({ unitRef: "9510-418", tenant: "Gone Inc", leaseTo: "05/31/2026" })], { "9510-418": 4000 }), "9510-418");
    expect(r.status).toBe("ok");
    expect(r.variance).toBe(0);
    expect(r.caveats.join(" ")).toContain("lease ended 05/31/2026");
    expect(r.caveats.join(" ")).toMatch(/holding over/i);
  });

  it("still reads unexpected when the roll has stopped pricing the suite", () => {
    // The case the rule above must not swallow: lease over, roll carries no
    // rate, and a charge is still posting. That is a charge to chase.
    const r = rowFor(july([cam({ unitRef: "9510-419", tenant: "Gone Inc", leaseTo: "05/31/2026", opexMonth: 0 })], { "9510-419": 4000 }), "9510-419");
    expect(r.status).toBe("unexpected");
    expect(r.caveats.join(" ")).toMatch(/should have stopped/i);
  });

  it("does not call a not-yet-started lease a missed bill", () => {
    const r = rowFor(july([cam({ unitRef: "9510-420", leaseFrom: "10/01/2026" })], {}), "9510-420");
    expect(r.status).toBe("idle");
    expect(r.caveats.join(" ")).toContain("does not start until 10/01/2026");
  });

  it("keeps the vacant-suite caveat for a suite with no expiry to blame", () => {
    const r = rowFor(july([cam({ unitRef: "9510-422", tenant: null, isVacant: true })], { "9510-422": 900 }), "9510-422");
    expect(r.caveats.join(" ")).toContain("shows this suite vacant");
  });
});

describe("a holdover the rent roll still prices is expected, not unexpected", () => {
  // 1100 Parkwood, August 2026. Shear Sensation's lease ran to 3/31/2026; the
  // August rent roll still prices the suite at $1,732.55 and the GL billed
  // exactly that. It read "UNEXPECTED $1,733" and put the property's Rental
  // income $3,733 out — a month that ties to the cent, reported as a failure.
  const shear = (over: Partial<RentCheckUnit> = {}) => unit({
    unitRef: "1100-34", tenant: "Shear Sensation", sqft: 1934,
    baseRent: 1732.55, leaseFrom: "05/01/1994", leaseTo: "03/31/2026", ...over,
  });
  const aug = (u: RentCheckUnit, billed: number) =>
    rowFor(rentCheck({ year: 2026, period: 8, scope: "month", units: [u], billedByUnit: { "1100-34": billed } }), "1100-34");

  it("ties when the GL bills the roll's rate", () => {
    const r = aug(shear(), 1732.55);
    expect(r.expected).toBeCloseTo(1732.55, 2);
    expect(r.variance).toBeCloseTo(0, 2);
    expect(r.status).toBe("ok");
  });

  it("says the lease needs papering, not that the billing is wrong", () => {
    const c = aug(shear(), 1732.55).caveats.join(" ");
    expect(c).toMatch(/holding over/i);
    expect(c).not.toMatch(/should have stopped/i);
  });

  it("is NOT treated as a proration — the roll's rate is the whole month", () => {
    expect(aug(shear(), 1732.55).caveats.join(" ")).not.toMatch(/prorated/i);
  });

  it("a VACANT suite is still owed nothing, however the dates read", () => {
    const r = aug(shear({ isVacant: true }), 1732.55);
    expect(r.expected).toBe(0);
    expect(r.variance).toBeCloseTo(1732.55, 2);
  });

  it("NOTHING BILLED means the tenant left and the roll is stale", () => {
    // The false positive in the other direction: a priced row alone must never
    // manufacture a bill that was never owed.
    const r = aug(shear(), 0);
    expect(r.expected).toBe(0);
    expect(r.caveats.join(" ")).not.toMatch(/holding over/i);
  });
});

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { chargeAmount, chargeMonth, canonicalUnit, missingProperties, parseInPlaceRevenue } from "./inPlaceRevenue";

describe("the two things that go wrong on this import", () => {
  it("reads an amount Skyline pasted as TEXT", () => {
    // "Convert Charge Amounts in column G to number once pasted" — the note in
    // the 2026 workbook. A text amount that silently sums to zero is the bug.
    expect(chargeAmount(11458.33)).toBe(11458.33);
    expect(chargeAmount("11458.33")).toBe(11458.33);
    expect(chargeAmount(" $11,458.33 ")).toBe(11458.33);
    expect(chargeAmount("(500.00)")).toBe(-500);
  });

  it("returns null for an amount it cannot read, so the row is REPORTED not zeroed", () => {
    expect(chargeAmount("n/a")).toBeNull();
    expect(chargeAmount("")).toBeNull();
    expect(chargeAmount(null)).toBeNull();
  });

  it("names the properties the export left out", () => {
    // The 2026 sheet's note said "Missing 1100 and 1500". Computed, not typed.
    const imported = ["2300", "4500", "5600", "7010", "7200", "7300", "8200", "9510"];
    const expected = ["1100", "1500", "2300", "4500", "5600", "7010", "7200", "7300", "8200", "9510"];
    expect(missingProperties(imported, expected)).toEqual(["1100", "1500"]);
  });
});

describe("reading a row", () => {
  it("takes the Month column, falling back to the charge date", () => {
    expect(chargeMonth(7, "07/01/2026")).toBe(7);
    expect(chargeMonth(null, "07/01/2026")).toBe(7);
    expect(chargeMonth("", "12/01/2026")).toBe(12);
    expect(chargeMonth(null, "nonsense")).toBeNull();
  });

  it("strips Skyline's -CU charge suffix so a unit matches the rest of the app", () => {
    expect(canonicalUnit("2300-1817-CU")).toBe("2300-1817");
    expect(canonicalUnit("2300-1817")).toBe("2300-1817");
  });
});

const FIXTURE = "/root/.claude/uploads/19896df1-1028-5d0d-bf4b-87a01774483b/3abfbc93-Shopping_Centers_-_2026_Monthly_Operating_Budget.xlsx";

describe.runIf(existsSync(FIXTURE))("against the real 2026 workbook", () => {
  // Read in beforeAll, NOT in the describe body: vitest still runs a skipped
  // describe's body to collect its tests, so a top-level read crashed the
  // whole file on every machine without the workbook — the skip never helped.
  let res: ReturnType<typeof parseInPlaceRevenue>;
  beforeAll(() => { res = parseInPlaceRevenue(readFileSync(FIXTURE)); });

  it("reads every readable charge row", () => {
    expect(res.charges.length).toBe(617);
  });

  it("REPORTS the tenant whose rent is blank rather than counting it as zero", () => {
    // Rite Aid at Parkwood (7010-12311) has no charge amount in ANY of the
    // twelve months. Zeroing it silently would put a leased anchor space into
    // the budget at nil and nothing would say so; 629 rows in, 617 readable,
    // and the twelve that are not are named.
    expect(res.skipped).toHaveLength(12);
    for (const s of res.skipped) expect(s.reason).toContain("not a number");
    expect(res.charges.some((c) => c.unitRef === "7010-12311")).toBe(false);
  });

  it("finds the eight centres the export carried", () => {
    expect(res.properties).toEqual(["2300", "4500", "5600", "7010", "7200", "7300", "8200", "9510"]);
  });

  it("confirms the note in the margin: 1100 and 1500 are missing", () => {
    const SC = ["1100", "1500", "2300", "4500", "5600", "7010", "7200", "7300", "8200", "9510"];
    expect(missingProperties(res.properties, SC)).toEqual(["1100", "1500"]);
  });

  it("carries only scheduled rent, on the rental income account", () => {
    expect(res.chargeCodes).toEqual(["RNT"]);
    expect(res.glAccounts).toEqual(["4230-8501"]);
  });

  it("projects a STEP the rent roll cannot know — M&T Bank at 2300", () => {
    // 11,458.33/mo through June, 11,458.08 from July: the mid-year change that
    // is exactly why this is an import and not derived from the rent roll.
    const mt = res.charges.filter((c) => c.unitRef === "2300-1817").sort((a, b) => a.month - b.month);
    expect(mt).toHaveLength(12);
    expect(mt[0].amount).toBeCloseTo(11458.33, 2);
    expect(mt[11].amount).toBeCloseTo(11458.08, 2);
  });

  it("totals each property by month", () => {
    const p = res.byProperty["2300"];
    expect(p.months).toHaveLength(12);
    expect(Math.round(p.months.reduce((s, n) => s + n, 0))).toBe(Math.round(p.total));
    expect(p.units).toBeGreaterThan(0);
  });
});

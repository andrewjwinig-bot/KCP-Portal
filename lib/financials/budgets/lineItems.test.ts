import { describe, expect, it } from "vitest";
import { seedBuckets, resolveBuckets, priorLineFor } from "./lineItems";
import { bucketsFor } from "./lineBuckets";

const m = (v: number) => new Array(12).fill(v);
const L = (label: string, months: number[], subLines?: any[], extra: any = {}) =>
  ({ glAccount: null, subCategory: null, label, months, total: months.reduce((a, b) => a + b, 0), totalPsf: null, input: null, notes: null, isSubtotal: false, subLines, ...extra });

// 2300's 2026 Building Maintenance, as the workbook carries it.
const bm = L("Building Maintenance", m(0), [
  L("Building Maint.-Contractual", m(0), [L("Sprinkler Inspection", [750, 0, 0, 750, 0, 0, 750, 0, 0, 750, 0, 0]), L("Backflow Inspections", [0, 0, 0, 0, 0, 0, 0, 0, 2000, 0, 0, 0])]),
  L("Building Maint.-Recurring", m(0), [L("Fire Extinguisher Service", [0, 0, 0, 0, 0, 0, 0, 0, 400, 0, 0, 0]), L("Misc Expenses", m(200), undefined, { notes: "Includes biweekly Drain Cleaning" })]),
  L("Building Maint.-Big Projects", [0, 0, 0, 25000, 0, 0, 0, 0, 0, 0, 0, 0]),
]);

describe("seedBuckets", () => {
  const set = bucketsFor("reimbursable-expense", "Building Maintenance")!;
  const seeds = seedBuckets(set, bm)!;
  it("carries contracts and recurring items forward +3%, month by month", () => {
    const c = seeds.find((b) => b.name === "Contractual")!;
    expect(c.items.map((i) => i.name)).toEqual(["Sprinkler Inspection", "Backflow Inspections"]);
    expect(c.items[0].seed[0]).toBe(773);          // 750 × 1.03
    expect(c.items[1].seed[8]).toBe(2060);
    expect(seeds.find((b) => b.name === "Recurring")!.items[1].note).toBe("Includes biweekly Drain Cleaning");
  });
  it("starts Big Projects at $0 but keeps last year's figure for reference", () => {
    const big = seeds.find((b) => b.name === "Big Projects")!;
    expect(big.seed!.every((v) => v === 0)).toBe(true);
    expect(big.prior[3]).toBe(25000);
  });
  it("rolls items up to buckets and lays typed months over the seed", () => {
    const r = resolveBuckets("Reimbursable Expenses", "Building Maintenance", seeds, {
      "Reimbursable Expenses::Building Maintenance#Contractual/Sprinkler Inspection": { months: [900, null, null, null, null, null, null, null, null, null, null, null] },
      "Reimbursable Expenses::Building Maintenance#Big Projects": { months: [null, null, null, null, null, 40000, null, null, null, null, null, null] },
    });
    const c = r.find((b) => b.name === "Contractual")!;
    expect(c.items[0].months[0]).toBe(900);
    expect(c.months[0]).toBe(900);
    expect(c.typed?.[0]).toBe(true);
    expect(r.find((b) => b.name === "Big Projects")!.months[5]).toBe(40000);
  });
  it("returns null when last year's line has no breakdown", () => {
    expect(seedBuckets(set, L("Building Maintenance", m(100)))).toBeNull();
  });
});

describe("insurance", () => {
  const ins = L("Insurance", m(0), [L("General Liability", m(1700)), L("Umbrella", m(1500)), L("Insurance - Liability", m(3200), undefined, { isSubtotal: true }), L("Property", m(800))]);
  it("files policies under Liability / Property / Other", () => {
    const seeds = seedBuckets(bucketsFor("reimbursable-expense", "Insurance")!, ins)!;
    expect(seeds.find((b) => b.name === "Liability")!.items.map((i) => i.name)).toEqual(["General Liability", "Umbrella"]);
    const p = seeds.find((b) => b.name === "Property")!;
    expect(p.items).toEqual([]);
    expect(p.seed![0]).toBe(824);
  });
});

describe("priorLineFor", () => {
  it("matches section + label", () => {
    const prior: any = { sections: [{ name: "Non-Reimbursable Expenses", lines: [L("Building Maintenance", m(1))] }, { name: "Reimbursable Expenses", lines: [bm] }] };
    expect(priorLineFor(prior, "Reimbursable Expenses", "Building Maintenance")).toBe(bm);
  });
});

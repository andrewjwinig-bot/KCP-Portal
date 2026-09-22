import { describe, it, expect } from "vitest";
import { expenseInputKindOf, spreadLike, resolveKind, splitAcrossLines, defaultMonths } from "./expenseInputs";

const sum = (a: number[]) => a.reduce((s, n) => s + n, 0);

describe("expenseInputKindOf", () => {
  it("finds the three keyed lines in an expense section", () => {
    expect(expenseInputKindOf("reimbursable-expense", "Real Estate Taxes")).toBe("ret");
    expect(expenseInputKindOf("reimbursable-expense", "Insurance")).toBe("insurance");
    expect(expenseInputKindOf("reimbursable-expense", "Building Maintenance")).toBe("building-maintenance");
  });

  it("leaves the tenants' RECOVERY lines alone — same names, revenue side", () => {
    expect(expenseInputKindOf("reimbursement", "Real Estate Taxes")).toBeNull();
    expect(expenseInputKindOf("reimbursement", "Insurance")).toBeNull();
  });

  it("does not take the other maintenance lines", () => {
    expect(expenseInputKindOf("reimbursable-expense", "Parking Lot Maintenance")).toBeNull();
    expect(expenseInputKindOf("reimbursable-expense", "Maintenance Salaries")).toBeNull();
  });
});

describe("spreadLike", () => {
  it("keeps a lump where it lands (a premium paid in March stays in March)", () => {
    const pattern = [0, 0, 12000, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    expect(spreadLike(13500, pattern)).toEqual([0, 0, 13500, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("keeps a monthly bill monthly, and adds back to the annual exactly", () => {
    const months = spreadLike(10001, new Array(12).fill(800));
    expect(sum(months)).toBe(10001);
    expect(Math.max(...months) - Math.min(...months)).toBeLessThanOrEqual(2);
  });

  it("spreads evenly when nothing posted", () => {
    const months = spreadLike(1200, new Array(12).fill(0));
    expect(months).toEqual(new Array(12).fill(100));
  });
});

describe("resolveKind", () => {
  const basis = [0, 0, 0, 0, 6000, 0, 0, 0, 0, 0, 6000, 0]; // taxes twice a year

  it("defaults taxes to this year + 3%, in the months they post", () => {
    const r = resolveKind("ret", basis, 5, null);
    expect(r.entered).toBe(false);
    expect(r.months[4]).toBe(6180);
    expect(r.months[10]).toBe(6180);
    expect(sum(r.months)).toBe(12360);
  });

  it("takes Drew's annual override, spread the same way", () => {
    const r = resolveKind("ret", basis, 5, { annual: 14000 });
    expect(r.entered).toBe(true);
    expect(r.months[4]).toBe(7000);
    expect(r.months[10]).toBe(7000);
  });

  it("insurance grows with the book until the premium is keyed", () => {
    expect(resolveKind("insurance", new Array(12).fill(1000), 4, null).months[0]).toBe(1040);
  });

  it("maintenance takes Greg's twelve months as keyed", () => {
    const months = [900, 900, 900, 1200, 1200, 1200, 900, 900, 900, 900, 900, 900];
    expect(resolveKind("building-maintenance", new Array(12).fill(800), 3, { months }).months).toEqual(months);
  });

  it("ignores a malformed input rather than zeroing the line", () => {
    const r = resolveKind("building-maintenance", new Array(12).fill(800), 3, { months: [1, 2] });
    expect(r.entered).toBe(false);
    expect(r.months).toEqual(defaultMonths("building-maintenance", new Array(12).fill(800), 3));
  });
});

describe("splitAcrossLines", () => {
  it("one line takes it all", () => {
    expect(splitAcrossLines([100, 200, ...new Array(10).fill(0)], [[1]])[0][1]).toBe(200);
  });

  it("two lines keep their split and still sum to the keyed figure", () => {
    const kind = new Array(12).fill(1000);
    const [a, b] = splitAcrossLines(kind, [new Array(12).fill(300), new Array(12).fill(100)]);
    expect(a[0]).toBe(750);
    expect(b[0]).toBe(250);
    for (let m = 0; m < 12; m++) expect(a[m] + b[m]).toBe(1000);
  });
});

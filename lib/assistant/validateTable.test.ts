import { describe, it, expect } from "vitest";
import { validateTable } from "./validateTable";

const base = {
  title: "Salaries vs NOI",
  columns: [
    { key: "property", label: "Property", format: "text" },
    { key: "amt", label: "Salaries", format: "money" },
    { key: "noi", label: "NOI", format: "money" },
    { key: "pct", label: "% of NOI", format: "percent", ratioOf: { numerator: "amt", denominator: "noi" } },
  ],
  rows: [{ property: "4500", amt: 90000, noi: 600000, pct: 15 }],
};

describe("validateTable", () => {
  it("accepts a well-formed table and keeps the ratio reference", () => {
    const t = validateTable(base)!;
    expect(t.columns).toHaveLength(4);
    expect(t.columns[3].ratioOf).toEqual({ numerator: "amt", denominator: "noi" });
    expect(t.rows[0]).toEqual({ property: "4500", amt: 90000, noi: 600000, pct: 15 });
  });

  it("DROPS a ratio naming a column that doesn't exist", () => {
    // A formula pointing at an arbitrary cell is worse than no formula: the
    // total row would compute over the wrong column and look authoritative.
    const t = validateTable({ ...base, columns: [...base.columns.slice(0, 3), { key: "pct", label: "%", format: "percent", ratioOf: { numerator: "nope", denominator: "noi" } }] })!;
    expect(t.columns[3].ratioOf).toBeUndefined();
  });

  it("drops a ratio over text columns, or over one column twice", () => {
    const textRatio = validateTable({ ...base, columns: [...base.columns.slice(0, 3), { key: "pct", label: "%", format: "percent", ratioOf: { numerator: "property", denominator: "noi" } }] })!;
    expect(textRatio.columns[3].ratioOf).toBeUndefined();
    const same = validateTable({ ...base, columns: [...base.columns.slice(0, 3), { key: "pct", label: "%", format: "percent", ratioOf: { numerator: "noi", denominator: "noi" } }] })!;
    expect(same.columns[3].ratioOf).toBeUndefined();
  });

  it("keeps a null cell null — never coerced to zero", () => {
    // build_dataset returns null for "no line matched". Zero would say the
    // property spends nothing, which is the opposite claim.
    const t = validateTable({ ...base, rows: [{ property: "9200", amt: null, noi: 100, pct: null }] })!;
    expect(t.rows[0].amt).toBeNull();
    expect(t.rows[0].pct).toBeNull();
  });

  it("recovers a number that arrived as a formatted string", () => {
    const t = validateTable({ ...base, rows: [{ property: "4500", amt: "$90,000", noi: "600000", pct: "15" }] })!;
    expect(t.rows[0].amt).toBe(90000);
    expect(t.rows[0].noi).toBe(600000);
  });

  it("drops a duplicate column key, which would shadow the first", () => {
    const t = validateTable({ ...base, columns: [...base.columns, { key: "amt", label: "Again", format: "money" }] })!;
    expect(t.columns.filter((c) => c.key === "amt")).toHaveLength(1);
  });

  it("rejects a table with no rows or fewer than two columns", () => {
    expect(validateTable({ ...base, rows: [] })).toBeNull();
    expect(validateTable({ ...base, columns: base.columns.slice(0, 1) })).toBeNull();
    expect(validateTable(null)).toBeNull();
    expect(validateTable("nope")).toBeNull();
  });

  it("caps rows, columns and notes so one answer cannot flood the panel", () => {
    const many = validateTable({
      ...base,
      rows: Array.from({ length: 500 }, (_, i) => ({ property: `p${i}`, amt: i, noi: 1, pct: 1 })),
      notes: Array.from({ length: 30 }, (_, i) => `note ${i}`),
    })!;
    expect(many.rows).toHaveLength(300);
    expect(many.notes).toHaveLength(8);
  });

  it("falls back to a usable title and labels", () => {
    const t = validateTable({ ...base, title: "", columns: [{ key: "a", label: "" }, { key: "b", label: "B" }] })!;
    expect(t.title).toBe("Table");
    expect(t.columns[0].label).toBe("a");
    expect(t.columns[0].format).toBe("text");
  });
});

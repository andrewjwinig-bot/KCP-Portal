import { describe, it, expect } from "vitest";
import { ownerStatementData, portfolioStatementData, resolvedEquity } from "./statementData";
import { entityValue } from "./entityValues";

describe("statementData assembler", () => {
  const noOv = {};
  const noEst = { values: {} };

  it("owner year-end value = % × seed equity when no overrides", () => {
    const { rows } = ownerStatementData("Joan Sohn", noOv, noEst);
    const cwd = rows.find((r) => r.code === "CWD");
    expect(cwd).toBeTruthy();
    expect(Math.round(cwd!.yearEnd ?? 0)).toBe(14191174); // Joan's 33.3333% × Cherrywood equity
  });

  it("an equity override flows into the owner's year-end value", () => {
    const seedEq = entityValue("2300")!.equityValue!; // Brookwood
    const withOv = { "2300": { equityValue: 12_000_000 } };
    const base = ownerStatementData("Joan Sohn", noOv, noEst).rows.find((r) => r.code === "2300")!;
    const over = ownerStatementData("Joan Sohn", withOv, noEst).rows.find((r) => r.code === "2300")!;
    const ratio = 12_000_000 / seedEq;
    expect(Math.round(over.yearEnd ?? 0)).toBe(Math.round((base.yearEnd ?? 0) * ratio));
  });

  it("estimate overlay drives the estimated column; year-end unaffected", () => {
    const est = { values: { "2300": 20_000_000 } };
    const r = ownerStatementData("Joan Sohn", noOv, est).rows.find((x) => x.code === "2300")!;
    expect(r.estimated).toBeGreaterThan(r.yearEnd ?? 0);
  });

  it("portfolio totals equal the sum of resolved equity", () => {
    const { rows, totals } = portfolioStatementData(noOv, noEst);
    const manual = rows.reduce((s, r) => s + (r.yearEnd ?? 0), 0);
    expect(Math.round(totals.yearEnd)).toBe(Math.round(manual));
  });

  it("resolvedEquity prefers the override", () => {
    expect(resolvedEquity("2300", { "2300": { equityValue: 5 } })).toBe(5);
    expect(resolvedEquity("2300", {})).toBe(entityValue("2300")!.equityValue);
  });
});

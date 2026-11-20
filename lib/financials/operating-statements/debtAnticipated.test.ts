import { describe, it, expect } from "vitest";
import { computeStatement } from "./compute";
import { markMissingDebt, anticipatedSplit } from "./debtFlag";
import { marksPeriodUnposted } from "./flagRules";
import type { StatementMapping } from "./types";

const mapping: StatementMapping = {
  propertyCode: "TEST",
  entityName: "Test LP",
  sections: [
    { name: "Revenues", role: "revenue", lines: [{ label: "Rental income", mask: "4230-*" }] },
    { name: "Debt Service", role: "debt-service", lines: [
      { label: "Interest", mask: "9210-*" },
      { label: "Mortgage Amortization", mask: "2720-*" },
    ] },
  ],
};

describe("debt scheduled but not posted is filled in as anticipated", () => {
  it("splits interest / principal onto their lines and carries them into cash flow, still marked not posted", async () => {
    const st = computeStatement({ mapping, propertyName: "Test", year: 2026, period: 9, gl: [{ account: "4230-8501", periodActual: -10000, ytdActual: -90000 }] });
    expect(st.rollups.cashFlowAfterDebtService.periodActual).toBe(10000);
    const r = await markMissingDebt(st, "TEST", "TEST", 2026, 9, { TEST: 3000 }, undefined, { TEST: { payment: 3000, interest: 2100, principal: 900 } });
    expect(r.missing).toBe(true);
    const [interest, amort] = st.sections[1].lines;
    expect([interest.periodActual, amort.periodActual]).toEqual([2100, 900]);
    expect(interest.ytdActual).toBe(2100);
    expect(st.sections[1].subtotal.periodActual).toBe(3000);
    expect(st.rollups.totalDebtService.periodActual).toBe(3000);
    expect(st.rollups.cashFlowAfterDebtService.periodActual).toBe(7000);
    expect(interest.expectedMissing?.anticipated).toBe(2100);
    expect(marksPeriodUnposted(interest.expectedMissing, interest.periodActual, null)).toBe(true);
  });

  it("leaves a dismissed line at $0 and puts the whole payment on a lone line", async () => {
    expect(anticipatedSplit([{ label: "Debt Service" }], { payment: 3000, interest: 2100, principal: 900 })).toEqual([3000]);
    const st = computeStatement({ mapping, propertyName: "Test", year: 2026, period: 9, gl: [] });
    await markMissingDebt(st, "TEST", "TEST", 2026, 9, { TEST: 3000 }, (_s, l) => l === "Interest", { TEST: { payment: 3000, interest: 2100, principal: 900 } });
    expect(st.sections[1].lines[0].periodActual).toBe(0);
    expect(st.sections[1].lines[0].expectedMissing).toBeFalsy();
    expect(st.sections[1].lines[1].periodActual).toBe(900);
  });

  it("does nothing once debt service posts", async () => {
    const st = computeStatement({ mapping, propertyName: "Test", year: 2026, period: 9, gl: [{ account: "9210-8501", periodActual: 2100, ytdActual: 18900 }] });
    const r = await markMissingDebt(st, "TEST", "TEST", 2026, 9, { TEST: 3000 }, undefined, { TEST: { payment: 3000, interest: 2100, principal: 900 } });
    expect(r.missing).toBe(false);
    expect(st.sections[1].lines[1].periodActual).toBe(0);
  });
});

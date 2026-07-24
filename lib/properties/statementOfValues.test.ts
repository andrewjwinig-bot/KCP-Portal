import { describe, it, expect } from "vitest";
import { ENTITY_VALUES, entityValue, totalEquityValue } from "./entityValues";
import {
  BENEFICIARY_STAKES,
  beneficiaryNames,
  statementForBeneficiary,
  beneficiaryTotalValue,
} from "./beneficiaries";

describe("statement of values — entity snapshot", () => {
  it("has the 28 seeded entities incl. WHIT / CWD / LAND", () => {
    expect(ENTITY_VALUES.length).toBe(28);
    for (const code of ["WHIT", "CWD", "LAND", "3600", "5610"]) {
      expect(entityValue(code)).toBeTruthy();
    }
  });

  it("LAND carries the TKCo total with no debt", () => {
    const land = entityValue("LAND")!;
    expect(land.equityValue).toBe(13297220);
    expect(land.debtBalance).toBe(0);
  });

  it("portfolio equity totals the reconciled ~$112.1M", () => {
    expect(Math.round(totalEquityValue())).toBe(112141554);
  });
});

describe("beneficiary ownership map", () => {
  it("has 47 distinct beneficiaries and 378 stakes", () => {
    expect(BENEFICIARY_STAKES.length).toBe(378);
    // 47, not 48: the workbook's phantom "John Sohn" folds into Joan Sohn.
    expect(beneficiaryNames().length).toBe(47);
  });

  it("every entity's beneficiary shares sum to ~100%", () => {
    const byEntity = new Map<string, number>();
    for (const s of BENEFICIARY_STAKES) {
      byEntity.set(s.entity, (byEntity.get(s.entity) ?? 0) + s.effPct);
    }
    for (const [entity, total] of byEntity) {
      expect(Math.abs(total - 1), `entity ${entity} totals ${total}`).toBeLessThan(0.005);
    }
  });

  it("no separate John Sohn — the 7300 typo folds into Joan Sohn", () => {
    const names = beneficiaryNames().map((n) => n.toLowerCase());
    expect(names).not.toContain("john sohn");
    const revere = statementForBeneficiary("Joan Sohn").find((l) => l.entity === "7300");
    expect(revere).toBeTruthy();
    expect(revere!.pct).toBeCloseTo(0.3748, 4);
  });

  it("sum of every beneficiary's value equals mapped entity equity (no leakage)", () => {
    const benTotal = beneficiaryNames().reduce((s, n) => s + beneficiaryTotalValue(n), 0);
    // Only entities that appear in the beneficiary map redistribute their equity.
    // 0300 (Airport Interplex Two) has equity in the snapshot but no beneficiary
    // rows in the source workbook, so its equity is legitimately unclaimed.
    const mappedEntities = new Set(BENEFICIARY_STAKES.map((s) => s.entity));
    const mappedEquity = ENTITY_VALUES.filter((e) => mappedEntities.has(e.entity)).reduce(
      (s, e) => s + (e.equityValue ?? 0),
      0,
    );
    expect(mappedEntities.has("0300")).toBe(false); // documents the gap
    expect(Math.abs(benTotal - mappedEquity)).toBeLessThan(500);
  });

  it("Alison's Cherrywood share ties to the workbook (3.7037% × $42.57M)", () => {
    const cwd = statementForBeneficiary("Alison Korman Feldman").find((l) => l.entity === "CWD");
    expect(cwd).toBeTruthy();
    expect(Math.round(cwd!.value)).toBe(1576797);
  });
});

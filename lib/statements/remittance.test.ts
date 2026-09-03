import { describe, expect, it } from "vitest";
import { isPayingInFull, makeReference, resolveSelection } from "./remittance";
import type { StatementCharge, TenantStatement } from "./types";

const charge = (description: string, amount: number, dateISO: string | null = "2026-09-01"): StatementCharge =>
  ({ dateISO, description, amount, category: "rent" });

const statement = (charges: StatementCharge[]): TenantStatement => ({
  unitRef: "1100-34", skylineUnitRef: "1100-34-CU", propertyCode: "1100", suite: "34",
  tenantName: "Shear Sensation", address: [], charges,
  reportedBalance: charges.reduce((a, c) => a + c.amount, 0),
  chargeTotal: charges.reduce((a, c) => a + c.amount, 0), tiesOut: true,
});

describe("resolveSelection", () => {
  const charges = [charge("Monthly Rent", 1732.55), charge("2026 CAM Estimate", 1117), charge("U & O", 251)];
  const st = statement(charges);

  it("sums the selected charges server-side", () => {
    const r = resolveSelection(st, charges, [0, 2]);
    expect(r.ok).toBe(true);
    expect(r.amount).toBe(1983.55);
    expect(r.paying!.map((l) => l.description)).toEqual(["Monthly Rent", "U & O"]);
    // What they're NOT paying is recorded too — that's where the call comes from.
    expect(r.holding!.map((l) => l.description)).toEqual(["2026 CAM Estimate"]);
  });

  it("ignores any total the client sends — the figure is derived here", () => {
    // There is no path to influence the amount other than which charges exist.
    const r = resolveSelection(st, charges, [1]);
    expect(r.amount).toBe(1117);
  });

  it("rejects a charge that isn't on the statement", () => {
    expect(resolveSelection(st, charges, [0, 9]).ok).toBe(false);
    expect(resolveSelection(st, charges, [-1]).ok).toBe(false);
    expect(resolveSelection(st, charges, ["0"]).ok).toBe(true); // numeric strings are fine
  });

  it("rejects the same charge selected twice", () => {
    const r = resolveSelection(st, charges, [0, 0]);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/twice/);
  });

  it("rejects an empty selection", () => {
    expect(resolveSelection(st, charges, []).ok).toBe(false);
    expect(resolveSelection(st, charges, null).ok).toBe(false);
  });

  it("rejects a selection that doesn't add up to a payment", () => {
    const withCredit = [charge("Open Credits", -500, null)];
    const r = resolveSelection(statement(withCredit), withCredit, [0]);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/add up/);
  });

  it("rejects a stale page whose charges no longer exist on the statement", () => {
    // The tenant's browser holds last week's list; the statement has moved on.
    const stale = [charge("Monthly Rent", 9999)];
    const r = resolveSelection(st, stale, [0]);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/updated/);
  });
});

describe("makeReference", () => {
  it("avoids characters that are misread in handwriting", () => {
    let seq = 0;
    const all = Array.from({ length: 200 }, () => makeReference(() => (seq++ % 32) / 32));
    expect(all.join("")).not.toMatch(/[ILOU]/);
    expect(all[0]).toHaveLength(6);
  });
});

describe("isPayingInFull", () => {
  it("treats a cent of rounding as paying in full", () => {
    expect(isPayingInFull({ amount: 16559.58, statementTotal: 16559.58 })).toBe(true);
    expect(isPayingInFull({ amount: 16559.575, statementTotal: 16559.58 })).toBe(true);
    expect(isPayingInFull({ amount: 6200, statementTotal: 16559.58 })).toBe(false);
  });
});

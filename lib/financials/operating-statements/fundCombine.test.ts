import { describe, it, expect } from "vitest";
import { combineFundGls, rollupMonths, memberTransactionsOutsideRollup, shellOwnGl } from "./fundCombine";
import type { StoredGl } from "./statementStore";

const m = (vals: Record<number, number>) => Array.from({ length: 12 }, (_, i) => vals[i + 1] ?? 0);
const gl = (key: string, monthly: Record<string, number[]>, extra: Partial<StoredGl> = {}): StoredGl =>
  ({ id: key, key, propertyCode: key, year: 2026, uploadedAt: "", fileName: "", maxPeriodInFile: 9, monthly, ...extra }) as StoredGl;

describe("combineFundGls", () => {
  // PJV3, 10/2026: the September fund upload was the roll-up of its buildings,
  // and summing it with them doubled the rent.
  const b1 = gl("3610", { "4230-0000": m({ 8: -100, 9: -100 }), "6220-8502": m({ 9: 20 }) });
  const b2 = gl("3620", { "4230-0000": m({ 8: -50, 9: -50 }) });
  const shell = gl("PJV3", {
    "4230-0000": m({ 9: -150 }),          // September is the consolidated export
    "6220-8502": m({ 9: 20 }),
    "9210-0000": m({ 8: 30, 9: 30 }),     // the fund's own interest, every month
  });

  it("takes a roll-up month from the shell alone and sums the rest", () => {
    const r = combineFundGls(shell, [b1, b2])!;
    expect(r.monthly["4230-0000"][8]).toBe(-150);   // September — not -300
    expect(r.monthly["4230-0000"][7]).toBe(-150);   // August — the buildings
    expect(r.monthly["6220-8502"][8]).toBe(20);
    expect(r.monthly["9210-0000"][7]).toBe(30);     // a cash-only shell month still adds
    expect(rollupMonths(shell).map((x, i) => (x ? i + 1 : 0)).filter(Boolean)).toEqual([9]);
  });

  it("sums shell and buildings when the shell carries no rent", () => {
    const cashOnly = gl("PJV3", { "9210-0000": m({ 9: 30 }) });
    expect(combineFundGls(cashOnly, [b1, b2])!.monthly["4230-0000"][8]).toBe(-150);
  });

  it("drops the members' detail for a roll-up month", () => {
    const tx = { "4230-0000": [{ month: 8, date: null, description: "a", ref: "", amount: -100 }, { month: 9, date: null, description: "b", ref: "", amount: -100 }] };
    expect(memberTransactionsOutsideRollup(tx, rollupMonths(shell))["4230-0000"].map((t) => t.month)).toEqual([8]);
  });
});

describe("shellOwnGl", () => {
  it("is the roll-up less the buildings, so buildings + shell counts each building once", () => {
    const b1 = gl("3610", { "4230-0000": m({ 9: -100 }) });
    const b2 = gl("3620", { "4230-0000": m({ 9: -50 }) });
    const shell = gl("PJV3", { "4230-0000": m({ 9: -150 }), "9210-0000": m({ 9: 30 }) });
    const own = shellOwnGl(shell, [b1, b2]);
    expect(own.monthly["4230-0000"][8]).toBe(0);
    expect(own.monthly["9210-0000"][8]).toBe(30);
    const cashOnly = gl("PJV3", { "9210-0000": m({ 9: 30 }) });
    expect(shellOwnGl(cashOnly, [b1, b2])).toBe(cashOnly);
  });
});

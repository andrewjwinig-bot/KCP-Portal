import { describe, it, expect } from "vitest";
import { claimMapping, accountMatchesMask } from "./mask";
import { assembleGls, actualsThrough } from "./glAssemble";
import mappings from "@/data/operating-statements/line-mappings.json";

const m = (vals: Record<number, number>) => Array.from({ length: 12 }, (_, i) => vals[i + 1] ?? 0);

describe("an account lands on ONE line across the whole mapping", () => {
  it("8990-8599 is Capital's, not G&A's as well", () => {
    const claims = claimMapping([["8*-*"], ["6990-8599,8990-8599"]], ["8990-8599", "8310-8501"]);
    expect(claims).toEqual([[["8310-8501"]], [["8990-8599"]]]);
  });
  it("no real account is claimed twice in any mapping", () => {
    const probe = ["8990-8599", "6510-8501", "6510-8502", "9210-0000", "8000-0000", "8000-9900", "4230-0000", "6410-8502", "6220-8503"];
    for (const [key, mp] of Object.entries(mappings as Record<string, { sections: { lines: { mask: string }[] }[] }>)) {
      const claims = claimMapping(mp.sections.map((s) => s.lines.map((l) => l.mask)), probe);
      const seen = claims.flat(2);
      expect(new Set(seen).size, key).toBe(seen.length);
      // every account any line matches is still claimed by one
      for (const a of probe) {
        const matched = mp.sections.some((s) => s.lines.some((l) => accountMatchesMask(l.mask, a)));
        expect(seen.includes(a), `${key} ${a}`).toBe(matched);
      }
    }
  });
});

describe("assembleGls", () => {
  const base = { key: "X", year: 2026, maxPeriodInFile: 9 };
  it("a revised file is the whole truth for its months — an account it dropped is zero", () => {
    const old = { ...base, uploadedAt: "1", monthly: { "6220-8502": m({ 9: 5000 }), "4230-0000": m({ 1: -1, 9: -100 }) } };
    const rev = { ...base, uploadedAt: "2", monthly: { "1440-0000": m({ 9: 5000 }), "4230-0000": m({ 1: -1, 9: -100 }) } };
    const a = assembleGls([old, rev] as never[])!;
    expect(a.monthly["6220-8502"][8]).toBe(0);
    expect(a.monthly["1440-0000"][8]).toBe(5000);
  });
  it("a quiet property's actuals run to its last active month, not its first quiet one", () => {
    expect(actualsThrough({ maxPeriodInFile: 1, monthly: { "6410-0000": m({ 1: 10, 9: 20 }) } })).toBe(9);
  });
});

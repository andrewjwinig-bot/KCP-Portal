import { describe, it, expect, vi } from "vitest";

// A tiny ALLOC_PCT: 9301 sums to 100% (0.6 + 0.4); 9302 sums to only 80%.
vi.mock("@/lib/properties/data", () => ({
  ALLOC_PCT: {
    A: { "9301": 0.6, "9302": 0.5, "9303": 0 },
    B: { "9301": 0.4, "9302": 0.3, "9303": 0 },
  },
}));

import { reconcileAllocation } from "./tieOut";
import type { GLParseResult } from "./glParser";

function gl(accts: { code: string; suffix: "9301" | "9302" | "9303"; net: number }[]): GLParseResult {
  const accountTotals = new Map();
  for (const a of accts) accountTotals.set(a.code, { accountCode: a.code, accountName: a.code, accountSuffix: a.suffix, netTotal: a.net });
  return { periodText: "", periodEndDate: "", statementMonth: "2026-07", transactions: [], accountTotals };
}

describe("reconcileAllocation", () => {
  it("ties when the suffix shares sum to 100%", () => {
    const t = reconcileAllocation(gl([{ code: "8220-9301", suffix: "9301", net: 1000 }]));
    expect(t.sourceTotal).toBe(1000);
    expect(t.allocatedTotal).toBe(1000);
    expect(t.unallocated).toBe(0);
    expect(t.ties).toBe(true);
  });

  it("flags a suffix whose shares don't sum to 100% and reports the leak", () => {
    const t = reconcileAllocation(gl([{ code: "8330-9302", suffix: "9302", net: 1000 }]));
    const s = t.bySuffix.find((x) => x.suffix === "9302")!;
    expect(s.pctSum).toBeCloseTo(0.8);
    expect(s.ok).toBe(false);
    expect(s.leak).toBe(200);       // 20% of 1000 never lands anywhere
    expect(t.unallocated).toBe(200);
    expect(t.ties).toBe(false);
  });

  it("mixes a good and a leaking suffix", () => {
    const t = reconcileAllocation(gl([
      { code: "8220-9301", suffix: "9301", net: 1000 }, // ties
      { code: "8330-9302", suffix: "9302", net: 500 },  // 80% → leaks 100
    ]));
    expect(t.sourceTotal).toBe(1500);
    expect(t.unallocated).toBe(100);
    expect(t.ties).toBe(false);
  });
});

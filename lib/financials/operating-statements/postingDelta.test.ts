import { describe, it, expect } from "vitest";
import { applyPostingDeltas, applyPostingTransactions, type PostingDelta } from "./postingDeltaStore";
import type { StoredGl } from "./statementStore";
import type { GlTransaction } from "./glParser";

const m = (obj: Record<string, Partial<Record<number, number>>>): Record<string, number[]> => {
  const out: Record<string, number[]> = {};
  for (const [a, byMonth] of Object.entries(obj)) {
    out[a] = new Array(12).fill(0);
    for (const [mo, v] of Object.entries(byMonth)) out[a][Number(mo) - 1] = v as number;
  }
  return out;
};

function baseGl(coverageEnd: number, monthly: Record<string, number[]>): StoredGl {
  return {
    id: "gl-x", key: "1100", propertyCode: "1100", year: 2026, uploadedAt: "2026-01-01T00:00:00Z",
    fileName: "x", maxPeriodInFile: coverageEnd, monthly, coverageEnd, coverageStartMonth: 1,
  };
}

function delta(monthly: Record<string, number[]>, months: number[], txns: Record<string, GlTransaction[]> = {}): PostingDelta {
  return { id: "pd-1", key: "1100", year: 2026, importedAt: "2026-07-15T00:00:00Z", postThru: "07/15/2026", sourceName: "post.xls", monthly, transactions: txns, months };
}

describe("applyPostingDeltas — full GL wins", () => {
  it("no full GL: every delta month applies from zero", () => {
    const d = delta(m({ "6330-8501": { 6: 1329.2 } }), [6]);
    const r = applyPostingDeltas(null, [d], "1100", 2026)!;
    expect(r.monthly["6330-8501"][5]).toBe(1329.2);
    expect(r.coverageEnd).toBe(6);
    expect(r.maxPeriodInFile).toBe(6);
  });

  it("delta in an uncovered month (6) applies on top of a GL covering 1–5", () => {
    const base = baseGl(5, m({ "6330-8501": { 3: 500 } }));
    const d = delta(m({ "6330-8501": { 6: 1329.2 } }), [6]);
    const r = applyPostingDeltas(base, [d], "1100", 2026)!;
    expect(r.monthly["6330-8501"][2]).toBe(500);   // Mar (from GL) untouched
    expect(r.monthly["6330-8501"][5]).toBe(1329.2); // Jun (from posting) added
    expect(r.coverageEnd).toBe(6);
  });

  it("a delta in a covered month (3) is held — full GL wins, no double-count", () => {
    const base = baseGl(6, m({ "6330-8501": { 3: 500 } }));
    const d = delta(m({ "6330-8501": { 3: 1329.2 } }), [3]);
    const r = applyPostingDeltas(base, [d], "1100", 2026)!;
    expect(r.monthly["6330-8501"][2]).toBe(500); // unchanged — March already covered
    expect(r).toBe(base);                         // nothing applied → same object
  });

  it("a December full-year GL supersedes every delta it now covers", () => {
    const base = baseGl(12, m({ "6330-8501": { 6: 1329.2 } })); // full year, includes June
    const d = delta(m({ "6330-8501": { 6: 1329.2 } }), [6]);
    const r = applyPostingDeltas(base, [d], "1100", 2026)!;
    expect(r.monthly["6330-8501"][5]).toBe(1329.2); // not doubled
    expect(r).toBe(base);
  });

  it("adds a brand-new account only present in the posting", () => {
    const base = baseGl(5, m({ "6330-8501": { 3: 500 } }));
    const d = delta(m({ "6220-8501": { 7: 800 } }), [7]);
    const r = applyPostingDeltas(base, [d], "1100", 2026)!;
    expect(r.monthly["6220-8501"][6]).toBe(800);
    expect(r.coverageEnd).toBe(7);
  });
});

describe("applyPostingTransactions", () => {
  const tx = (month: number, amount: number): GlTransaction => ({ month, date: `0${month}/15/2026`, description: "x", ref: "1", amount });
  it("keeps only posting txns beyond the covered month", () => {
    const base = { "6330-8501": [tx(3, 500)] };
    const d = delta(m({ "6330-8501": { 3: 100, 6: 1329.2 } }), [3, 6], { "6330-8501": [tx(3, 100), tx(6, 1329.2)] });
    const out = applyPostingTransactions(base, [d], 5); // covered through May
    const months = out["6330-8501"].map((t) => t.month).sort();
    expect(months).toEqual([3, 6]); // base Mar kept; posting Jun added; posting Mar (covered) dropped
  });
});

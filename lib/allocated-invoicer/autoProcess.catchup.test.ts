import { describe, it, expect } from "vitest";
import { computeMonths } from "./autoProcess";
import { emptyLedger, finalizeMonth, applyRecognized, recognizedFor, type CarryoverLedger } from "./carryover";
import type { GLParseResult } from "./glParser";

// Minimal 2000 G&A GL fixture: account totals only (single-month path needs no
// transactions). Each entry allocates by its suffix via ALLOC_PCT.
function gl(month: string, entries: { code: string; suffix: "9301" | "9302" | "9303"; net: number }[]): GLParseResult {
  const accountTotals = new Map();
  for (const e of entries) {
    const full = `${e.code}-${e.suffix}`;
    accountTotals.set(full, { accountCode: full, accountName: `Acct ${e.code}`, accountSuffix: e.suffix, netTotal: e.net });
  }
  return { statementMonth: month, periodText: month, periodEndDate: `${month}-28`, transactions: [], accountTotals };
}

// Simulate a successful send: finalize each fresh month + persist recognized
// baselines (what sendAllocation does on commit).
function commit(ledger: CarryoverLedger, res: Extract<ReturnType<typeof computeMonths>, { months: unknown }>): CarryoverLedger {
  let led = ledger;
  for (const m of res.months) led = finalizeMonth(led, m.statementMonth, m.expenses, "NOW").ledger;
  led = applyRecognized(led, res.recognizedUpdates, "NOW");
  return led;
}

describe("computeMonths — recognized delta + catch-up", () => {
  it("processes a fresh month normally (no catch-up) and records a recognized baseline", () => {
    const res = computeMonths(gl("2025-07", [{ code: "8220", suffix: "9301", net: 10000 }]), emptyLedger());
    if ("error" in res) throw new Error(res.error);
    expect(res.months).toHaveLength(1);
    expect(res.catchup).toBeNull();
    // 4080 gets 23.8% of $10,000 = $2,380 → billed.
    const p4080 = res.months[0].byProperty.find((b) => b.code === "4080");
    expect(p4080?.amount).toBeCloseTo(2380, 2);

    const led = commit(emptyLedger(), res);
    expect(recognizedFor(led, "4080", "8220", "2025-07")).toBeCloseTo(2380, 2);
  });

  it("is idempotent — re-importing the identical GL yields no fresh month and no catch-up", () => {
    const g = gl("2025-07", [{ code: "8220", suffix: "9301", net: 10000 }]);
    const led = commit(emptyLedger(), computeMonths(g, emptyLedger()) as any);
    const res2 = computeMonths(g, led);
    if ("error" in res2) throw new Error(res2.error);
    expect(res2.months).toHaveLength(0);
    expect(res2.catchup).toBeNull();
    expect(res2.skipped).toContain("2025-07");
  });

  it("catches up a late charge to an already-finalized month as a supplemental", () => {
    const led = commit(emptyLedger(), computeMonths(gl("2025-07", [{ code: "8220", suffix: "9301", net: 10000 }]), emptyLedger()) as any);
    // A $500 late charge posts to July → re-export shows $10,500.
    const res = computeMonths(gl("2025-07", [{ code: "8220", suffix: "9301", net: 10500 }]), led);
    if ("error" in res) throw new Error(res.error);
    expect(res.months).toHaveLength(0); // July is committed, not re-billed in full
    expect(res.catchup).not.toBeNull();
    // 4080's delta = 23.8% of $500 = $119 → over $100 → billed on the supplemental.
    const c4080 = res.catchup!.byProperty.find((b) => b.code === "4080");
    expect(c4080?.amount).toBeCloseTo(119, 2);
    expect(res.catchup!.supplemental).toBe(true);
    expect(res.catchup!.sourceMonths).toContain("2025-07");
  });

  it("holds a small late delta under $100 instead of billing it", () => {
    const led = commit(emptyLedger(), computeMonths(gl("2025-07", [{ code: "8220", suffix: "9301", net: 10000 }]), emptyLedger()) as any);
    // A tiny $50 late charge → 40A0's share = 2.81% of $50 = $1.41 (held), and
    // 4080's share = 23.8% of $50 = $11.90 (held) — all under $100.
    const res = computeMonths(gl("2025-07", [{ code: "8220", suffix: "9301", net: 10050 }]), led);
    if ("error" in res) throw new Error(res.error);
    // Nothing crosses $100 → the catch-up bills nobody this pass.
    expect(res.catchup?.byProperty ?? []).toHaveLength(0);
  });

  it("backfills a LEGACY committed month (no baseline) without re-billing it", () => {
    // A ledger that committed July before this feature: committedPeriods has it,
    // but recognizedMonths does NOT.
    const legacy: CarryoverLedger = { balances: {}, committedPeriods: ["2025-07"], recognized: {}, recognizedMonths: [], updatedAt: "" };
    const res = computeMonths(gl("2025-07", [{ code: "8220", suffix: "9301", net: 10000 }]), legacy);
    if ("error" in res) throw new Error(res.error);
    expect(res.months).toHaveLength(0);
    expect(res.catchup).toBeNull(); // no retro re-bill
    expect(res.skipped).toContain("2025-07");
    // Applying the recognized updates baselines July → a later real late charge is caught.
    const led = applyRecognized(legacy, res.recognizedUpdates, "NOW");
    expect(recognizedFor(led, "4080", "8220", "2025-07")).toBeCloseTo(2380, 2);
    const res2 = computeMonths(gl("2025-07", [{ code: "8220", suffix: "9301", net: 11000 }]), led);
    if ("error" in res2) throw new Error(res2.error);
    expect(res2.catchup).not.toBeNull(); // now a real delta is caught up
  });
});

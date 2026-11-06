import { describe, it, expect } from "vitest";
import { emptyLedger, finalizeMonth } from "./carryover";
import { applyCarryoverSeeds, CARRYOVER_SEEDS } from "./carryoverSeed";

const NOW = "2026-07-17T00:00:00.000Z";
const NI_BUILDINGS = ["4050", "4060", "4070", "4080", "40A0", "40B0", "40C0"];

describe("carryover preload seeds", () => {
  it("preloads the $358.99 NI LLC batch across the 7 buildings, penny-exact", () => {
    const { ledger, changed } = applyCarryoverSeeds(emptyLedger(), NOW);
    expect(changed).toBe(true);

    // Only NI LLC buildings got balances.
    expect(Object.keys(ledger.balances).sort()).toEqual([...NI_BUILDINGS].sort());

    // Grand total across all held buildings ties to the batch total.
    const grand = Object.values(ledger.balances).reduce((a, c) => a + c.heldTotal, 0);
    expect(Math.round(grand * 100)).toBe(35899);

    // Each building holds one line per source charge (3), with originalAmount set.
    for (const b of NI_BUILDINGS) {
      const c = ledger.balances[b];
      expect(c.heldTx.length).toBe(3);
      expect(c.heldTx.every((t) => t.originalAmount && t.propertyId === b)).toBe(true);
      expect(c.heldTx.map((t) => t.category).sort()).toEqual(["BUILDING MAINT.", "EQUIPMENT (CAP)", "OFFICE SUPPLIES"]);
    }

    // The largest building (4080) carries the largest balance.
    const max = Math.max(...Object.values(ledger.balances).map((c) => c.heldTotal));
    expect(ledger.balances["4080"].heldTotal).toBe(max);
  });

  it("is idempotent — re-applying does not double-add", () => {
    const once = applyCarryoverSeeds(emptyLedger(), NOW).ledger;
    const twice = applyCarryoverSeeds(once, NOW);
    expect(twice.changed).toBe(false);
    const grand = Object.values(twice.ledger.balances).reduce((a, c) => a + c.heldTotal, 0);
    expect(Math.round(grand * 100)).toBe(35899);
    expect(twice.ledger.appliedSeeds).toEqual([CARRYOVER_SEEDS[0].id]);
  });

  it("finalizeMonth preserves appliedSeeds so the seed never re-applies", () => {
    const seeded = applyCarryoverSeeds(emptyLedger(), NOW).ledger;
    const { ledger: after } = finalizeMonth(seeded, "2026-07", [], NOW);
    expect(after.appliedSeeds).toEqual([CARRYOVER_SEEDS[0].id]);
    // Re-running the seed against the finalized ledger is a no-op.
    expect(applyCarryoverSeeds(after, NOW).changed).toBe(false);
  });

  it("splits so the largest building crosses $100 and the rest stay under", () => {
    const { ledger } = applyCarryoverSeeds(emptyLedger(), NOW);
    expect(ledger.balances["4080"].heldTotal).toBeGreaterThan(100); // ~$115.52 → bills next run
    for (const b of ["4050", "4060", "4070", "40A0", "40B0", "40C0"]) {
      expect(ledger.balances[b].heldTotal).toBeLessThan(100); // stay held
    }
  });
});

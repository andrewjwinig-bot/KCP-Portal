// One-time preloads injected into the credit-card carryover ("Held") ledger.
// Used to re-queue charges that were previously mis-billed to a FUND directly
// (before fund charges auto-split across the fund's buildings). Each charge is
// split across the fund's buildings by square footage (same basis as the coder)
// and held per building, so the next statement run picks them up allocated —
// billing a building once its accrued balance crosses the $100 threshold.
//
// Each seed applies EXACTLY ONCE, guarded by CarryoverLedger.appliedSeeds, so
// repeated page loads / finalizes never re-add it.

import { FUND_SF_ALLOC } from "@/lib/properties/data";
import type { CarryoverLedger, HeldTx, PropertyCarry } from "./carryover";

type SeedCharge = { date: string; description: string; category: string; amount: number };
type CarryoverSeed = {
  id: string;
  /** Fund portfolio code whose buildings the charges split across (FUND_SF_ALLOC key). */
  fundCode: string;
  /** Statement month (YYYY-MM) recorded as "held since" for the preloaded charges. */
  heldFromMonth: string;
  cardMember: string;
  charges: SeedCharge[];
};

// NI LLC (PNIPLX) charges from the July 2, 2026 batch that were billed to the
// fund directly. Re-held, split across the seven NI LLC buildings by SF, so the
// next run bills them per building. (category → GL account is derived downstream:
// BUILDING MAINT. → 6220-8502, EQUIPMENT (CAP) → 1450-0000, OFFICE SUPPLIES →
// 8930-8502.) Total = $358.99.
export const CARRYOVER_SEEDS: CarryoverSeed[] = [
  {
    id: "ni-llc-2026-07-batch-358_99",
    fundCode: "PNIPLX",
    heldFromMonth: "2026-06",
    cardMember: "Harry Feldman",
    charges: [
      { date: "2026-05-13", description: "LESLIES POOLMART", category: "BUILDING MAINT.", amount: 269.10 },
      { date: "2026-05-11", description: "AMAZON MARKETPLACE NA PA", category: "EQUIPMENT (CAP)", amount: 71.88 },
      { date: "2026-04-28", description: "AMAZON MARKETPLACE NA PA", category: "OFFICE SUPPLIES", amount: 18.01 },
    ],
  },
];

// Largest-remainder cents split — mirrors allocateCentsByPercents in the coder.
function splitCents(totalC: number, shares: Record<string, number>): Record<string, number> {
  const floors = Object.entries(shares).map(([k, p]) => {
    const e = totalC * p;
    return { k, c: Math.floor(e), f: e - Math.floor(e) };
  });
  let rem = totalC - floors.reduce((a, b) => a + b.c, 0);
  floors.sort((a, b) => b.f - a.f);
  for (let i = 0; i < floors.length && rem > 0; i++) { floors[i].c += 1; rem -= 1; }
  return Object.fromEntries(floors.map((x) => [x.k, x.c]));
}
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Apply any not-yet-applied carryover seeds. Pure: returns a new ledger plus
 * whether anything changed (so the store only persists when it did).
 */
export function applyCarryoverSeeds(ledger: CarryoverLedger, nowISO: string): { ledger: CarryoverLedger; changed: boolean } {
  const applied = new Set(ledger.appliedSeeds ?? []);
  const balances: Record<string, PropertyCarry> = { ...ledger.balances };
  let changed = false;

  for (const seed of CARRYOVER_SEEDS) {
    if (applied.has(seed.id)) continue;
    const shares = FUND_SF_ALLOC[seed.fundCode];
    if (!shares) continue;

    // Split each charge across the fund's buildings; collect per building.
    const perBuilding: Record<string, HeldTx[]> = {};
    for (const ch of seed.charges) {
      const split = splitCents(Math.round(ch.amount * 100), shares);
      for (const [propertyId, cts] of Object.entries(split)) {
        if (cts === 0) continue;
        (perBuilding[propertyId] ??= []).push({
          date: ch.date,
          cardMember: seed.cardMember,
          description: ch.description,
          codedDescription: ch.description,
          category: ch.category,
          propertyId,
          suite: "",
          amount: cts / 100,
          originalAmount: ch.amount,
          statementMonth: seed.heldFromMonth,
        });
      }
    }

    for (const [propertyId, txs] of Object.entries(perBuilding)) {
      const existing = balances[propertyId];
      const addTotal = txs.reduce((a, t) => a + t.amount, 0);
      balances[propertyId] = {
        propertyId,
        heldTotal: round2((existing?.heldTotal ?? 0) + addTotal),
        heldTx: [...(existing?.heldTx ?? []), ...txs],
        sinceMonth: existing?.sinceMonth || seed.heldFromMonth,
        updatedAt: nowISO,
      };
    }

    applied.add(seed.id);
    changed = true;
  }

  if (!changed) return { ledger, changed: false };
  return { ledger: { ...ledger, balances, appliedSeeds: [...applied], updatedAt: nowISO }, changed: true };
}

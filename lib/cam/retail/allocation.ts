// ─── MIXED-CENTER EXPENSE ALLOCATION — SINGLE SOURCE OF TRUTH ────────────────
// For centers that reconcile as two parts sharing one building (e.g. 7010
// Parkwood Shopping/Office Center: retail = 8502 accounts, office = 8503).
//
// Each operating-expense line is declared ONCE here. From this one list we
// derive, in lockstep:
//   • the retail expense pool   (retailPoolFor)
//   • the office expense pool   (officePoolFor)
//   • the allocation breakdown  (allocationFor — the "what's for what" table)
//
// To add / change an expense you edit a single line below; all three update
// automatically and the per-tenant tie-out tests stay the guardrail.
//
// A line is split one of two ways:
//   • SHARED cost split by %   → { full, retailPct }   (e.g. salaries 86/14)
//   • SEPARATELY-BOOKED lines  → { retail, office }     (already split across
//                                 GL accounts 8502 / 8503; office- or
//                                 retail-only is just a 0 on the other side)

import type { RetailExpensePool } from "./types";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** One declared expense line for a mixed center. */
export type SplitLine = {
  label: string;
  /** GL account shown in the retail pool schedule (cosmetic). */
  glRetail?: string;
  /** GL account shown in the office pool schedule (cosmetic). */
  glOffice?: string;
  // ── Either a shared cost split by % … ──
  full?: number;
  /** Percent of `full` allocated to retail (remainder → office). */
  retailPct?: number;
  // ── … or two explicit amounts (separately booked). ──
  retail?: number;
  office?: number;
};

export type MixedCenter = {
  propertyCode: string;
  name: string;
  reconYear: number;
  /** Operating-expense (CAM) lines. */
  cam: SplitLine[];
  insurance: SplitLine;
  realEstateTaxes: SplitLine;
};

/** Resolve a declared line to its retail / office dollar amounts. */
export function splitAmounts(l: SplitLine): { retail: number; office: number } {
  if (l.full != null && l.retailPct != null) {
    const retail = round2((l.full * l.retailPct) / 100);
    return { retail, office: round2(l.full - retail) };
  }
  return { retail: l.retail ?? 0, office: l.office ?? 0 };
}

// ─── Derivations ─────────────────────────────────────────────────────────────

function poolFor(mc: MixedCenter, side: "retail" | "office"): RetailExpensePool {
  const camLines = mc.cam
    .map((l) => ({ l, amt: splitAmounts(l)[side] }))
    .filter((x) => x.amt !== 0) // a side's 0 lines belong to the other part only
    .map((x) => ({
      glAccount: (side === "retail" ? x.l.glRetail : x.l.glOffice) ?? "—",
      label: x.l.label,
      amount: x.amt,
    }));
  return {
    propertyCode: mc.propertyCode,
    reconYear: mc.reconYear,
    camLines,
    insAmount: splitAmounts(mc.insurance)[side],
    retAmount: splitAmounts(mc.realEstateTaxes)[side],
  };
}

export const retailPoolFor = (mc: MixedCenter) => poolFor(mc, "retail");
export const officePoolFor = (mc: MixedCenter) => poolFor(mc, "office");

// ── Allocation breakdown (the at-a-glance "what's for what" table) ──
export type AllocationLine = { label: string; retail: number; office: number };
export type PropertyAllocation = {
  propertyCode: string;
  name: string;
  reconYear: number;
  cam: AllocationLine[];
  insurance: AllocationLine;
  realEstateTaxes: AllocationLine;
};

function allocationOf(mc: MixedCenter): PropertyAllocation {
  const line = (l: SplitLine): AllocationLine => ({ label: l.label, ...splitAmounts(l) });
  return {
    propertyCode: mc.propertyCode,
    name: mc.name,
    reconYear: mc.reconYear,
    cam: mc.cam.map(line),
    insurance: line(mc.insurance),
    realEstateTaxes: line(mc.realEstateTaxes),
  };
}

// ─── 7010 · Parkwood Shopping/Office Center (2025) ───────────────────────────
// Retail (8502) vs office (8503). Edit a line here and the retail pool, office
// pool, and breakdown all follow.
export const MIXED_7010: MixedCenter = {
  propertyCode: "7010",
  name: "Parkwood Shopping/Office Center",
  reconYear: 2025,
  cam: [
    { label: "Maintenance Salaries", glRetail: "6030-8502", glOffice: "6030-8502", full: 27960, retailPct: 86 },
    { label: "Electric (Common)",    glRetail: "6120-8502", glOffice: "6120-8503", retail: 7321, office: 966 },
    { label: "Water / Sewer",        glRetail: "6130-8502", glOffice: "6130-8503", retail: 0, office: 4198 },
    { label: "Building Maintenance", glRetail: "6220-8502", glOffice: "6220-8503", retail: 87239, office: 21956 },
    { label: "Parking Lot Cleaning", glRetail: "6330-8502", glOffice: "6330-8503", retail: 31810.32, office: 5816 },
    { label: "Security",             glRetail: "6350-8502", glOffice: "6350-8503", retail: 143149.50, office: 27267 },
    { label: "Parking Lot Maintenance", glRetail: "6360-8502", glOffice: "6360-8503", retail: 69256, office: 12507 },
    { label: "Snow Removal",         glRetail: "6370-8502", glOffice: "6370-8503", retail: 42844.20, office: 8160.80 },
    { label: "Trash Removal",        glOffice: "6270-8503", retail: 0, office: 6672.96 },
    { label: "Cleaning",             glOffice: "6250-8503", retail: 0, office: 21606.86 },
    { label: "Landscaping",          glRetail: "6380-8502", glOffice: "6380-8503", retail: 17347.68, office: 3304.31 },
    { label: "Liability Insurance",  retail: 37600.88, office: 6121.07 },
  ],
  insurance: { label: "Property Insurance", retail: 7869.41, office: 1281.07 },
  realEstateTaxes: { label: "Real Estate Taxes", retail: 141941.88, office: 22129 },
};

// Derived pools (imported by the 7010 seed files) + breakdown.
export const POOL_7010_RETAIL = retailPoolFor(MIXED_7010);
export const POOL_7010_OFFICE = officePoolFor(MIXED_7010);
export const ALLOCATION_7010 = allocationOf(MIXED_7010);

// Registry of mixed centers, keyed by property code.
const MIXED_CENTERS: Record<string, PropertyAllocation> = {
  [MIXED_7010.propertyCode]: ALLOCATION_7010,
};

/** Allocation breakdown for a property, or null when it isn't a mixed center. */
export function allocationFor(propertyCode: string): PropertyAllocation | null {
  return MIXED_CENTERS[propertyCode] ?? null;
}

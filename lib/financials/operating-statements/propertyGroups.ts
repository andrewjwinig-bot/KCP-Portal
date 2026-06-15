// Groups the Operating Statements / Reprojections property dropdown into
// <optgroup>s — the same fund/category buckets the Budgets page uses
// (Shopping Centers, Office, Residential, Other). Pure (no server-only deps)
// so both client pages can import it.

import { PROPERTY_DEFS } from "@/lib/properties/data";

export const STATEMENT_GROUP_ORDER = ["Shopping Centers", "Office", "Residential", "Other"] as const;
export type StatementGroup = typeof STATEMENT_GROUP_ORDER[number];

// Fund-level / rollup statement keys aren't individual properties in
// PROPERTY_DEFS, so map their codes to a group explicitly.
const FUND_GROUP: Record<string, StatementGroup> = {
  PJV3: "Office",     // Lincoln JV III (whole fund)
  PNIPLX: "Office",   // Neshaminy Interplex LLC (whole fund)
  PIIICO: "Office",   // Neshaminy III Condo Assoc
  PHOMES: "Residential", // Korman Homes (rollup)
};

/** Which dropdown group a statement property/fund belongs to. */
export function statementGroupFor(propertyCode: string): StatementGroup {
  const def = PROPERTY_DEFS.find((p) => p.id === propertyCode);
  if (def) {
    if (def.type === "Retail") return "Shopping Centers";
    if (def.type === "Office") return "Office";
    if (def.type === "Residential") return "Residential";
    return "Other"; // Misc (2010, 4900), Land (0800)
  }
  return FUND_GROUP[propertyCode] ?? "Other";
}

/** Bucket the available statements into ordered groups, each sorted by code. */
export function groupStatementOptions<T extends { propertyCode: string }>(
  items: T[],
): { label: StatementGroup; items: T[] }[] {
  const buckets = new Map<StatementGroup, T[]>();
  for (const it of items) {
    const g = statementGroupFor(it.propertyCode);
    if (!buckets.has(g)) buckets.set(g, []);
    buckets.get(g)!.push(it);
  }
  return STATEMENT_GROUP_ORDER
    .filter((g) => buckets.has(g))
    .map((g) => ({
      label: g,
      items: buckets.get(g)!.slice().sort((a, b) => a.propertyCode.localeCompare(b.propertyCode)),
    }));
}

// ── Rent-roll-style portfolio grouping ───────────────────────────────────────
// The same buckets /rentroll uses (JV III LLC, NI LLC, Shopping Centers, Korman
// Homes, The Office Works, then Other). Fund-level statement codes map to their
// venture: PJV3 + PIIICO (Neshaminy III Condo) → JV III; PNIPLX → NI LLC;
// PHOMES → Korman Homes. Used by the Flags to Investigate review so it reads the
// same way the rent roll does.

export const RENTROLL_GROUP_ORDER = [
  "JV III LLC", "NI LLC", "Shopping Centers", "Korman Homes", "The Office Works", "Other",
] as const;
export type RentRollGroup = typeof RENTROLL_GROUP_ORDER[number];

const RENTROLL_GROUPS: { label: RentRollGroup; codes: string[] }[] = [
  { label: "JV III LLC",       codes: ["3610", "3620", "3640", "PJV3", "PIIICO"] },
  { label: "NI LLC",           codes: ["4050", "4060", "4070", "4080", "40A0", "40B0", "40C0", "PNIPLX"] },
  { label: "Shopping Centers", codes: ["1100", "1500", "2300", "4500", "5600", "7010", "7200", "7300", "8200", "9200", "9510"] },
  { label: "Korman Homes",     codes: ["9800", "9820", "9840", "9860", "PHOMES"] },
  { label: "The Office Works", codes: ["4900"] },
];
const RENTROLL_GROUP_BY_CODE = new Map<string, RentRollGroup>();
for (const g of RENTROLL_GROUPS) for (const c of g.codes) RENTROLL_GROUP_BY_CODE.set(c.toUpperCase(), g.label);

/** Which rent-roll portfolio group a statement property/fund belongs to. */
export function rentRollGroupFor(propertyCode: string): RentRollGroup {
  return RENTROLL_GROUP_BY_CODE.get(propertyCode.toUpperCase()) ?? "Other";
}

/** Bucket items into the rent-roll group order, preserving each group's input
 *  order (callers sort within a group however they need). */
export function groupByRentRoll<T extends { propertyCode: string }>(
  items: T[],
): { label: RentRollGroup; items: T[] }[] {
  const buckets = new Map<RentRollGroup, T[]>();
  for (const it of items) {
    const g = rentRollGroupFor(it.propertyCode);
    if (!buckets.has(g)) buckets.set(g, []);
    buckets.get(g)!.push(it);
  }
  return RENTROLL_GROUP_ORDER
    .filter((g) => buckets.has(g))
    .map((g) => ({ label: g, items: buckets.get(g)! }));
}

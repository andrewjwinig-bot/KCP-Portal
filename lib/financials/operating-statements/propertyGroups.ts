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

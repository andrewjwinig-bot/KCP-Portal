// Portfolio BREAKDOWN for the assistant (owner: "give me the breakdown in % of
// revenue by property type (ex office retail residential) and it could not").
// The assistant could rank properties and roll up a BOOK (BP / SC / LIK /
// Other), but nothing grouped by property TYPE, so the question had no tool.
// This groups per-property figures by type, book or property and computes each
// group's total and its SHARE in code, so the model never divides by hand.
//
// Pure (no I/O); the agent route feeds it the per-property figures.

import { PROPERTY_DEFS } from "../properties/data";
import { groupOf, REPORT_GROUP_LABELS } from "../reports/monthly";

export type BreakdownMetric = "revenue" | "opex" | "noi" | "cash_flow";
export type BreakdownGroupBy = "property_type" | "book" | "property";

/** The management company. Its revenue is the management fees the properties
 *  pay it (and its expenses are largely billed back to them), so counting it
 *  beside the properties counts the same dollars twice. Left out unless asked. */
export const MANAGEMENT_CODES = new Set(["2000", "2010"]);

/** Statement keys that are not a PROPERTY_DEFS row. */
const TYPE_OVERRIDE: Record<string, string> = {
  PJV3: "Office", PNIPLX: "Office", PIIICO: "Office", CONDO: "Office",
  PHOMES: "Residential",
  // The Office Works is coworking space inside Building 5 — office space.
  "4900": "Office",
  "2000": "Management company", "2010": "Management company",
};

export function propertyTypeOf(code: string): string {
  const c = code.toUpperCase();
  if (TYPE_OVERRIDE[c]) return TYPE_OVERRIDE[c];
  const def = PROPERTY_DEFS.find((p) => p.id.toUpperCase() === c);
  if (!def) return "Other";
  return def.type === "Misc" ? "Other" : def.type;
}

/** The fund shells are the business parks' own entities. */
function bookOf(code: string): string {
  const c = code.toUpperCase();
  if (c === "PJV3" || c === "PNIPLX" || c === "PIIICO" || c === "CONDO") return REPORT_GROUP_LABELS.bp;
  return REPORT_GROUP_LABELS[groupOf(c)];
}

export type PropertyFigure = {
  property: string;
  name: string;
  revenue: number;
  opex: number;
  noi: number;
  cashFlow: number;
  throughPeriod: number;
};

export type BreakdownGroup = {
  group: string;
  value: number;
  /** Share of the total, in percent to one decimal. Null when the total is not positive. */
  sharePct: number | null;
  properties: number;
  members: { property: string; name: string; value: number }[];
};

export type BreakdownResult = {
  metric: BreakdownMetric;
  groupBy: BreakdownGroupBy;
  total: number;
  groups: BreakdownGroup[];
  excluded: string[];
  /** Different months posted across properties — the YTD figures aren't the same span. */
  periodsDiffer: boolean;
  throughPeriods: number[];
};

const valueOf = (f: PropertyFigure, m: BreakdownMetric) =>
  m === "revenue" ? f.revenue : m === "opex" ? f.opex : m === "noi" ? f.noi : f.cashFlow;

export function breakdown(
  figures: PropertyFigure[],
  opts: { metric: BreakdownMetric; groupBy: BreakdownGroupBy; includeManagement?: boolean },
): BreakdownResult {
  const excluded: string[] = [];
  const kept = figures.filter((f) => {
    if (!opts.includeManagement && MANAGEMENT_CODES.has(f.property.toUpperCase())) { excluded.push(f.property); return false; }
    return true;
  });
  const keyOf = (f: PropertyFigure) =>
    opts.groupBy === "property" ? f.property
      : opts.groupBy === "book" ? bookOf(f.property)
      : propertyTypeOf(f.property);
  const map = new Map<string, BreakdownGroup>();
  for (const f of kept) {
    const k = keyOf(f);
    const g = map.get(k) ?? { group: opts.groupBy === "property" ? `${f.property} ${f.name}` : k, value: 0, sharePct: null, properties: 0, members: [] };
    const v = Math.round(valueOf(f, opts.metric));
    g.value += v;
    g.properties += 1;
    g.members.push({ property: f.property, name: f.name, value: v });
    map.set(k, g);
  }
  const groups = [...map.values()];
  const total = groups.reduce((t, g) => t + g.value, 0);
  for (const g of groups) {
    g.sharePct = total > 0 ? Math.round((g.value / total) * 1000) / 10 : null;
    g.members.sort((a, b) => b.value - a.value);
  }
  groups.sort((a, b) => b.value - a.value);
  const periods = [...new Set(kept.map((f) => f.throughPeriod))].sort((a, b) => a - b);
  return { metric: opts.metric, groupBy: opts.groupBy, total, groups, excluded, periodsDiffer: periods.length > 1, throughPeriods: periods };
}

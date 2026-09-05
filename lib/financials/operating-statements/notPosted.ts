import "server-only";
import { availableStatements, getMapping } from "./mappingStore";
import { listFullGls } from "./statementStore";
import { assembleGls } from "./glAssemble";
import { summaryForPeriod } from "./glParser";
import { computeStatement } from "./compute";
import { resolvePropertyBudget, makeBudgetLookup } from "./budgetCrosswalk";
import { markMissingDebt } from "./debtFlag";
import { PROPERTY_DEFS } from "@/lib/properties/data";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export type NotPostedItem = {
  key: string;
  propertyCode: string;
  propertyName: string;
  section: string;
  line: string;
  type: "not-posted" | "missing-debt";
  expected: number;
  period: number;
  monthLabel: string;
};

export type NotPostedSummary = {
  year: number;
  asOf: string;
  items: NotPostedItem[];
  propertiesWithIssues: number;
};

function propertyName(key: string, fallback: string): string {
  return PROPERTY_DEFS.find((p) => p.id === key)?.name ?? fallback;
}

// Which "not posted" lines warrant an alert email. Routine monthly CAM lines
// (utilities, landscaping, repairs, snow, etc.) post every month, so a line
// briefly reading $0 is normal and emailing on it is just noise. We only alert
// on the big, easy-to-miss, often non-monthly postings: management fees,
// insurance, real estate taxes, and debt service. Extend the pattern to add
// more categories. (The dashboard / Review page still surfaces every line — this
// gate is only for the alert emails.)
export const SIGNIFICANT_NOT_POSTED = /manage(?:ment)?\s*fee|insurance|real\s*estate\s*tax|\br\.?e\.?\s*tax|property\s*tax|\btaxes?\b|debt|mortgage/i;

/** Is this a not-posted line worth an alert email (vs routine monthly CAM)? */
export function isSignificantNotPosted(item: Pick<NotPostedItem, "type" | "line" | "section">): boolean {
  if (item.type === "missing-debt") return true; // debt service is always significant
  return SIGNIFICANT_NOT_POSTED.test(item.line) || SIGNIFICANT_NOT_POSTED.test(item.section);
}

/** Narrow a not-posted list to the alert-worthy (significant) lines. */
export function significantNotPosted(items: NotPostedItem[]): NotPostedItem[] {
  return items.filter(isSignificantNotPosted);
}

/**
 * The lightweight "what isn't posted yet" scan across every property's LATEST
 * imported month — a budgeted line reading $0 all year, or debt the Debt Tracker
 * schedules but that isn't posted. Cheaper than the full Review sweep (one
 * compute per property, no per-month trend pass), so it's safe to run on the
 * dashboard, in the weekly email, and right after an import. `key` limits the
 * scan to one property (used by the on-import summary).
 */
export async function collectNotPosted(year: number, key?: string): Promise<NotPostedSummary> {
  const [mappings, fulls] = await Promise.all([availableStatements(), listFullGls()]);
  const targets = key ? mappings.filter((m) => m.key === key) : mappings;
  const items: NotPostedItem[] = [];
  const propsWith = new Set<string>();

  for (const m of targets) {
    const stored = assembleGls(fulls.filter((g) => g.key === m.key && g.year === year));
    if (!stored) continue;
    const mapping = await getMapping(m.key);
    if (!mapping) continue;
    const max = stored.maxPeriodInFile;
    const name = propertyName(m.key, m.entityName);
    const budget = await resolvePropertyBudget(m.propertyCode, year);
    const sameYearBudget = budget && !budget.fallback ? budget : null;
    const statement = computeStatement({
      mapping, propertyName: name, year, period: max,
      gl: summaryForPeriod(stored.monthly, max),
      budgetLookup: sameYearBudget ? makeBudgetLookup(sameYearBudget, max) : undefined,
    });
    await markMissingDebt(statement, m.key, m.propertyCode, year, max);
    for (const sec of statement.sections) {
      for (const l of sec.lines) {
        if (!l.expectedMissing) continue;
        items.push({
          key: m.key, propertyCode: m.propertyCode, propertyName: name,
          section: sec.name, line: l.label,
          type: l.expectedMissing.basis === "debt" ? "missing-debt" : "not-posted",
          expected: l.expectedMissing.expected, period: max, monthLabel: MONTHS[max - 1],
        });
        propsWith.add(m.key);
      }
    }
  }

  items.sort((a, b) => b.expected - a.expected);
  return { year, asOf: new Date().toISOString(), items, propertiesWithIssues: propsWith.size };
}

// Shared loader: compute a property's operating statement from the mapping +
// latest GL + budget crosswalk. Used by the download (Excel/PDF) routes.

import "server-only";
import { computeStatement } from "./compute";
import { summaryForPeriod } from "./glParser";
import { getMapping } from "./mappingStore";
import { assembledGlConsolidated, getNotesBundle, getDismissedFlags } from "./statementStore";
import { FUND_BUILDINGS } from "@/lib/financials/cash-analysis/funds";
import { resolvePropertyBudget, makeBudgetLookup } from "./budgetCrosswalk";
import { markMissingDebt } from "./debtFlag";
import { markPaidMonths } from "./paidMonth";
import type { PropertyStatement } from "./types";
import type { StatementMeta } from "./statementExport";
import { PROPERTY_DEFS } from "@/lib/properties/data";

export async function loadStatement(key: string, year: number, requestedPeriod?: number): Promise<{ statement: PropertyStatement; meta: StatementMeta; notes: Record<string, string> } | null> {
  const mapping = await getMapping(key);
  if (!mapping) return null;
  // A fund (PNIPLX, PJV3) has no P&L of its own — its shell holds only swept
  // cash — so it is its member buildings' GLs combined, exactly as the screen
  // builds it. Reading the shell alone exported a BLANK statement.
  const stored = await assembledGlConsolidated(key, year);
  if (!stored) return null;
  const period = Math.min(Math.max(1, requestedPeriod || stored.maxPeriodInFile), stored.maxPeriodInFile);
  const gl = summaryForPeriod(stored.monthly, period);
  const fundParts = FUND_BUILDINGS[key];
  const budget = await resolvePropertyBudget(fundParts ? [key, ...fundParts, mapping.propertyCode] : mapping.propertyCode, year);
  // Only line up a SAME-YEAR budget (matching the on-screen statement): a
  // nearest-year fallback would compare against the wrong year's plan and, worse,
  // drive the not-posted / paid-YTD signals off the wrong budget.
  const sameYearBudget = budget && !budget.fallback ? budget : null;
  const budgetLookup = sameYearBudget ? makeBudgetLookup(sameYearBudget, period) : undefined;
  const propertyName = PROPERTY_DEFS.find((p) => p.id === key)?.name ?? mapping.entityName;
  const statement = computeStatement({ mapping, propertyName, year, period, gl, budgetLookup });
  // Flag debt scheduled by the Debt Tracker but not posted — same as the screen.
  const dismissed = new Set(await getDismissedFlags(key, year, period).catch(() => [] as string[]));
  await markMissingDebt(statement, key, mapping.propertyCode, year, period, undefined, (sec, label) => dismissed.has(`${sec}::${label}`));
  // Record the month a paid-up-front line posted (for the export's "paid in Mar").
  markPaidMonths(statement, stored.monthly, period);
  const { notes } = await getNotesBundle(key, year, period);
  return { statement, meta: { propertyCode: mapping.propertyCode, propertyName, year, period, budgetYear: sameYearBudget?.budgetYear ?? null }, notes };
}

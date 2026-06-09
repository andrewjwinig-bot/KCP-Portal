// Shared loader: compute a property's operating statement from the mapping +
// latest GL + budget crosswalk. Used by the download (Excel/PDF) routes.

import "server-only";
import { computeStatement } from "./compute";
import { summaryForPeriod } from "./glParser";
import { getMapping } from "./mappingStore";
import { latestGl } from "./statementStore";
import { resolvePropertyBudget, makeBudgetLookup } from "./budgetCrosswalk";
import type { PropertyStatement } from "./types";
import type { StatementMeta } from "./statementExport";
import { PROPERTY_DEFS } from "@/lib/properties/data";

export async function loadStatement(key: string, year: number, requestedPeriod?: number): Promise<{ statement: PropertyStatement; meta: StatementMeta } | null> {
  const mapping = await getMapping(key);
  if (!mapping) return null;
  const stored = await latestGl(key, year);
  if (!stored) return null;
  const period = Math.min(Math.max(1, requestedPeriod || stored.maxPeriodInFile), stored.maxPeriodInFile);
  const gl = summaryForPeriod(stored.monthly, period);
  const budget = await resolvePropertyBudget(mapping.propertyCode, year);
  const budgetLookup = budget ? makeBudgetLookup(budget, period) : undefined;
  const propertyName = PROPERTY_DEFS.find((p) => p.id === key)?.name ?? mapping.entityName;
  const statement = computeStatement({ mapping, propertyName, year, period, gl, budgetLookup });
  return { statement, meta: { propertyCode: mapping.propertyCode, propertyName, year, period, budgetYear: budget?.budgetYear ?? null } };
}

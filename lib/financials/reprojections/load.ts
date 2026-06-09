// Shared loader: assemble a property's reprojection from the line mapping +
// latest GL + budget. Used by the download (Excel/PDF) routes.

import "server-only";
import { reproject, type Reprojection } from "./compute";
import type { ReprojMeta } from "./reprojExport";
import { getMapping } from "@/lib/financials/operating-statements/mappingStore";
import { resolvePropertyBudget } from "@/lib/financials/operating-statements/budgetCrosswalk";
import { latestGl } from "@/lib/financials/operating-statements/statementStore";
import { PROPERTY_DEFS } from "@/lib/properties/data";

export async function loadReprojection(key: string, year: number): Promise<{ reprojection: Reprojection; meta: ReprojMeta } | null> {
  const mapping = await getMapping(key);
  if (!mapping) return null;
  const stored = await latestGl(key, year);
  const budget = await resolvePropertyBudget(mapping.propertyCode, year);
  const propertyName = PROPERTY_DEFS.find((p) => p.id === key)?.name ?? mapping.entityName;
  const reprojection = reproject({
    mapping,
    propertyName,
    year,
    glMonthly: stored?.monthly ?? {},
    budgetLines: (budget?.lines ?? []).map((l) => ({ glAccount: l.glAccount, months: l.months })),
    actualThroughMonth: stored?.maxPeriodInFile ?? 0,
  });
  return { reprojection, meta: { propertyCode: mapping.propertyCode, propertyName, year, budgetYear: budget?.budgetYear ?? null } };
}

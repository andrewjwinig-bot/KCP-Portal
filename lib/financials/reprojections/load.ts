// Shared loader: assemble a property's reprojection from the line mapping +
// latest GL + budget. Used by the download (Excel/PDF) routes.

import "server-only";
import { reproject, type Reprojection } from "./compute";
import type { ReprojMeta } from "./reprojExport";
import { getMapping } from "@/lib/financials/operating-statements/mappingStore";
import { resolvePropertyBudget } from "@/lib/financials/operating-statements/budgetCrosswalk";
import { assembledGlConsolidated, getNotesBundle } from "@/lib/financials/operating-statements/statementStore";
import { glKeysFor } from "@/lib/financials/cash-analysis/funds";
import { PROPERTY_DEFS } from "@/lib/properties/data";

export async function loadReprojection(key: string, year: number): Promise<{ reprojection: Reprojection; meta: ReprojMeta; notes: Record<string, string> } | null> {
  const mapping = await getMapping(key);
  if (!mapping) return null;
  // Fund keys consolidate their member buildings (GL + budget) — a fund has no
  // GL/budget of its own.
  const stored = await assembledGlConsolidated(key, year);
  const budget = await resolvePropertyBudget([...glKeysFor(key), mapping.propertyCode], year);
  const propertyName = PROPERTY_DEFS.find((p) => p.id === key)?.name ?? mapping.entityName;
  const reprojection = reproject({
    mapping,
    propertyName,
    year,
    glMonthly: stored?.monthly ?? {},
    budgetLines: (budget?.lines ?? []).map((l) => ({ glAccount: l.glAccount, months: l.months })),
    actualThroughMonth: stored?.maxPeriodInFile ?? 0,
  });
  const { notes } = await getNotesBundle(key, year, stored?.maxPeriodInFile || 1);
  return { reprojection, meta: { propertyCode: mapping.propertyCode, propertyName, year, budgetYear: budget?.budgetYear ?? null }, notes };
}

// Load a property's T-12: the two calendar-year GLs the window spans, stitched
// month by month and run through the Reprojections engine with every month an
// actual and no budget — so the section ladder, rollups and sub-lines match the
// statement, the reprojection and the budget exactly.

import "server-only";
import { reproject, type Reprojection } from "@/lib/financials/reprojections/compute";
import { getMapping } from "@/lib/financials/operating-statements/mappingStore";
import { assembledGlConsolidated } from "@/lib/financials/operating-statements/statementStore";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import { t12Window, t12Labels, t12Span, stitchMonthly, missingMonths, type T12Month } from "./window";

export type T12 = {
  reprojection: Reprojection;
  propertyCode: string;
  propertyName: string;
  end: T12Month;
  labels: string[];
  span: string;
  /** Months in the window no uploaded GL covers — read as $0 until imported. */
  missing: string[];
};

export async function loadT12(key: string, endYear: number, endMonth: number): Promise<T12 | null> {
  const mapping = await getMapping(key);
  if (!mapping) return null;
  const win = t12Window(endYear, endMonth);
  const years = [...new Set(win.map((m) => m.year))];
  const gls = await Promise.all(years.map((y) => assembledGlConsolidated(key, y).catch(() => null)));
  const byYear: Record<number, Record<string, number[]> | null> = {};
  const coverage: Record<number, number> = {};
  const names: Record<string, string> = {};
  years.forEach((y, i) => {
    byYear[y] = gls[i]?.monthly ?? null;
    coverage[y] = gls[i]?.maxPeriodInFile ?? 0;
    Object.assign(names, gls[i]?.names ?? {});
  });
  const propertyName = PROPERTY_DEFS.find((p) => p.id === key)?.name ?? mapping.entityName;
  const reprojection = reproject({
    mapping, propertyName, year: endYear,
    glMonthly: stitchMonthly(win, byYear),
    budgetLines: [],
    actualThroughMonth: 12,
  });
  reprojection.accountNames = names;
  reprojection.unbudgetedAccounts = reprojection.unbudgetedAccounts.map((u) => ({ ...u, name: names[u.account] ?? null }));
  const labels = t12Labels(win);
  return {
    reprojection, propertyCode: mapping.propertyCode, propertyName,
    end: { year: endYear, month: endMonth }, labels, span: t12Span(win),
    missing: missingMonths(win, coverage).map((m) => labels[win.findIndex((w) => w.year === m.year && w.month === m.month)]),
  };
}

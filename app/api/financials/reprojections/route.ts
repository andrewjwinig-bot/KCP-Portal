import { NextResponse } from "next/server";
import { reproject } from "@/lib/financials/reprojections/compute";
import { availableStatements, getMapping } from "@/lib/financials/operating-statements/mappingStore";
import { resolvePropertyBudget } from "@/lib/financials/operating-statements/budgetCrosswalk";
import { assembledGl, listGls, mergeAccountNames, getNotesBundle } from "@/lib/financials/operating-statements/statementStore";
import { PROPERTY_DEFS } from "@/lib/properties/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function propertyName(key: string, fallback: string): string {
  return PROPERTY_DEFS.find((p) => p.id === key)?.name ?? fallback;
}

// GET — without params: the picker payload (mapped properties + years with a
// GL). With ?key&year: the blended full-year reprojection (actuals for the
// months we have, budget for the rest).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  const year = Number(url.searchParams.get("year"));

  const [mappings, gls] = await Promise.all([availableStatements(), listGls()]);
  const yearsByKey = new Map<string, Set<number>>();
  for (const g of gls) {
    if (!yearsByKey.has(g.key)) yearsByKey.set(g.key, new Set());
    yearsByKey.get(g.key)!.add(g.year);
  }
  const available = mappings.map((m) => ({
    key: m.key,
    propertyCode: m.propertyCode,
    entityName: m.entityName,
    name: propertyName(m.key, m.entityName),
    years: [...(yearsByKey.get(m.key) ?? [])].sort((a, b) => b - a),
  }));

  if (!key || !year) return NextResponse.json({ available });

  const mapping = await getMapping(key);
  if (!mapping) return NextResponse.json({ available, error: "No mapping for that property" }, { status: 404 });

  const stored = await assembledGl(key, year);
  // Budget is the backbone of the reprojection; fall back to the nearest year.
  const budget = await resolvePropertyBudget(mapping.propertyCode, year);
  const budgetLines = (budget?.lines ?? []).map((l) => ({ glAccount: l.glAccount, months: l.months }));

  const reprojection = reproject({
    mapping,
    propertyName: propertyName(key, mapping.entityName),
    year,
    glMonthly: stored?.monthly ?? {},
    budgetLines,
    actualThroughMonth: stored?.maxPeriodInFile ?? 0,
  });
  // Label the unbudgeted accounts with their GL account name, falling back to
  // names captured on any other property's GL (account codes are shared).
  const acctNames = mergeAccountNames(gls);
  reprojection.unbudgetedAccounts = reprojection.unbudgetedAccounts.map((u) => ({
    ...u,
    name: stored?.names?.[u.account] ?? acctNames[u.account] ?? null,
  }));

  // Operating-statement notes share the same `<section>::<line label>` key, so
  // the variance explanations written there surface directly on the matching
  // reprojection line (default a sourceless note to AI, as the statement does).
  const { notes, sources } = await getNotesBundle(key, year);
  const noteSources: Record<string, "user" | "ai"> = {};
  for (const lk of Object.keys(notes)) noteSources[lk] = sources[lk] ?? "ai";

  return NextResponse.json({
    available,
    reprojection,
    budgetYear: budget?.budgetYear ?? null,
    budgetFallback: budget?.fallback ?? false,
    hasGl: !!stored,
    hasBudget: !!budget,
    uploadedAt: stored?.uploadedAt ?? null,
    notes,
    noteSources,
  });
}

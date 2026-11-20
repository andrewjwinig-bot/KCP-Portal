// OPEN A/R for the assistant (owner: "make it as smart and intuitive as it
// can"). "Who's behind on rent", "how much past due at Gray's Ferry", "A/R by
// property type" had no tool — the figures live in the Skyline laser statements
// imported on Monthly Statements. This reads the newest imported month and
// totals it in code, using the SAME `summarize` the portal, the PDF and the
// roster use, so the assistant can never disagree with the page.
//
// Pure (no I/O); the agent route feeds it the newest StatementRun.

import type { StatementRun } from "../statements/types";
import { summarize } from "../statements/summary";
import { propertyTypeOf, bookOf, MANAGEMENT_CODES } from "./breakdown";
import { PROPERTY_DEFS } from "../properties/data";

export type ArGroupBy = "property" | "property_type" | "book";

const r2 = (n: number) => Math.round(n * 100) / 100;

export function openArSummary(run: StatementRun, opts: { groupBy?: ArGroupBy; property?: string; top?: number; pastDueOnly?: boolean } = {}) {
  const groupBy = opts.groupBy ?? "property";
  const top = Math.max(1, Math.min(25, opts.top ?? 10));
  const want = opts.property?.toUpperCase();
  const rows = run.statements
    .filter((s) => !MANAGEMENT_CODES.has(s.propertyCode.toUpperCase()))
    .filter((s) => !want || s.propertyCode.toUpperCase() === want)
    .map((s) => {
      const sum = summarize(s, run.period);
      return {
        unitRef: s.unitRef, property: s.propertyCode, tenant: s.tenantName,
        totalDue: sum.totalDue, pastDue: sum.pastDueAmount, credits: sum.credits, oldest: sum.oldestISO,
        over90: r2(sum.byAging.filter((b) => b.bucket === "d90plus").reduce((a, b) => a + b.amount, 0)),
      };
    });

  const nameOf = (code: string) => PROPERTY_DEFS.find((p) => p.id.toUpperCase() === code.toUpperCase())?.name ?? code;
  const keyOf = (code: string) => groupBy === "property" ? code : groupBy === "book" ? bookOf(code) : propertyTypeOf(code);
  const groups = new Map<string, { group: string; openAr: number; pastDue: number; over90: number; tenants: number; tenantsPastDue: number }>();
  for (const x of rows) {
    const k = keyOf(x.property);
    const g = groups.get(k) ?? { group: groupBy === "property" ? `${x.property} ${nameOf(x.property)}` : k, openAr: 0, pastDue: 0, over90: 0, tenants: 0, tenantsPastDue: 0 };
    g.openAr += x.totalDue; g.pastDue += x.pastDue; g.over90 += x.over90; g.tenants += 1;
    if (x.pastDue > 0.005) g.tenantsPastDue += 1;
    groups.set(k, g);
  }
  const totals = rows.reduce((t, x) => ({ openAr: t.openAr + x.totalDue, pastDue: t.pastDue + x.pastDue, over90: t.over90 + x.over90 }), { openAr: 0, pastDue: 0, over90: 0 });
  const byGroup = [...groups.values()]
    .map((g) => ({ ...g, openAr: r2(g.openAr), pastDue: r2(g.pastDue), over90: r2(g.over90), shareOfPastDuePct: totals.pastDue > 0 ? Math.round((g.pastDue / totals.pastDue) * 1000) / 10 : null }))
    .sort((a, b) => b.pastDue - a.pastDue || b.openAr - a.openAr);
  const ranked = [...rows]
    .filter((x) => !opts.pastDueOnly || x.pastDue > 0.005)
    .sort((a, b) => b.pastDue - a.pastDue || b.totalDue - a.totalDue)
    .slice(0, top);

  return {
    period: run.period,
    published: run.published,
    tenantsOnStatement: rows.length,
    tenantsPastDue: rows.filter((x) => x.pastDue > 0.005).length,
    totalOpenAr: r2(totals.openAr),
    totalPastDue: r2(totals.pastDue),
    totalOver90: r2(totals.over90),
    groupBy,
    byGroup,
    topTenants: ranked,
  };
}

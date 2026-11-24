// "Which properties still owe an operating-statement GL upload?" — the same
// latest-posted-period logic the Operating Statements page uses, computed
// server-side so the weekly digest email (and dashboard) can nudge on
// outstanding uploads. A property is "behind" when its newest posted GL is
// older than the prior calendar month.

import "server-only";
import { monthlyStatements } from "./mappingStore";
import { expectedPostedThrough, expectedPostedThroughFor } from "./postingSchedule";
export { expectedPostedThrough, expectedPostedThroughFor };
import { listFullGls, type StoredGl } from "./statementStore";
import { assembleGls, closedThrough } from "./glAssemble";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import { FUND_BUILDINGS } from "@/lib/financials/cash-analysis/funds";

export type OutstandingGl = {
  key: string;
  propertyCode: string;
  name: string;
  /** Newest posted period, or null when nothing is uploaded yet. */
  latest: { year: number; period: number } | null;
};


/** Properties whose latest posted GL is behind what they owe — the prior
 *  calendar month, or the last quarter end for a quarterly (land) statement. */
export async function outstandingGlUploads(now = new Date()): Promise<{
  expected: { year: number; period: number };
  behind: OutstandingGl[];
}> {
  const expected = expectedPostedThrough(now);
  const [mappings, fulls] = await Promise.all([monthlyStatements(), listFullGls()]);

  const byKeyYear = new Map<string, Map<number, StoredGl[]>>();
  for (const g of fulls) {
    let ym = byKeyYear.get(g.key);
    if (!ym) byKeyYear.set(g.key, (ym = new Map()));
    const arr = ym.get(g.year);
    if (arr) arr.push(g); else ym.set(g.year, [g]);
  }
  const latestByKey = new Map<string, { year: number; period: number }>();
  for (const [k, ym] of byKeyYear) {
    const latestYear = Math.max(...ym.keys());
    const files = ym.get(latestYear)!;
    const asm = assembleGls(files);
    // POSTED through, not last ACTIVE — a dormant property is current, not
    // behind — and never a month that had not ended when it was imported.
    if (asm) latestByKey.set(k, { year: latestYear, period: closedThrough(asm, latestYear, files) });
  }

  const behind: OutstandingGl[] = [];
  const earlier = (a: { year: number; period: number } | null, b: { year: number; period: number } | null) =>
    !a || !b ? null : (a.year < b.year || (a.year === b.year && a.period < b.period) ? a : b);
  for (const m of mappings) {
    // A fund (JV III, NI LLC) is a Skyline PORTFOLIO — there is no GL of its
    // own to export (owner, 11/2026). It is posted as far as its buildings
    // all are, as the GL Import Coverage grid has always read it; a shell GL
    // that happens to be on file counts if it is further along.
    const parts = FUND_BUILDINGS[m.key];
    const own = latestByKey.get(m.key) ?? null;
    const viaParts = parts?.length ? parts.map((k) => latestByKey.get(k) ?? null).reduce((a, b) => earlier(a, b)) : null;
    const latest = !parts ? own
      : !own ? viaParts
      : !viaParts ? own
      : (earlier(own, viaParts) === own ? viaParts : own);
    const owed = expectedPostedThroughFor(m.propertyCode || m.key, now);
    const isBehind = !latest
      || latest.year < owed.year
      || (latest.year === owed.year && latest.period < owed.period);
    if (isBehind) {
      behind.push({
        key: m.key,
        propertyCode: m.propertyCode,
        name: PROPERTY_DEFS.find((p) => p.id === m.key)?.name ?? m.entityName,
        latest,
      });
    }
  }
  behind.sort((a, b) => a.propertyCode.localeCompare(b.propertyCode));
  return { expected, behind };
}

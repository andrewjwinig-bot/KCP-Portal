// "Which properties still owe an operating-statement GL upload?" — the same
// latest-posted-period logic the Operating Statements page uses, computed
// server-side so the weekly digest email (and dashboard) can nudge on
// outstanding uploads. A property is "behind" when its newest posted GL is
// older than the prior calendar month.

import "server-only";
import { availableStatements } from "./mappingStore";
import { listFullGls, type StoredGl } from "./statementStore";
import { assembleGls } from "./glAssemble";
import { PROPERTY_DEFS } from "@/lib/properties/data";

export type OutstandingGl = {
  key: string;
  propertyCode: string;
  name: string;
  /** Newest posted period, or null when nothing is uploaded yet. */
  latest: { year: number; period: number } | null;
};

/** The month a property's GL should be posted through by now (prior month). */
export function expectedPostedThrough(now = new Date()): { year: number; period: number } {
  return now.getMonth() === 0
    ? { year: now.getFullYear() - 1, period: 12 }          // January → prior December
    : { year: now.getFullYear(), period: now.getMonth() }; // else prior month (getMonth() is already 1-behind, 1-indexed)
}

/** Properties whose latest posted GL is behind the prior calendar month. */
export async function outstandingGlUploads(now = new Date()): Promise<{
  expected: { year: number; period: number };
  behind: OutstandingGl[];
}> {
  const expected = expectedPostedThrough(now);
  const [mappings, fulls] = await Promise.all([availableStatements(), listFullGls()]);

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
    const asm = assembleGls(ym.get(latestYear)!);
    if (asm) latestByKey.set(k, { year: latestYear, period: asm.maxPeriodInFile });
  }

  const behind: OutstandingGl[] = [];
  for (const m of mappings) {
    const latest = latestByKey.get(m.key) ?? null;
    const isBehind = !latest
      || latest.year < expected.year
      || (latest.year === expected.year && latest.period < expected.period);
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

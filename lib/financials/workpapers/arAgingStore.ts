// Tenant agings imported for the workpapers, one record per as-of date.
//
// KEPT APART from Open Credits' `tenant-aging` on purpose: an import there
// builds the month's tenant notices and ticks Drew's monthly task, and a
// backdated quarter-end report must do neither. A re-import for the same date
// replaces the properties it carries and keeps the rest.
import "server-only";
import { createMapStore } from "@/lib/collectionStore";
import { listJSON } from "@/lib/storage";
import { resolveCurrentRentroll, rollAsOf } from "@/lib/rentroll/current";
import { allRuns } from "@/lib/statements/store";
import { parseAgingReport, resolveAgingProperties, type AgingTenant, type KnownUnit } from "@/lib/statements/parseAgingReport";
import { arSections, type ArSection } from "./arAging";

export interface StoredArAging {
  asOf: string;
  importedAt: string;
  by: string | null;
  file: string;
  sections: Record<string, ArSection>;
}

const store = createMapStore<StoredArAging>({ prefix: "workpaper-ar-aging" });

export async function getArAging(asOf: string): Promise<StoredArAging | null> {
  return store.get(asOf);
}

/** Every suite the portal knows, under every name: the rent roll AS OF the
 *  report's month (tenants who have since left), today's roll, and the newest
 *  laser statements. */
async function knownUnits(asOf: string): Promise<KnownUnit[]> {
  const out: KnownUnit[] = [];
  const push = (roll: { properties?: { units?: { unitRef: string; occupantName?: string | null }[] }[] } | null) => {
    for (const p of roll?.properties ?? []) for (const u of p.units ?? []) if (u.occupantName) out.push({ unitRef: u.unitRef, name: u.occupantName });
  };
  const snaps = ((await listJSON("rentroll-history", { fresh: true }).catch(() => [])) ?? []) as { properties?: unknown[] }[];
  push(rollAsOf(snaps.filter((s) => s && Array.isArray(s.properties)) as never[], asOf.slice(0, 7)) as never);
  push((await resolveCurrentRentroll().catch(() => null)) as never);
  const runs = (await allRuns().catch(() => [])).sort((a, b) => b.period.localeCompare(a.period)).slice(0, 6);
  for (const r of runs) for (const s of r.statements) out.push({ unitRef: s.unitRef.replace(/-(CU|FO)$/i, ""), name: s.tenantName });
  return out;
}

export type ArImportResult = {
  asOf: string; properties: string[]; tenants: number; total: number;
  unresolved: { suite: string; tenantName: string; balance: number }[];
  untied: { unitRef: string; tenantName: string }[];
};

/** Is this workbook Skyline's tenant Aging Report (Detailed)? */
export function isTenantAging(buf: Buffer): boolean {
  try { parseAgingReport(buf); return true; } catch { return false; }
}

export async function importArAging(buf: Buffer, file: string, by: string | null): Promise<ArImportResult> {
  const parsed = parseAgingReport(buf);
  if (!parsed.asOfISO) throw new Error("Couldn't read the report's \"as of\" date.");
  const { blocks, unresolved } = resolveAgingProperties(parsed.blocks, await knownUnits(parsed.asOfISO));
  const tenants = blocks.flatMap((b) => b.tenants).filter((t): t is AgingTenant & { unitRef: string; propertyCode: string } => !!t.unitRef && !!t.propertyCode);
  if (!tenants.length) throw new Error("No tenant on this report could be matched to a property.");
  const sections = arSections(tenants);
  const prior = await store.get(parsed.asOfISO);
  await store.set(parsed.asOfISO, {
    asOf: parsed.asOfISO, importedAt: new Date().toISOString(), by, file,
    sections: { ...(prior?.sections ?? {}), ...sections },
  });
  return {
    asOf: parsed.asOfISO,
    properties: Object.keys(sections),
    tenants: tenants.length,
    total: Math.round(tenants.reduce((a, t) => a + t.balanceDue, 0) * 100) / 100,
    unresolved: unresolved.map((t) => ({ suite: t.suite, tenantName: t.tenantName, balance: t.balanceDue })),
    untied: tenants.filter((t) => !t.tiesOut).map((t) => ({ unitRef: t.unitRef, tenantName: t.tenantName })),
  };
}

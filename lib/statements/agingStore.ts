// Aging Report imports, one document per as-of date (`tenant-aging`).

import "server-only";
import { createCollectionStore } from "@/lib/collectionStore";
import { resolveCurrentRentroll } from "@/lib/rentroll/current";
import { allRuns } from "./store";
import { parseAgingReport, resolveAgingProperties, type AgingTenant, type KnownUnit } from "./parseAgingReport";
import { composeAging, type AgingSnapshot, type CurrentAging } from "./aging";

const store = createCollectionStore<AgingSnapshot>({ prefix: "tenant-aging", keyOf: (s) => s.asOf });

export async function allAgingSnapshots(): Promise<AgingSnapshot[]> {
  return (await store.all()).filter(Boolean);
}

export async function currentAging(onOrBefore?: string): Promise<CurrentAging> {
  return composeAging(await allAgingSnapshots().catch(() => []), onOrBefore);
}

/** Every suite the portal knows, under every name it knows it by: the rent
 *  roll's occupants and the laser statements' tenants. */
async function knownUnits(): Promise<KnownUnit[]> {
  const out: KnownUnit[] = [];
  const roll = await resolveCurrentRentroll().catch(() => null);
  for (const p of roll?.properties ?? []) for (const u of p.units ?? []) if (u.occupantName) out.push({ unitRef: u.unitRef, name: u.occupantName });
  const runs = (await allRuns().catch(() => [])).sort((a, b) => b.period.localeCompare(a.period)).slice(0, 3);
  for (const r of runs) for (const s of r.statements) out.push({ unitRef: s.unitRef.replace(/-(CU|FO)$/i, ""), name: s.tenantName });
  return out;
}

export type AgingImportResult = {
  asOf: string; runAt: string | null; tenants: number; properties: string[];
  credits: { count: number; total: number }; charges: number;
  unresolved: { suite: string; tenantName: string }[];
  untied: { unitRef: string; tenantName: string }[];
};

export async function importAging(buf: Buffer, sourceFile: string, by: string | null): Promise<AgingImportResult> {
  const parsed = parseAgingReport(buf);
  if (!parsed.asOfISO) throw new Error("Couldn't read the report's \"as of\" date.");
  const { blocks, unresolved } = resolveAgingProperties(parsed.blocks, await knownUnits());
  const tenants = blocks.flatMap((b) => b.tenants).filter((t): t is AgingTenant & { unitRef: string; propertyCode: string } => !!t.unitRef && !!t.propertyCode);
  if (!tenants.length) throw new Error("No tenant on this report could be matched to a property.");
  const codes = [...new Set(tenants.map((t) => t.propertyCode))];
  const existing = await store.get(parsed.asOfISO).catch(() => null);
  const kept = (existing?.tenants ?? []).filter((t) => !codes.includes(t.propertyCode));
  const snap: AgingSnapshot = {
    asOf: parsed.asOfISO, runAt: parsed.runAt, importedAt: new Date().toISOString(), importedBy: by, sourceFile,
    propertyCodes: [...new Set([...(existing?.propertyCodes ?? []).filter((c) => !codes.includes(c)), ...codes])],
    tenants: [...kept, ...tenants],
  };
  await store.set(snap.asOf, snap);
  const credits = tenants.flatMap((t) => t.lines.filter((l) => l.amount < 0));
  return {
    asOf: snap.asOf, runAt: snap.runAt, tenants: tenants.length, properties: codes,
    credits: { count: credits.length, total: Math.round(credits.reduce((a, l) => a - l.amount, 0) * 100) / 100 },
    charges: tenants.reduce((a, t) => a + t.lines.filter((l) => l.amount > 0).length, 0),
    unresolved: unresolved.map((t) => ({ suite: t.suite, tenantName: t.tenantName })),
    untied: tenants.filter((t) => !t.tiesOut).map((t) => ({ unitRef: t.unitRef, tenantName: t.tenantName })),
  };
}

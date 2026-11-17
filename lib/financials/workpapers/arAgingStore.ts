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
import { arSections, coversEveryBalance, placeByBalance, type ArSection } from "./arAging";
import { listGls, assembledGl } from "@/lib/financials/operating-statements/statementStore";

export interface StoredArAging {
  asOf: string;
  importedAt: string;
  by: string | null;
  file: string;
  sections: Record<string, ArSection>;
  /** Run for "Any With Open Credits": lists only tenants holding a credit, so
   *  it cannot prove what tenants owe. Kept, never tied. */
  creditsOnly?: boolean;
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
  /** Run for "Any With Open Credits" — it cannot prove what tenants owe. */
  creditsOnly: boolean;
  /** Groups placed by their total matching a property's 042x balance. */
  placedByBalance: string[];
};

/** Each property's trade receivables (042x) at the as-of month, from its GL. */
async function receivablesAt(asOf: string): Promise<{ key: string; owed: number | null }[]> {
  const year = Number(asOf.slice(0, 4)), month = Number(asOf.slice(5, 7));
  const keys = [...new Set((await listGls()).filter((g) => g.year === year).map((g) => g.key))];
  return Promise.all(keys.map(async (key) => {
    const gl = await assembledGl(key, year).catch(() => null);
    if (!gl) return { key, owed: null };
    let owed = 0, any = false;
    for (const code of new Set([...Object.keys(gl.monthly ?? {}), ...Object.keys(gl.beginning ?? {})])) {
      if (!/^042\d-/.test(code)) continue;
      any = true;
      owed += gl.beginning?.[code] ?? 0;
      for (let i = 0; i < month; i++) owed += gl.monthly?.[code]?.[i] || 0;
    }
    return { key, owed: any ? Math.round(owed * 100) / 100 : null };
  }));
}

/** Is this workbook Skyline's tenant Aging Report (Detailed)? */
export function isTenantAging(buf: Buffer): boolean {
  try { parseAgingReport(buf); return true; } catch { return false; }
}

export async function importArAging(buf: Buffer, file: string, by: string | null): Promise<ArImportResult> {
  const parsed = parseAgingReport(buf);
  if (!parsed.asOfISO) throw new Error("Couldn't read the report's \"as of\" date.");
  const { blocks } = resolveAgingProperties(parsed.blocks, await knownUnits(parsed.asOfISO));
  // A group the names could not place: try its total against each property's
  // receivables at the as-of date.
  const placedByBalance: string[] = [];
  const open = blocks.filter((b) => b.tenants.length && b.tenants.every((t) => !t.propertyCode));
  if (open.length) {
    const owed = await receivablesAt(parsed.asOfISO);
    const taken = new Set(blocks.flatMap((b) => b.tenants.map((t) => t.propertyCode).filter((c): c is string => !!c)));
    for (const b of open) {
      const total = Math.round(b.tenants.reduce((a, t) => a + t.balanceDue, 0) * 100) / 100;
      const code = placeByBalance(total, owed, taken);
      if (!code) continue;
      taken.add(code); placedByBalance.push(code);
      for (const t of b.tenants) { t.propertyCode = code; t.unitRef = `${code}-${t.suite}`; }
    }
  }
  const unresolved = blocks.flatMap((b) => b.tenants).filter((t) => !t.propertyCode);
  const tenants = blocks.flatMap((b) => b.tenants).filter((t): t is AgingTenant & { unitRef: string; propertyCode: string } => !!t.unitRef && !!t.propertyCode);
  if (!tenants.length) throw new Error("No tenant on this report could be matched to a property.");
  const sections = arSections(tenants);
  const creditsOnly = !coversEveryBalance(blocks.flatMap((b) => b.tenants));
  const prior = await store.get(parsed.asOfISO);
  await store.set(parsed.asOfISO, {
    asOf: parsed.asOfISO, importedAt: new Date().toISOString(), by, file,
    // A credits-only run replaces nothing a full run already gave.
    sections: creditsOnly && prior && !prior.creditsOnly ? prior.sections : { ...(prior?.sections ?? {}), ...sections },
    creditsOnly: creditsOnly && !(prior && !prior.creditsOnly),
  });
  return {
    asOf: parsed.asOfISO,
    properties: Object.keys(sections),
    tenants: tenants.length,
    total: Math.round(tenants.reduce((a, t) => a + t.balanceDue, 0) * 100) / 100,
    unresolved: unresolved.map((t) => ({ suite: t.suite, tenantName: t.tenantName, balance: t.balanceDue })),
    untied: tenants.filter((t) => !t.tiesOut).map((t) => ({ unitRef: t.unitRef, tenantName: t.tenantName })),
    creditsOnly,
    placedByBalance,
  };
}

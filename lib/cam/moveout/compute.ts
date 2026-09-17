// Shared per-tenant interim ("as-of month") CAM/RET statement compute — the
// single source of truth for a move-out reconciliation. Extracted from the
// /api/cam-recon/interim GET so the route, the daily move-out watcher (cron),
// and the finalize/send endpoint all produce the *identical* statement. Nothing
// here is manual-entry (that stays inline in the route's POST); this is the
// "pick a real tenant on a real roster and reconcile them through the latest
// posted GL" path.

import "server-only";
import { assembledGl } from "@/lib/financials/operating-statements/statementStore";
import { getJSON } from "@/lib/storage";
import type { RentRollData } from "@/lib/rentroll/parseRentRollExcel";
import { PROPERTY_DEFS } from "@/lib/properties/data";

import { RETAIL_RECON_FIXTURES } from "@/lib/cam/retail/registry";
import { assembleRetail } from "@/lib/cam/retail/assemble";
import { reconcileInterimRetailTenant, type InterimRetailResult } from "@/lib/cam/retail/interim";
import { getCamConfig } from "@/lib/cam/configStorage";
import { seedCamConfig } from "@/lib/cam/retailConfigSeed";
import { emptyCamConfig } from "@/lib/cam/config";
import { getEscrowOverrides } from "@/lib/cam/retail/escrowStore";
import { sumRentRollEscrow } from "@/lib/cam/escrowFromRolls";
import { getPoolOverride } from "@/lib/cam/retail/poolStore";
import { getFinalOverrides, RET_FINAL_KEY } from "@/lib/cam/retail/finalStore";

import { OFFICE_RECON_FIXTURES } from "@/lib/cam/office/registry";
import { reconcileInterimTenant, type InterimReconResult } from "@/lib/cam/office/interim";
import { type OfficeLeaseConfig } from "@/lib/cam/office/assemble";
import { getOverrides, mergeConfig } from "@/lib/cam/office/configStore";
import { getUnitConfigs } from "@/lib/cam/office/unitConfig";

export const JV_III = new Set(["3610", "3620", "3640"]);

/** "M/D/YYYY" → { y, m } (1–12), or null. */
export function parseUS(s: string | null | undefined): { y: number; m: number } | null {
  if (!s) return null;
  const mm = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return mm ? { y: Number(mm[3]), m: Number(mm[1]) } : null;
}

export const propName = (code: string) => PROPERTY_DEFS.find((p) => p.id === code)?.name ?? code;

/** The carry-forward lease config for an office property: the latest seeded
 *  recon year's config at or before `year`, then per-unit + per-year overrides. */
export async function officeConfigFor(property: string, year: number): Promise<Record<string, OfficeLeaseConfig>> {
  const fixture = OFFICE_RECON_FIXTURES[property];
  if (!fixture) return {};
  const years = Object.keys(fixture.byYear).map(Number).filter((y) => y <= year).sort((a, b) => b - a);
  const cfgYear = years[0] ?? Math.max(...Object.keys(fixture.byYear).map(Number));
  const seeded = fixture.byYear[cfgYear]?.leaseConfig ?? {};
  const unitConfigs = await getUnitConfigs();
  const seededWithUnit: Record<string, OfficeLeaseConfig> = {};
  for (const [unitRef, base] of Object.entries(seeded)) {
    const uc = unitConfigs[unitRef] ?? {};
    seededWithUnit[unitRef] = {
      ...base,
      ...(uc.proRataPct != null ? { proRataPct: uc.proRataPct } : {}),
      ...(uc.grossUp != null ? { grossUp: uc.grossUp } : {}),
    };
  }
  return mergeConfig(seededWithUnit, await getOverrides(property, year));
}

export type MoveoutMeta = {
  property: string; propertyName: string; unitRef: string; name: string; year: number;
  asOfMonth: number; effectiveThrough: number; occupiedMonths: number; unpostedMonths: number;
  maxPosted: number; startMonth: number; leaseFrom: string | null; leaseTo: string | null;
  sqft: number; opexMonth: number; reTaxMonth: number; baseYear?: number; proRataPct: number;
  grossUp?: boolean; glAsOf: string | null; escrowSource?: "monthly-rolls" | "estimate"; escrowMonthsFound?: number;
};

export type MoveoutComputed =
  | { ok: true; kind: "retail"; result: InterimRetailResult; meta: MoveoutMeta }
  | { ok: true; kind: "office"; result: InterimReconResult; meta: MoveoutMeta }
  | { ok: false; status: number; error: string; meta: Partial<MoveoutMeta> };

export type MoveoutOk = Extract<MoveoutComputed, { ok: true }>;

/** Type guard — narrows a computed result to the success variant. A guard is
 *  used (rather than `if (c.ok)`) because the project runs with strictNullChecks
 *  off, where truthiness narrowing on a boolean discriminant doesn't apply. */
export function moveoutOk(c: MoveoutComputed): c is MoveoutOk {
  return c.ok === true;
}

/** Reconcile one roster tenant as-of a month, pulling actuals live from the
 *  latest POSTED GL month. `asOf` defaults to the lease-expiration month when it
 *  falls in the recon year, else December. Returns a discriminated result so the
 *  caller (route / watcher / finalize) can 404 / 422 as needed. */
export async function computeMoveoutStatement(
  property: string,
  year: number,
  unitRef: string,
  asOf?: number,
): Promise<MoveoutComputed> {
  const rentroll = (await getJSON("rentroll", "current")) as RentRollData | null;
  const liveUnits = (rentroll?.properties.flatMap((p) => p.units) ?? []).filter((u) => !u.isVacant);
  const liveByRef = new Map(liveUnits.map((u) => [u.unitRef, u]));

  // ── Retail ────────────────────────────────────────────────────────────────
  const retailFix = RETAIL_RECON_FIXTURES[property];
  if (retailFix) {
    const ry = Object.keys(retailFix.byYear).map(Number).sort((a, b) => b - a)[0];
    const roster = retailFix.byYear[ry]?.roster ?? [];
    const rosterU = roster.find((u) => u.unitRef === unitRef);
    if (!rosterU) return { ok: false, status: 404, error: `${unitRef} isn't on the ${property} roster.`, meta: { property, unitRef } };
    const live = liveByRef.get(unitRef);
    const leaseFrom = live?.leaseFrom ?? rosterU.rcd ?? null;
    const leaseTo = live?.leaseTo ?? null;
    const name = live?.occupantName ?? rosterU.name;
    const opexMonth = live?.opexMonth ?? 0;
    const reTaxMonth = live?.reTaxMonth ?? 0;

    const start = parseUS(leaseFrom);
    const startMonth = start && start.y === year ? start.m : 1;
    const exp = parseUS(leaseTo);
    const expMonth = exp && exp.y === year ? exp.m : 12;
    const asOfMonth = Math.min(12, Math.max(1, asOf || expMonth));

    const gl = await assembledGl(property, year);
    const maxPosted = gl?.maxPeriodInFile ?? 0;
    const effectiveThrough = Math.min(asOfMonth, maxPosted);
    const occupiedMonths = Math.max(0, effectiveThrough - startMonth + 1);
    const unpostedMonths = Math.max(0, asOfMonth - maxPosted);
    const meta0 = { property, propertyName: propName(property), unitRef, name, year, asOfMonth, maxPosted, startMonth };
    if (!gl || occupiedMonths <= 0) {
      return {
        ok: false, status: 422,
        error: gl ? `No posted GL for ${name} through its occupied period (posted through month ${maxPosted}).` : `No GL uploaded for ${property} ${year}.`,
        meta: meta0,
      };
    }
    const ytdCamByAccount: Record<string, number> = {};
    for (const [account, nets] of Object.entries(gl.monthly)) {
      let s = 0;
      for (let mo = startMonth; mo <= effectiveThrough; mo++) s += nets[mo - 1] || 0;
      ytdCamByAccount[account] = s;
    }

    const finals = await getFinalOverrides(property, year);
    const poolOverride = await getPoolOverride(property, year);
    const pool = {
      ...retailFix.pool,
      camLines: retailFix.pool.camLines.map((l) => (finals[l.label] != null ? { ...l, amount: finals[l.label] } : l)),
      insAmount: poolOverride.insAmount ?? retailFix.pool.insAmount,
      retAmount: finals[RET_FINAL_KEY] ?? retailFix.pool.retAmount,
    };
    const escrowOverrides = await getEscrowOverrides(property, year);
    const rosterWithEscrow = roster.map((u) => ({ ...u, ...(escrowOverrides[u.unitRef] ?? {}) }));
    const configFor2 = async (ref: string) => (await getCamConfig(ref)) ?? seedCamConfig(ref) ?? emptyCamConfig(ref);
    const cfg = await configFor2(unitRef);
    const tenants = assembleRetail(pool, rosterWithEscrow, retailFix.gla, () => cfg).filter((t) => t.unitRef === unitRef);
    const base = tenants[0];
    if (!base) return { ok: false, status: 404, error: `${unitRef} has no CAM config — it isn't reconciled.`, meta: meta0 };

    const summedEsc = await sumRentRollEscrow(unitRef, year, startMonth, effectiveThrough, { cam: opexMonth, ret: reTaxMonth });
    const result = reconcileInterimRetailTenant({
      pool,
      tenant: { ...base, camEscrow: summedEsc?.camEscrow ?? opexMonth * occupiedMonths, retEscrow: summedEsc?.retEscrow ?? reTaxMonth * occupiedMonths, insEscrow: 0, rcd: leaseFrom },
      ytdCamByAccount,
      occupiedMonths,
      asOfMonth,
      unpostedMonths,
    });
    return {
      ok: true, kind: "retail", result,
      meta: {
        property, propertyName: propName(property), unitRef, name, year,
        asOfMonth, effectiveThrough, occupiedMonths, unpostedMonths, maxPosted,
        startMonth, leaseFrom, leaseTo, sqft: base.sqft, opexMonth, reTaxMonth,
        escrowSource: summedEsc ? "monthly-rolls" : "estimate", escrowMonthsFound: summedEsc?.monthsFound ?? 0,
        proRataPct: base.camPrs, glAsOf: gl.uploadedAt ?? null,
      },
    };
  }

  // ── Office ──────────────────────────────────────────────────────────────
  const fixture = OFFICE_RECON_FIXTURES[property];
  if (!fixture) return { ok: false, status: 404, error: `No recon for ${property}`, meta: { property, unitRef } };

  const config = await officeConfigFor(property, year);
  if (!config[unitRef]) return { ok: false, status: 404, error: `${unitRef} has no lease config — it isn't reconciled.`, meta: { property, unitRef } };

  const cfgYear = Object.keys(fixture.byYear).map(Number).sort((a, b) => b - a)[0];
  const rosterU = (fixture.byYear[cfgYear]?.roster ?? []).find((u) => u.unitRef === unitRef);
  const live = liveByRef.get(unitRef);
  const leaseFrom = live?.leaseFrom ?? rosterU?.leaseFrom ?? null;
  const leaseTo = live?.leaseTo ?? rosterU?.leaseTo ?? null;
  const sqft = live?.sqft ?? rosterU?.sqft ?? 0;
  const name = live?.occupantName ?? rosterU?.occupantName ?? unitRef;
  const opexMonth = live?.opexMonth ?? rosterU?.opexMonth ?? 0;
  const reTaxMonth = live?.reTaxMonth ?? rosterU?.reTaxMonth ?? 0;

  const start = parseUS(leaseFrom);
  const startMonth = start && start.y === year ? start.m : 1;
  const exp = parseUS(leaseTo);
  const expMonth = exp && exp.y === year ? exp.m : 12;
  const asOfMonth = Math.min(12, Math.max(1, asOf || expMonth));

  const gl = await assembledGl(property, year);
  const maxPosted = gl?.maxPeriodInFile ?? 0;
  const effectiveThrough = Math.min(asOfMonth, maxPosted);
  const occupiedMonths = Math.max(0, effectiveThrough - startMonth + 1);
  const unpostedMonths = Math.max(0, asOfMonth - maxPosted);
  const meta0 = { property, propertyName: propName(property), unitRef, name, year, asOfMonth, maxPosted, startMonth };

  if (!gl || occupiedMonths <= 0) {
    return {
      ok: false, status: 422,
      error: gl
        ? `No posted GL for ${name} through its occupied period (GL posted through month ${maxPosted}).`
        : `No GL uploaded for ${property} ${year}.`,
      meta: meta0,
    };
  }

  const ytdRawByAccount: Record<string, number> = {};
  for (const [account, nets] of Object.entries(gl.monthly)) {
    let s = 0;
    for (let mo = startMonth; mo <= effectiveThrough; mo++) s += nets[mo - 1] || 0;
    ytdRawByAccount[account] = s;
  }

  const pool = JV_III.has(property)
    ? fixture.pool
    : { ...fixture.pool, opexLines: fixture.pool.opexLines.filter((l) => !l.glAccount.startsWith("6990")) };

  const cfg = config[unitRef];
  const summedEsc = await sumRentRollEscrow(unitRef, year, startMonth, effectiveThrough, { cam: opexMonth, ret: reTaxMonth });
  const result = reconcileInterimTenant({
    pool,
    tenant: {
      unitRef, skylineUnit: `${unitRef}-CU`, suite: unitRef.split("-").slice(1).join("-"), name,
      baseYear: cfg.baseYear, noBaseStop: cfg.noBaseStop, grossUp: cfg.grossUp, proRataPct: cfg.proRataPct,
      sqft, occPct: 1, recoveryPct: 1,
      opexEscrow: summedEsc?.camEscrow ?? opexMonth * occupiedMonths, retEscrow: summedEsc?.retEscrow ?? reTaxMonth * occupiedMonths,
      camMonthly: opexMonth, retMonthly: reTaxMonth, rcd: leaseFrom,
    },
    reconYear: year,
    ytdRawByAccount,
    occupiedMonths,
    asOfMonth,
    unpostedMonths,
  });

  return {
    ok: true, kind: "office", result,
    meta: {
      property, propertyName: propName(property), unitRef, name, year,
      asOfMonth, effectiveThrough, occupiedMonths, unpostedMonths, maxPosted,
      startMonth, leaseFrom, leaseTo, sqft, opexMonth, reTaxMonth,
      escrowSource: summedEsc ? "monthly-rolls" : "estimate", escrowMonthsFound: summedEsc?.monthsFound ?? 0,
      baseYear: cfg.baseYear, proRataPct: cfg.proRataPct, grossUp: cfg.grossUp,
      glAsOf: gl.uploadedAt ?? null,
    },
  };
}

/** The total reconciliation balance (positive = owed by tenant, negative =
 *  credit/refund to tenant). CAM+INS+RET for retail, Opex+RET for office. */
export function moveoutBalance(c: MoveoutOk): number {
  return c.kind === "retail"
    ? c.result.camBalance + c.result.insBalance + c.result.retBalance
    : c.result.opexBalance + c.result.retBalance;
}

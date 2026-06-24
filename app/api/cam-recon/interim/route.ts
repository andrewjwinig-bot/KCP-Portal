import { NextRequest, NextResponse } from "next/server";
import { reconcileInterimTenant } from "@/lib/cam/office/interim";
import { type OfficeLeaseConfig } from "@/lib/cam/office/assemble";
import { OFFICE_RECON_FIXTURES } from "@/lib/cam/office/registry";
import { getOverrides, mergeConfig } from "@/lib/cam/office/configStore";
import { getUnitConfigs } from "@/lib/cam/office/unitConfig";
import { assembledGl } from "@/lib/financials/operating-statements/statementStore";
import { getJSON } from "@/lib/storage";
import type { RentRollData } from "@/lib/rentroll/parseRentRollExcel";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import { RETAIL_RECON_FIXTURES } from "@/lib/cam/retail/registry";
import { assembleRetail } from "@/lib/cam/retail/assemble";
import { reconcileInterimRetailTenant } from "@/lib/cam/retail/interim";
import { getCamConfig } from "@/lib/cam/configStorage";
import { seedCamConfig } from "@/lib/cam/retailConfigSeed";
import { emptyCamConfig } from "@/lib/cam/config";
import { getEscrowOverrides } from "@/lib/cam/retail/escrowStore";
import { getPoolOverride } from "@/lib/cam/retail/poolStore";
import { getFinalOverrides, RET_FINAL_KEY } from "@/lib/cam/retail/finalStore";
import type { RetailTenantInput } from "@/lib/cam/retail/types";
import type { OfficeTenantInput, OfficeExpensePool } from "@/lib/cam/office/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JV_III = new Set(["3610", "3620", "3640"]);

/** Ad-hoc ("blank") tenant inputs for a manual interim statement — entered by
 *  staff, NOT persisted. The building's expense pool is pulled live; the caller
 *  supplies the tenant's name, terms and escrow, and may override the YTD
 *  expense / escrow figures (blank → live GL / monthly × months). */
type ManualInput = {
  unitRef?: string | null;
  name: string;
  sqft: number;
  leaseFrom: string | null;
  vacatedISO: string | null;
  opexMonth: number;
  reTaxMonth: number;
  // Office methodology
  baseYear?: number;
  noBaseStop?: boolean;
  grossUp?: boolean;
  proRataPct?: number;
  // Retail methodology
  camPrs?: number;
  insPrs?: number;
  retPrs?: number;
  adminFeePct?: number;
  retDiscountPct?: number;
  // YTD-actual overrides (windowed totals; null → live)
  opexActualOverride?: number | null;
  retActualOverride?: number | null;
  insActualOverride?: number | null;
  // Escrow overrides (windowed totals; null → monthly × months)
  camEscrowOverride?: number | null;
  insEscrowOverride?: number | null;
  retEscrowOverride?: number | null;
};

/** "M/D/YYYY" → { y, m } (1–12), or null. */
function parseUS(s: string | null | undefined): { y: number; m: number } | null {
  if (!s) return null;
  const mm = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return mm ? { y: Number(mm[3]), m: Number(mm[1]) } : null;
}

const propName = (code: string) => PROPERTY_DEFS.find((p) => p.id === code)?.name ?? code;

/** The carry-forward lease config for a property: the latest seeded recon
 *  year's config at or before `year`, then per-unit + per-year overrides. */
async function configFor(property: string, year: number): Promise<Record<string, OfficeLeaseConfig>> {
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

/** Interim statement for an ad-hoc RETAIL tenant entered by staff — the
 *  building's CAM/INS/RET pools are pulled live; the caller supplies the
 *  tenant's terms + escrow. CAM/INS/RET YTD-actual + escrow overrides win when
 *  set; otherwise CAM pulls live from the GL and INS/RET prorate the pool. */
async function retailManualResult(
  property: string,
  year: number,
  m: ManualInput,
  asOfParam: number,
  retailFix: (typeof RETAIL_RECON_FIXTURES)[string],
): Promise<NextResponse> {
  const unitRef = (m.unitRef ?? "").trim() || `${property}-MANUAL`;
  const start = parseUS(m.leaseFrom);
  const startMonth = start && start.y === year ? start.m : 1;
  const vac = parseUS(m.vacatedISO);
  const vacMonth = vac && vac.y === year ? vac.m : 12;
  const asOfMonth = Math.min(12, Math.max(1, asOfParam || vacMonth));
  const name = m.name;

  const hasCamOverride = m.opexActualOverride != null;
  const gl = await assembledGl(property, year);
  const maxPosted = gl?.maxPeriodInFile ?? 0;
  // A manual CAM override is already the full occupied-window pool, so window to
  // the as-of/vacate month; otherwise window to the latest posted GL month.
  const effectiveThrough = hasCamOverride ? asOfMonth : Math.min(asOfMonth, maxPosted);
  const occupiedMonths = Math.max(0, effectiveThrough - startMonth + 1);
  const unpostedMonths = hasCamOverride ? 0 : Math.max(0, asOfMonth - maxPosted);
  if (occupiedMonths <= 0 || (!hasCamOverride && !gl)) {
    return NextResponse.json({
      error: !hasCamOverride && !gl
        ? `No GL uploaded for ${property} ${year} — enter a manual CAM (YTD) figure, or upload the GL.`
        : `No occupied months for ${name} through the as-of month (lease from ${m.leaseFrom ?? "?"}, vacated ${m.vacatedISO ?? "?"}).`,
      meta: { property, propertyName: propName(property), unitRef, name, year, asOfMonth, maxPosted, startMonth },
    }, { status: 422 });
  }

  // Property pool with the Final Expense Summary + insurance overrides.
  const finals = await getFinalOverrides(property, year);
  const poolOverride = await getPoolOverride(property, year);
  const pool = {
    ...retailFix.pool,
    camLines: retailFix.pool.camLines.map((l) => (finals[l.label] != null ? { ...l, amount: finals[l.label] } : l)),
    insAmount: poolOverride.insAmount ?? retailFix.pool.insAmount,
    retAmount: finals[RET_FINAL_KEY] ?? retailFix.pool.retAmount,
  };

  // Live CAM YTD from the GL (used only when CAM isn't overridden).
  let ytdCamByAccount: Record<string, number> | undefined;
  if (gl && !hasCamOverride) {
    ytdCamByAccount = {};
    for (const [account, nets] of Object.entries(gl.monthly)) {
      let s = 0;
      for (let mo = startMonth; mo <= effectiveThrough; mo++) s += nets[mo - 1] || 0;
      ytdCamByAccount[account] = s;
    }
  }

  const camEscrow = m.camEscrowOverride ?? m.opexMonth * occupiedMonths;
  const retEscrow = m.retEscrowOverride ?? m.reTaxMonth * occupiedMonths;
  const insEscrow = m.insEscrowOverride ?? 0;

  const tenant: RetailTenantInput = {
    unitRef, suite: unitRef.split("-").slice(1).join("-"), name, sqft: m.sqft,
    occPct: 1, rcd: m.leaseFrom, vacatedISO: m.vacatedISO,
    camPrs: m.camPrs ?? 0, insPrs: m.insPrs ?? 0, retPrs: m.retPrs ?? 0,
    camDenom: 0, insDenom: 0, retDenom: 0,
    adminFeePct: m.adminFeePct ?? 0, grossLease: false,
    camExcludedLabels: [], adminExcludedLabels: [], retDiscountPct: m.retDiscountPct ?? 0,
    camEscrow, insEscrow, retEscrow,
  };

  const result = reconcileInterimRetailTenant({
    pool, tenant, ytdCamByAccount, occupiedMonths, asOfMonth, unpostedMonths,
    overrides: {
      camPool: m.opexActualOverride ?? null,
      insPool: m.insActualOverride ?? null,
      retPool: m.retActualOverride ?? null,
    },
  });
  return NextResponse.json({
    result, kind: "retail",
    meta: {
      property, propertyName: propName(property), unitRef, name, year,
      asOfMonth, effectiveThrough, occupiedMonths, unpostedMonths, maxPosted,
      startMonth, leaseFrom: m.leaseFrom, leaseTo: m.vacatedISO, sqft: m.sqft,
      opexMonth: occupiedMonths ? camEscrow / occupiedMonths : 0,
      reTaxMonth: occupiedMonths ? retEscrow / occupiedMonths : 0,
      proRataPct: result.camPrs, glAsOf: gl?.uploadedAt ?? null, manual: true,
    },
  });
}

/** Interim statement for an ad-hoc OFFICE tenant entered by staff. Opex/RET
 *  YTD-actual + escrow overrides win when set; otherwise actuals come live from
 *  the building's GL. */
async function officeManualResult(
  property: string,
  year: number,
  m: ManualInput,
  asOfParam: number,
  fixture: (typeof OFFICE_RECON_FIXTURES)[string],
): Promise<NextResponse> {
  const unitRef = (m.unitRef ?? "").trim() || `${property}-MANUAL`;
  const start = parseUS(m.leaseFrom);
  const startMonth = start && start.y === year ? start.m : 1;
  const vac = parseUS(m.vacatedISO);
  const vacMonth = vac && vac.y === year ? vac.m : 12;
  const asOfMonth = Math.min(12, Math.max(1, asOfParam || vacMonth));
  const name = m.name;

  const hasExpenseOverride = m.opexActualOverride != null || m.retActualOverride != null;
  const gl = await assembledGl(property, year);
  const maxPosted = gl?.maxPeriodInFile ?? 0;
  const effectiveThrough = hasExpenseOverride ? asOfMonth : Math.min(asOfMonth, maxPosted);
  const occupiedMonths = Math.max(0, effectiveThrough - startMonth + 1);
  const unpostedMonths = hasExpenseOverride ? 0 : Math.max(0, asOfMonth - maxPosted);
  if (occupiedMonths <= 0 || (!hasExpenseOverride && !gl)) {
    return NextResponse.json({
      error: !hasExpenseOverride && !gl
        ? `No GL uploaded for ${property} ${year} — enter a manual YTD expense figure, or upload the GL.`
        : `No occupied months for ${name} through the as-of month (lease from ${m.leaseFrom ?? "?"}, vacated ${m.vacatedISO ?? "?"}).`,
      meta: { property, propertyName: propName(property), unitRef, name, year, asOfMonth, maxPosted, startMonth },
    }, { status: 422 });
  }

  const pool: OfficeExpensePool = JV_III.has(property)
    ? fixture.pool
    : { ...fixture.pool, opexLines: fixture.pool.opexLines.filter((l) => !l.glAccount.startsWith("6990")) };

  // Live YTD over the occupied, posted months (used for any non-overridden category).
  const ytdRawByAccount: Record<string, number> = {};
  if (gl) {
    const glThrough = Math.min(effectiveThrough, maxPosted);
    for (const [account, nets] of Object.entries(gl.monthly)) {
      let s = 0;
      for (let mo = startMonth; mo <= glThrough; mo++) s += nets[mo - 1] || 0;
      ytdRawByAccount[account] = s;
    }
  }

  const opexEscrow = m.camEscrowOverride ?? m.opexMonth * occupiedMonths;
  const retEscrow = m.retEscrowOverride ?? m.reTaxMonth * occupiedMonths;

  const tenant: OfficeTenantInput = {
    unitRef, skylineUnit: `${unitRef}-CU`, suite: unitRef.split("-").slice(1).join("-"), name,
    baseYear: m.baseYear ?? 0, noBaseStop: m.noBaseStop, grossUp: !!m.grossUp, proRataPct: m.proRataPct ?? 0,
    sqft: m.sqft, occPct: 1, recoveryPct: 1,
    opexEscrow, retEscrow,
    camMonthly: occupiedMonths ? opexEscrow / occupiedMonths : 0,
    retMonthly: occupiedMonths ? retEscrow / occupiedMonths : 0,
    rcd: m.leaseFrom,
  };

  const result = reconcileInterimTenant({
    pool, tenant, reconYear: year, ytdRawByAccount, occupiedMonths, asOfMonth, unpostedMonths,
    opexActualOverride: m.opexActualOverride ?? null,
    retActualOverride: m.retActualOverride ?? null,
  });
  return NextResponse.json({
    result, kind: "office",
    meta: {
      property, propertyName: propName(property), unitRef, name, year,
      asOfMonth, effectiveThrough, occupiedMonths, unpostedMonths, maxPosted,
      startMonth, leaseFrom: m.leaseFrom, leaseTo: m.vacatedISO, sqft: m.sqft,
      opexMonth: tenant.camMonthly, reTaxMonth: tenant.retMonthly,
      baseYear: m.baseYear ?? 0, proRataPct: m.proRataPct ?? 0, grossUp: !!m.grossUp,
      glAsOf: gl?.uploadedAt ?? null, manual: true,
    },
  });
}

/** Coerce a raw request body into ManualInput. */
function parseManual(t: any): ManualInput {
  const optNum = (v: unknown): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
  return {
    unitRef: str(t?.unitRef) || null,
    name: str(t?.name) || "Manual tenant",
    sqft: num(t?.sqft),
    leaseFrom: str(t?.leaseFrom) || null,
    vacatedISO: str(t?.vacatedISO) || null,
    opexMonth: num(t?.opexMonth),
    reTaxMonth: num(t?.reTaxMonth),
    baseYear: optNum(t?.baseYear) ?? undefined,
    noBaseStop: !!t?.noBaseStop,
    grossUp: !!t?.grossUp,
    proRataPct: optNum(t?.proRataPct) ?? undefined,
    camPrs: optNum(t?.camPrs) ?? undefined,
    insPrs: optNum(t?.insPrs) ?? undefined,
    retPrs: optNum(t?.retPrs) ?? undefined,
    adminFeePct: optNum(t?.adminFeePct) ?? undefined,
    retDiscountPct: optNum(t?.retDiscountPct) ?? undefined,
    opexActualOverride: optNum(t?.opexActualOverride),
    retActualOverride: optNum(t?.retActualOverride),
    insActualOverride: optNum(t?.insActualOverride),
    camEscrowOverride: optNum(t?.camEscrowOverride),
    insEscrowOverride: optNum(t?.insEscrowOverride),
    retEscrowOverride: optNum(t?.retEscrowOverride),
  };
}

/** POST /api/cam-recon/interim — ad-hoc ("blank") interim statement.
 *  Body: { property, year, asOf?, tenant: ManualInput }. The building's expense
 *  pool is pulled live; the supplied terms + escrow drive the statement. Kind
 *  (office/retail) is taken from the building's fixture. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const property = typeof body?.property === "string" ? body.property : "";
    const year = Number(body?.year);
    const asOf = Number(body?.asOf) || 0;
    if (!property || !year) return NextResponse.json({ error: "property + year required" }, { status: 400 });
    const m = parseManual(body?.tenant);

    const retailFix = RETAIL_RECON_FIXTURES[property];
    if (retailFix) return await retailManualResult(property, year, m, asOf, retailFix);
    const fixture = OFFICE_RECON_FIXTURES[property];
    if (fixture) return await officeManualResult(property, year, m, asOf, fixture);
    return NextResponse.json({ error: `No reconciliation fixture for ${property}` }, { status: 404 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}

/** GET /api/cam-recon/interim
 *    → { properties: [{ code, name }] }  (office buildings with a fixture)
 *  GET ?property=3610&year=2026
 *    → { tenants: [{ unitRef, name, leaseTo, expiresInYear }] }
 *  GET ?property=3610&year=2026&unitRef=3610-203[&asOf=6]
 *    → { result, meta }  — the interim (as-of-month) statement. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const property = searchParams.get("property");
  const year = Number(searchParams.get("year"));
  const unitRef = searchParams.get("unitRef");

  if (!property) {
    const properties = [
      ...Object.values(OFFICE_RECON_FIXTURES).map((f) => ({ code: f.propertyCode, name: propName(f.propertyCode), kind: "office" as const })),
      ...Object.values(RETAIL_RECON_FIXTURES).filter((f) => !f.hidden).map((f) => ({ code: f.propertyCode, name: propName(f.propertyCode), kind: "retail" as const })),
    ].sort((a, b) => a.code.localeCompare(b.code));
    return NextResponse.json({ properties });
  }

  const rentroll = (await getJSON("rentroll", "current")) as RentRollData | null;
  const liveUnits = (rentroll?.properties.flatMap((p) => p.units) ?? []).filter((u) => !u.isVacant);
  const liveByRef = new Map(liveUnits.map((u) => [u.unitRef, u]));
  const asOfParam = Number(searchParams.get("asOf"));

  // ── Retail interim ────────────────────────────────────────────────────────
  const retailFix = RETAIL_RECON_FIXTURES[property];
  if (retailFix && year) {
    const ry = Object.keys(retailFix.byYear).map(Number).sort((a, b) => b - a)[0];
    const roster = retailFix.byYear[ry]?.roster ?? [];
    if (!unitRef) {
      const tenants = roster.filter((u) => !u.vacant).map((u) => {
        const live = liveByRef.get(u.unitRef);
        const leaseTo = live?.leaseTo ?? null;
        const exp = parseUS(leaseTo);
        return { unitRef: u.unitRef, name: live?.occupantName ?? u.name, leaseTo, expiresInYear: exp?.y === year ? exp.m : null };
      }).sort((a, b) => a.unitRef.localeCompare(b.unitRef));
      return NextResponse.json({ tenants, kind: "retail" });
    }
    const rosterU = roster.find((u) => u.unitRef === unitRef);
    if (!rosterU) return NextResponse.json({ error: `${unitRef} isn't on the ${property} roster.` }, { status: 404 });
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
    const asOfMonth = Math.min(12, Math.max(1, Number(searchParams.get("asOf")) || expMonth));

    const gl = await assembledGl(property, year);
    const maxPosted = gl?.maxPeriodInFile ?? 0;
    const effectiveThrough = Math.min(asOfMonth, maxPosted);
    const occupiedMonths = Math.max(0, effectiveThrough - startMonth + 1);
    const unpostedMonths = Math.max(0, asOfMonth - maxPosted);
    if (!gl || occupiedMonths <= 0) {
      return NextResponse.json({
        error: gl ? `No posted GL for ${name} through its occupied period (posted through month ${maxPosted}).` : `No GL uploaded for ${property} ${year}.`,
        meta: { property, propertyName: propName(property), unitRef, name, year, asOfMonth, maxPosted, startMonth },
      }, { status: 422 });
    }
    const ytdCamByAccount: Record<string, number> = {};
    for (const [account, nets] of Object.entries(gl.monthly)) {
      let s = 0;
      for (let mo = startMonth; mo <= effectiveThrough; mo++) s += nets[mo - 1] || 0;
      ytdCamByAccount[account] = s;
    }

    // Pool with the Final Expense Summary + insurance overrides (same as the
    // year-end retail recon), then assemble the tenant input from the config.
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
    if (!base) return NextResponse.json({ error: `${unitRef} has no CAM config — it isn't reconciled.` }, { status: 404 });

    const result = reconcileInterimRetailTenant({
      pool,
      // Escrow for the window: rent-roll CAM/RET monthly × occupied months; INS
      // escrow isn't on the rent roll, so 0 (adjust if billed separately).
      tenant: { ...base, camEscrow: opexMonth * occupiedMonths, retEscrow: reTaxMonth * occupiedMonths, insEscrow: 0, rcd: leaseFrom },
      ytdCamByAccount,
      occupiedMonths,
      asOfMonth,
      unpostedMonths,
    });
    return NextResponse.json({
      result, kind: "retail",
      meta: {
        property, propertyName: propName(property), unitRef, name, year,
        asOfMonth, effectiveThrough, occupiedMonths, unpostedMonths, maxPosted,
        startMonth, leaseFrom, leaseTo, sqft: base.sqft, opexMonth, reTaxMonth,
        proRataPct: base.camPrs, glAsOf: gl.uploadedAt ?? null,
      },
    });
  }

  // ── Office interim ────────────────────────────────────────────────────────
  const fixture = OFFICE_RECON_FIXTURES[property];
  if (!fixture || !year) return NextResponse.json({ error: `No recon for ${property}` }, { status: 404 });

  const config = await configFor(property, year);

  // Tenant picker: occupied units that have a lease config (can be reconciled).
  if (!unitRef) {
    const seenRefs = new Set<string>([...liveByRef.keys()]);
    const cfgYear = Object.keys(fixture.byYear).map(Number).sort((a, b) => b - a)[0];
    for (const u of fixture.byYear[cfgYear]?.roster ?? []) if (!u.isVacant) seenRefs.add(u.unitRef);
    const tenants = [...seenRefs]
      .filter((ref) => ref.startsWith(`${property}-`) && config[ref])
      .map((ref) => {
        const live = liveByRef.get(ref);
        const rosterU = (fixture.byYear[cfgYear]?.roster ?? []).find((u) => u.unitRef === ref);
        const name = live?.occupantName ?? rosterU?.occupantName ?? ref;
        const leaseTo = live?.leaseTo ?? rosterU?.leaseTo ?? null;
        const exp = parseUS(leaseTo);
        return { unitRef: ref, name, leaseTo, expiresInYear: exp?.y === year ? exp.m : null };
      })
      .sort((a, b) => a.unitRef.localeCompare(b.unitRef));
    return NextResponse.json({ tenants, kind: "office" });
  }

  if (!config[unitRef]) return NextResponse.json({ error: `${unitRef} has no lease config — it isn't reconciled.` }, { status: 404 });

  // Tenant facts: prefer the live rent roll; fall back to the seed roster.
  const cfgYear = Object.keys(fixture.byYear).map(Number).sort((a, b) => b - a)[0];
  const rosterU = (fixture.byYear[cfgYear]?.roster ?? []).find((u) => u.unitRef === unitRef);
  const live = liveByRef.get(unitRef);
  const leaseFrom = live?.leaseFrom ?? rosterU?.leaseFrom ?? null;
  const leaseTo = live?.leaseTo ?? rosterU?.leaseTo ?? null;
  const sqft = live?.sqft ?? rosterU?.sqft ?? 0;
  const name = live?.occupantName ?? rosterU?.occupantName ?? unitRef;
  const opexMonth = live?.opexMonth ?? rosterU?.opexMonth ?? 0;
  const reTaxMonth = live?.reTaxMonth ?? rosterU?.reTaxMonth ?? 0;

  // Occupied window in the recon year: lease start (if mid-year) → the as-of
  // month, default = the stated expiration month when it falls in this year.
  const start = parseUS(leaseFrom);
  const startMonth = start && start.y === year ? start.m : 1;
  const exp = parseUS(leaseTo);
  const expMonth = exp && exp.y === year ? exp.m : 12;
  const asOfMonth = Math.min(12, Math.max(1, asOfParam || expMonth));

  // GL actuals: sum the occupied window through the latest POSTED month; flag
  // any occupied months not yet posted (GL posts ~a month in arrears).
  const gl = await assembledGl(property, year);
  const maxPosted = gl?.maxPeriodInFile ?? 0;
  const effectiveThrough = Math.min(asOfMonth, maxPosted);
  const occupiedMonths = Math.max(0, effectiveThrough - startMonth + 1);
  const unpostedMonths = Math.max(0, asOfMonth - maxPosted);

  if (!gl || occupiedMonths <= 0) {
    return NextResponse.json({
      error: gl
        ? `No posted GL for ${name} through its occupied period (GL posted through month ${maxPosted}).`
        : `No GL uploaded for ${property} ${year}.`,
      meta: { property, propertyName: propName(property), unitRef, name, year, asOfMonth, maxPosted, startMonth },
    }, { status: 422 });
  }

  // Windowed YTD over the occupied, posted months (startMonth..effectiveThrough).
  const ytdRawByAccount: Record<string, number> = {};
  for (const [account, nets] of Object.entries(gl.monthly)) {
    let s = 0;
    for (let mo = startMonth; mo <= effectiveThrough; mo++) s += nets[mo - 1] || 0;
    ytdRawByAccount[account] = s;
  }

  // JV III keeps the Condo (6990) line; other buildings drop it.
  const pool = JV_III.has(property)
    ? fixture.pool
    : { ...fixture.pool, opexLines: fixture.pool.opexLines.filter((l) => !l.glAccount.startsWith("6990")) };

  const cfg = config[unitRef];
  const result = reconcileInterimTenant({
    pool,
    tenant: {
      unitRef, skylineUnit: `${unitRef}-CU`, suite: unitRef.split("-").slice(1).join("-"), name,
      baseYear: cfg.baseYear, noBaseStop: cfg.noBaseStop, grossUp: cfg.grossUp, proRataPct: cfg.proRataPct,
      sqft, occPct: 1, recoveryPct: 1,
      opexEscrow: opexMonth * occupiedMonths, retEscrow: reTaxMonth * occupiedMonths,
      camMonthly: opexMonth, retMonthly: reTaxMonth, rcd: leaseFrom,
    },
    reconYear: year,
    ytdRawByAccount,
    occupiedMonths,
    asOfMonth,
    unpostedMonths,
  });

  return NextResponse.json({
    result, kind: "office",
    meta: {
      property, propertyName: propName(property), unitRef, name, year,
      asOfMonth, effectiveThrough, occupiedMonths, unpostedMonths, maxPosted,
      startMonth, leaseFrom, leaseTo, sqft, opexMonth, reTaxMonth,
      baseYear: cfg.baseYear, proRataPct: cfg.proRataPct, grossUp: cfg.grossUp,
      glAsOf: gl.uploadedAt ?? null,
    },
  });
}

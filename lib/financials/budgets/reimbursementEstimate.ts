// CAM / INS / RET recoveries for the budget draft — the Recoveries step.
//
// Reuses the real reconciliation engine's last result, so every documented
// special case (PRS, admin fee, exclusions, gross leases, the property INS
// pool, Wawa@Brookwood, mixed centers) is already baked into each tenant's
// share. Two things move it to the budget year (see recoveryMath.ts):
//
//   • THE POOLS — the budget's own CAM, insurance and tax lines against this
//     year's, so the taxes and premium keyed in the Expenses step flow
//     straight through to what tenants are billed. Retail scales each share
//     by the pool change; office recomputes the increase over each tenant's
//     base year.
//   • THE TENANCY — the leasing assumptions: a vacate stops paying after its
//     term; a vacancy leasing up pays its pro-rata share from its start month
//     (retail — an office lease's base year is the budget year, so nothing in
//     year one); a suite the rent roll now shows vacant pays nothing.
//
// Without pools (no draft to read them from) it falls back to the old
// behaviour: last recon × the growth % for each year since.

import "server-only";
import { RETAIL_RECON_FIXTURES } from "@/lib/cam/retail/registry";
import { OFFICE_RECON_FIXTURES } from "@/lib/cam/office/registry";
import { loadRetailRecon } from "@/lib/cam/retail/loadResult";
import { loadOfficeRecon } from "@/lib/cam/office/loadResult";
import { resolveCurrentRentroll } from "@/lib/rentroll/current";
import type { LeaseAssumption } from "./leasingAssumptions";
import {
  retailRecovery, officeRecovery, retailLeaseUp, retailProRata, monthsBetween, totalRecoveries,
  type PoolRatios, type TenantRecovery,
} from "./recoveryMath";

const r0 = (n: number) => Math.round(n);
const sum = (a: number[]) => a.reduce((s, n) => s + (n || 0), 0);
const canon = (ref: string) => String(ref ?? "").toUpperCase().replace(/-CU$/, "");

/** How a tenant's share is worked out — the reconciliation's methodology,
 *  carried into the budget so the figure can be traced back to it. */
export type ReimbMethod =
  | {
      kind: "retail";
      camPrs: number; insPrs: number; retPrs: number;
      adminFeePct: number;
      grossLease: boolean;
      /** The lease's controllable-CAM cap growth %, when it has one. */
      capPct: number | null;
      /** CAM expense lines the tenant is excluded from. */
      excludedLines: number;
      /** A partial recon-year occupancy scaled up to a full year (0–1), when < 1. */
      reconOcc: number | null;
      /** The recon's own dues, the starting point. */
      recon: { cam: number; ins: number; ret: number };
    }
  | {
      kind: "office";
      proRataPct: number;
      baseYear: number | null;
      noBaseStop: boolean;
      recon: { cam: number; ins: number; ret: number };
    }
  | { kind: "leaseup"; sqft: number; startMonth: number }
  /** In place on the roll but on no reconciliation — a lease newer than it. */
  | { kind: "new"; sqft: number; assumption: "nnn" | "base-year" };

export type ReimbTenantEstimate = {
  unitRef: string;
  name: string;
  camAnnual: number; insAnnual: number; retAnnual: number;
  camMonthly: number; insMonthly: number; retMonthly: number;
  /** The budget year month by month — these add up to the recovery lines. */
  cam: number[]; ins: number[]; ret: number[];
  /** true = that month rests on a leasing ASSUMPTION (renewal, hold, lease-up),
   *  the same shading the rent-by-tenant table uses. */
  assumed: boolean[];
  /** Months of the budget year this tenant pays (12 unless a vacate/lease-up). */
  monthsActive: number;
  note?: string;
  leaseUp?: boolean;
  method?: ReimbMethod;
  /** A mixed centre's part this tenant is reconciled in (7010: retail / office). */
  portion?: "retail" | "office";
};

/** A suite's months in the budget year, as the RENT projection has them — so
 *  recoveries start and stop exactly where rent does. */
export type SuiteTenancy = {
  unitRef: string;
  tenant: string;
  sqft: number;
  months: number[];
  assumed: boolean[];
  status: "contracted" | "expiring" | "holdover" | "vacant" | "lease-up";
};

/**
 * The months a suite pays recoveries, read off its rent: from its first rent
 * month to its last (a free-rent month inside a lease still pays CAM), and
 * nothing once the rent stops — a lease that ends with no decision stops
 * paying recoveries when it stops paying rent, a renewal or hold carries on.
 * A month is ASSUMED where its rent is.
 */
export function tenancyMonths(t: SuiteTenancy): { months: boolean[]; assumed: boolean[] } {
  const on = t.months.map((v) => Math.abs(v) > 0.005);
  const first = on.indexOf(true);
  const last = on.lastIndexOf(true);
  const months = on.map((_, i) => first >= 0 && i >= first && i <= last);
  return { months, assumed: months.map((m, i) => m && !!t.assumed[i]) };
}

export type ReimbursementEstimate = {
  kind: "retail" | "office";
  propertyCode: string;
  /** The recon year the shares come from. */
  reconYear: number;
  budgetYear: number;
  growthPct: number;
  /** How the pools moved, recon year → budget year (1 = unchanged). */
  ratios: PoolRatios;
  /** True when the ratios came from the budget's own lines (not the growth %). */
  fromBudgetPools: boolean;
  /** Kept for the display: the CAM ratio. */
  factor: number;
  tenants: ReimbTenantEstimate[];
  totals: { camAnnual: number; insAnnual: number; retAnnual: number };
  /** The building's recovery income, month by month — what the draft carries. */
  monthly: { cam: number[]; ins: number[]; ret: number[] };
};

function latestYear(byYear: Record<number, unknown> | undefined): number | null {
  const ys = Object.keys(byYear ?? {}).map(Number).filter((n) => Number.isFinite(n));
  return ys.length ? Math.max(...ys) : null;
}

function parseMDY(s: string | null | undefined): { y: number; m: number } | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(s ?? "");
  if (!m) return null;
  const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
  return { y, m: Number(m[1]) };
}

export type EstimateOptions = {
  /** The budget's pools against this year's, per category (budget ÷ basis). */
  poolRatios?: PoolRatios | null;
  /** Leasing assumptions keyed by unit ref. */
  assumptions?: Record<string, LeaseAssumption>;
  /** Each suite's rent months from the lease projection. When given, a
   *  tenant pays recoveries in exactly the months it pays rent. */
  tenancy?: SuiteTenancy[];
  /** A MIXED centre (7010): the office pool's ratios, for the office tenants'
   *  own reconciliation (`mixedOfficeCode`). Absent → the retail ratios. */
  officePoolRatios?: PoolRatios | null;
  /** Internal — the suites the OTHER part of a mixed centre reconciles, so
   *  neither part lists them as a lease-up or a tenant "on no recon". */
  excludeUnits?: Set<string>;
  /** Internal — the office part of a mixed centre covers only its own suites. */
  onlyUnits?: Set<string>;
};

/** Estimate a property's tenant CAM/INS/RET recoveries for `budgetYear`, or null
 *  when the property has no recon fixture (recovery lines stay as forecast). */
export async function estimateReimbursements(
  code: string, budgetYear: number, growthPct: number, opts: EstimateOptions = {},
): Promise<ReimbursementEstimate | null> {
  const retail = RETAIL_RECON_FIXTURES[code];
  const office = OFFICE_RECON_FIXTURES[code];
  const kind: "retail" | "office" | null = retail ? "retail" : office ? "office" : null;
  if (!kind) return null;

  const reconYear = latestYear((retail ?? office)?.byYear as Record<number, unknown>);
  if (reconYear == null) return null;

  // A MIXED centre: the office tenants are reconciled separately, on the
  // office pool. Estimate them on their own (their own ratios, their own
  // suites) and keep their suites out of the retail estimate below — or an
  // office suite would ALSO be listed as a retail tenant "on no recon".
  const officeCode = !opts.onlyUnits ? retail?.mixedOfficeCode : undefined;
  let officeEst: ReimbursementEstimate | null = null;
  let officeUnits: Set<string> | undefined;
  if (officeCode && RETAIL_RECON_FIXTURES[officeCode]) {
    const oYear = latestYear(RETAIL_RECON_FIXTURES[officeCode].byYear as Record<number, unknown>);
    const oLoaded = oYear != null ? await loadRetailRecon(officeCode, oYear).catch(() => null) : null;
    officeUnits = new Set((oLoaded?.result.tenants ?? []).map((t) => canon(t.unitRef)));
    officeEst = await estimateReimbursements(officeCode, budgetYear, growthPct, {
      ...opts, poolRatios: opts.officePoolRatios ?? opts.poolRatios, onlyUnits: officeUnits,
    });
  }
  const excluded = (ref: string) => (!!officeUnits && officeUnits.has(canon(ref))) || (!!opts.excludeUnits && opts.excludeUnits.has(canon(ref)))
    || (!!opts.onlyUnits && !opts.onlyUnits.has(canon(ref)));

  // Recon year → budget year. With the budget's pools: grow by the growth %
  // from the recon year to this year (the basis), then by the budget's own
  // pool change. Without them: the growth % all the way.
  const g = 1 + (growthPct || 0) / 100;
  const gap = Math.pow(g, Math.max(0, budgetYear - 1 - reconYear));
  const pr = opts.poolRatios;
  const ratios: PoolRatios = pr
    ? { cam: gap * pr.cam, ins: gap * pr.ins, ret: gap * pr.ret }
    : (() => { const f = Math.pow(g, Math.max(0, budgetYear - reconYear)); return { cam: f, ins: f, ret: f }; })();

  // Tenancy: who is there in the budget year, per the rent roll + assumptions.
  const assumptions = opts.assumptions ?? {};
  const aOf = (ref: string) => assumptions[ref] ?? assumptions[canon(ref)]
    ?? Object.values(assumptions).find((a) => canon(a.unitRef) === canon(ref));
  const roll = pr ? await resolveCurrentRentroll().catch(() => null) : null;
  // The office part of a mixed centre ("7010O") is on the roll as the building.
  const rollCode = String((retail as { pool?: { propertyCode?: string } } | undefined)?.pool?.propertyCode ?? code).toUpperCase();
  const rollUnits = new Map<string, { isVacant: boolean; leaseTo: string | null; sqft: number }>();
  for (const p of roll?.properties ?? []) {
    if (String(p.propertyCode).toUpperCase() !== rollCode) continue;
    for (const u of p.units ?? []) {
      rollUnits.set(canon(u.unitRef), { isVacant: !!u.isVacant || !u.occupantName, leaseTo: u.leaseTo ?? null, sqft: u.sqft || 0 });
    }
  }
  const rows = new Map<string, SuiteTenancy>();
  for (const t of opts.tenancy ?? []) rows.set(canon(t.unitRef), t);
  const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  /** The months a tenant already in place pays, which of them are assumed,
   *  and why the year is short. */
  // A BACKED-OUT lease (Rite Aid at 7010, in bankruptcy) pays no recoveries
  // from its month whichever path found its tenancy — including the fallbacks
  // below that assume a full year when a recon tenant matches no rent row.
  const tenancy = (ref: string): { months: boolean[]; assumed: boolean[]; note?: string } => {
    const t = tenancyOf(ref);
    const a = aOf(ref);
    if (a?.kind !== "stop") return t;
    const from = Math.min(12, Math.max(1, a.startMonth ?? 1));
    const months = t.months.map((on, i) => on && i < from - 1);
    return { months, assumed: t.assumed.map((x, i) => x && months[i]), note: `Backed out from ${MONTH[from - 1]} — no rent or recoveries` };
  };
  const tenancyOf = (ref: string): { months: boolean[]; assumed: boolean[]; note?: string } => {
    const none = new Array(12).fill(false) as boolean[];
    if (!pr) return { months: monthsBetween(1, 12), assumed: none };
    const row = rows.get(canon(ref));
    if (row) {
      if (row.status === "vacant" || row.status === "lease-up") {
        return { months: none, assumed: none, note: row.status === "lease-up" ? "Suite is vacant — the lease-up is below" : "Suite is vacant" };
      }
      const { months, assumed } = tenancyMonths(row);
      const n = months.filter(Boolean).length;
      const a = aOf(ref);
      let note: string | undefined;
      if (n === 0) note = row.status === "holdover" ? "Holdover — no decision yet, so no rent or recoveries" : "No rent this year";
      else if (months[11] === false) {
        const lastM = months.lastIndexOf(true);
        note = a?.kind === "vacate" ? `Vacates — pays through ${MONTH[lastM]}` : `Lease ends ${MONTH[lastM]} — no decision yet`;
      } else if (assumed.some(Boolean)) {
        const from = assumed.indexOf(true);
        note = `${a?.kind === "hold" || a?.kind === "renew" ? "Renews" : "Assumed"} from ${MONTH[from]}`;
      }
      return { months, assumed, note };
    }
    const u = rollUnits.get(canon(ref));
    if (u?.isVacant && aOf(ref)?.kind !== "leaseup") return { months: none, assumed: none, note: "Suite is vacant on the rent roll" };
    const a = aOf(ref);
    if (a?.kind === "vacate") {
      const end = parseMDY(u?.leaseTo);
      const last = !end ? 12 : end.y < budgetYear ? 0 : end.y > budgetYear ? 12 : end.m;
      return { months: monthsBetween(1, last), assumed: none, note: last < 12 ? `Vacates — pays through ${u?.leaseTo ?? "term end"}` : undefined };
    }
    return { months: monthsBetween(1, 12), assumed: none };
  };

  const recs: TenantRecovery[] = [];
  const extra = new Map<TenantRecovery, { assumed: boolean[]; method?: ReimbMethod }>();

  if (kind === "retail") {
    const loaded = await loadRetailRecon(code, reconYear);
    if (!loaded) return null;
    const ts = loaded.result.tenants;
    for (const t of ts) {
      // A tenant who left during the recon year is not in the budget year.
      if (t.vacatedISO && Number(String(t.vacatedISO).slice(0, 4)) <= reconYear) continue;
      const { months, assumed, note } = tenancy(t.unitRef);
      // A tenant in place for part of the recon year was billed a part-year
      // share; the budget year is a full one, so scale it back up (a fixed
      // RET is a fixed figure, not an occupancy share).
      const occ = t.occPct > 0 && t.occPct < 1 ? t.occPct : 1;
      const rec = retailRecovery({
        unitRef: t.unitRef, name: t.name, sqft: t.sqft,
        camDue: t.camDue / occ, insDue: t.insDue / occ, retDue: t.flatRet != null ? t.retDue : t.retDue / occ,
        capped: t.capped, capGrowthPct: t.camCap?.growthPct ?? null,
      }, ratios, months, note);
      recs.push(rec);
      extra.set(rec, {
        assumed,
        method: {
          kind: "retail", camPrs: t.camPrs, insPrs: t.insPrs, retPrs: t.retPrs, adminFeePct: t.adminFeePct,
          grossLease: !!t.grossLease, capPct: t.camCap?.growthPct ?? null,
          excludedLines: t.camExcludedLabels?.length ?? 0,
          reconOcc: occ < 1 ? occ : null,
          recon: { cam: r0(t.camDue), ins: r0(t.insDue), ret: r0(t.retDue) },
        },
      });
    }
    // Vacancies leasing up, and tenants newer than the reconciliation: their
    // pro-rata share of each budget pool — assumed NNN.
    if (pr) {
      const first = ts.find((t) => t.camDenom > 0) ?? ts[0];
      const pools = {
        cam: (first?.camPoolFull ?? 0) * ratios.cam,
        ins: (first?.insPool ?? 0) * ratios.ins,
        ret: (first?.retPool ?? 0) * ratios.ret,
      };
      const denoms = { cam: first?.camDenom ?? 0, ins: first?.insDenom ?? 0, ret: first?.retDenom ?? 0 };
      for (const a of Object.values(assumptions)) {
        if (a.kind !== "leaseup" || excluded(a.unitRef)) continue;
        const row = rows.get(canon(a.unitRef));
        // Only a suite that is actually vacant leases up.
        if (row && row.status !== "lease-up" && row.status !== "vacant") continue;
        const sqft = rollUnits.get(canon(a.unitRef))?.sqft || row?.sqft || 0;
        if (!sqft) continue;
        const start = a.startMonth ?? 1;
        const rec = retailLeaseUp(a.unitRef, sqft, start, pools, denoms);
        recs.push(rec);
        extra.set(rec, { assumed: rec.months.slice(), method: { kind: "leaseup", sqft, startMonth: start } });
      }
      const onRecon = new Set(ts.filter((t) => !(t.vacatedISO && Number(String(t.vacatedISO).slice(0, 4)) <= reconYear)).map((t) => canon(t.unitRef)));
      for (const row of rows.values()) {
        if (row.status === "vacant" || row.status === "lease-up" || onRecon.has(canon(row.unitRef)) || excluded(row.unitRef)) continue;
        const { months, assumed } = tenancyMonths(row);
        if (!months.some(Boolean) || !(row.sqft > 0)) continue;
        const rec = retailProRata(row.unitRef, row.tenant || "New tenant", row.sqft, months, pools, denoms,
          `Not on the ${reconYear} reconciliation — assumed NNN at its pro-rata share`);
        recs.push(rec);
        extra.set(rec, { assumed, method: { kind: "new", sqft: row.sqft, assumption: "nnn" } });
      }
    }
  } else {
    const loaded = await loadOfficeRecon(code, reconYear);
    if (!loaded) return null;
    for (const t of loaded.result.tenants) {
      if (t.isVacant) continue;
      const { months, assumed, note } = tenancy(t.unitRef);
      const method: ReimbMethod = {
        kind: "office", proRataPct: t.proRataPct, baseYear: t.baseYear ?? null, noBaseStop: !!t.noBaseStop,
        recon: { cam: r0(t.opexAmountDue), ins: 0, ret: r0(t.retAmountDue) },
      };
      if (!pr) {
        // No budget pools to recompute the increase on: last bill × growth.
        const rec = retailRecovery({ unitRef: t.unitRef, name: t.name, sqft: t.sqft, camDue: t.opexAmountDue, insDue: 0, retDue: t.retAmountDue }, ratios, months, note);
        recs.push(rec); extra.set(rec, { assumed, method });
        continue;
      }
      const rec = officeRecovery({
        unitRef: t.unitRef, name: t.name, sqft: t.sqft,
        proRataPct: t.proRataPct,
        opexBaseTotal: t.opexBaseTotal, opexActualTotal: t.opexActualTotal,
        retBase: t.retLine?.baseCost ?? 0, retActual: t.retLine?.actual ?? 0,
        noBaseStop: t.noBaseStop,
      }, ratios, months, note);
      recs.push(rec); extra.set(rec, { assumed, method });
    }
    // A lease newer than the reconciliation — or an office lease-up — has the
    // budget year (or a year after the recon) as its base year: no increase to
    // recover yet. Listed with a zero so the table says why, rather than
    // leaving the suite silently blank.
    if (pr) {
      const onRecon = new Set(loaded.result.tenants.filter((t) => !t.isVacant).map((t) => canon(t.unitRef)));
      for (const row of rows.values()) {
        if (row.status === "vacant" || onRecon.has(canon(row.unitRef))) continue;
        const { months } = tenancyMonths(row);
        if (!months.some(Boolean)) continue;
        const zero = new Array(12).fill(0);
        const rec: TenantRecovery = {
          unitRef: row.unitRef, name: row.tenant || "New tenant", months, camYear: 0, insYear: 0, retYear: 0,
          cam: zero.slice(), ins: zero.slice(), ret: zero.slice(),
          note: `Base year ${budgetYear} — nothing to recover until ${budgetYear + 1}`,
        };
        recs.push(rec);
        extra.set(rec, { assumed: row.assumed.slice(), method: { kind: "new", sqft: row.sqft, assumption: "base-year" } });
      }
    }
  }

  const monthly = totalRecoveries(recs);
  if (officeEst) {
    for (const k of ["cam", "ins", "ret"] as const) officeEst.monthly[k].forEach((v, i) => { monthly[k][i] += v; });
  }
  const tenants: ReimbTenantEstimate[] = recs.map((t) => {
    const active = t.months.filter(Boolean).length;
    const x = extra.get(t);
    return {
      unitRef: t.unitRef, name: t.name,
      camAnnual: sum(t.cam), insAnnual: sum(t.ins), retAnnual: sum(t.ret),
      camMonthly: r0(t.camYear / 12), insMonthly: r0(t.insYear / 12), retMonthly: r0(t.retYear / 12),
      cam: t.cam, ins: t.ins, ret: t.ret,
      assumed: x?.assumed ?? new Array(12).fill(false),
      monthsActive: active, note: t.note, leaseUp: t.leaseUp, method: x?.method,
      ...(officeCode ? { portion: "retail" as const } : {}),
    };
  });
  if (officeEst) tenants.push(...officeEst.tenants.map((t) => ({ ...t, portion: "office" as const })));
  const totals = { camAnnual: sum(monthly.cam), insAnnual: sum(monthly.ins), retAnnual: sum(monthly.ret) };
  return {
    kind, propertyCode: code, reconYear, budgetYear, growthPct,
    ratios: { cam: round4(ratios.cam), ins: round4(ratios.ins), ret: round4(ratios.ret) },
    fromBudgetPools: !!pr,
    factor: round4(ratios.cam),
    tenants, totals, monthly,
  };
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;

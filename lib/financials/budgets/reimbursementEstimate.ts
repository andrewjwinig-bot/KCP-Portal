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
  retailRecovery, officeRecovery, retailLeaseUp, monthsBetween, totalRecoveries,
  type PoolRatios, type TenantRecovery,
} from "./recoveryMath";

const r0 = (n: number) => Math.round(n);
const sum = (a: number[]) => a.reduce((s, n) => s + (n || 0), 0);
const canon = (ref: string) => String(ref ?? "").toUpperCase().replace(/-CU$/, "");

export type ReimbTenantEstimate = {
  unitRef: string;
  name: string;
  camAnnual: number; insAnnual: number; retAnnual: number;
  camMonthly: number; insMonthly: number; retMonthly: number;
  /** Months of the budget year this tenant pays (12 unless a vacate/lease-up). */
  monthsActive: number;
  note?: string;
  leaseUp?: boolean;
};

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
  const rollUnits = new Map<string, { isVacant: boolean; leaseTo: string | null; sqft: number }>();
  for (const p of roll?.properties ?? []) {
    if (String(p.propertyCode).toUpperCase() !== code.toUpperCase()) continue;
    for (const u of p.units ?? []) {
      rollUnits.set(canon(u.unitRef), { isVacant: !!u.isVacant || !u.occupantName, leaseTo: u.leaseTo ?? null, sqft: u.sqft || 0 });
    }
  }
  /** The months a tenant already in place pays, and why the year is short. */
  const tenancy = (ref: string): { months: boolean[]; note?: string } => {
    if (!pr) return { months: monthsBetween(1, 12) };
    const u = rollUnits.get(canon(ref));
    if (u?.isVacant && aOf(ref)?.kind !== "leaseup") return { months: monthsBetween(1, 0), note: "Suite is vacant on the rent roll" };
    const a = aOf(ref);
    if (a?.kind === "vacate") {
      const end = parseMDY(u?.leaseTo);
      const last = !end ? 12 : end.y < budgetYear ? 0 : end.y > budgetYear ? 12 : end.m;
      return { months: monthsBetween(1, last), note: last < 12 ? `Vacates — pays through ${u?.leaseTo ?? "term end"}` : undefined };
    }
    return { months: monthsBetween(1, 12) };
  };

  const recs: TenantRecovery[] = [];
  const seen = new Set<string>();

  if (kind === "retail") {
    const loaded = await loadRetailRecon(code, reconYear);
    if (!loaded) return null;
    const ts = loaded.result.tenants;
    for (const t of ts) {
      seen.add(canon(t.unitRef));
      const { months, note } = tenancy(t.unitRef);
      recs.push(retailRecovery({
        unitRef: t.unitRef, name: t.name, sqft: t.sqft,
        camDue: t.camDue, insDue: t.insDue, retDue: t.retDue,
        capped: t.capped, capGrowthPct: t.camCap?.growthPct ?? null,
      }, ratios, months, note));
    }
    // Vacancies leasing up: their pro-rata share of each budget pool.
    if (pr) {
      const first = ts.find((t) => t.camDenom > 0) ?? ts[0];
      const pools = {
        cam: (first?.camPoolFull ?? 0) * ratios.cam,
        ins: (first?.insPool ?? 0) * ratios.ins,
        ret: (first?.retPool ?? 0) * ratios.ret,
      };
      const denoms = { cam: first?.camDenom ?? 0, ins: first?.insDenom ?? 0, ret: first?.retDenom ?? 0 };
      for (const a of Object.values(assumptions)) {
        if (a.kind !== "leaseup" || seen.has(canon(a.unitRef))) continue;
        const u = rollUnits.get(canon(a.unitRef));
        if (!u) continue;
        recs.push(retailLeaseUp(a.unitRef, u.sqft, a.startMonth ?? 1, pools, denoms));
      }
    }
  } else {
    const loaded = await loadOfficeRecon(code, reconYear);
    if (!loaded) return null;
    for (const t of loaded.result.tenants) {
      if (t.isVacant) continue;
      const { months, note } = tenancy(t.unitRef);
      if (!pr) {
        // No budget pools to recompute the increase on: last bill × growth.
        recs.push(retailRecovery({ unitRef: t.unitRef, name: t.name, sqft: t.sqft, camDue: t.opexAmountDue, insDue: 0, retDue: t.retAmountDue }, ratios, months, note));
        continue;
      }
      recs.push(officeRecovery({
        unitRef: t.unitRef, name: t.name, sqft: t.sqft,
        proRataPct: t.proRataPct,
        opexBaseTotal: t.opexBaseTotal, opexActualTotal: t.opexActualTotal,
        retBase: t.retLine?.baseCost ?? 0, retActual: t.retLine?.actual ?? 0,
        noBaseStop: t.noBaseStop,
      }, ratios, months, note));
    }
    // An office lease-up's base year is the budget year: no increase to
    // recover in year one, so it adds nothing here — by design.
  }

  const monthly = totalRecoveries(recs);
  const tenants: ReimbTenantEstimate[] = recs.map((t) => {
    const active = t.months.filter(Boolean).length;
    return {
      unitRef: t.unitRef, name: t.name,
      camAnnual: sum(t.cam), insAnnual: sum(t.ins), retAnnual: sum(t.ret),
      camMonthly: r0(t.camYear / 12), insMonthly: r0(t.insYear / 12), retMonthly: r0(t.retYear / 12),
      monthsActive: active, note: t.note, leaseUp: t.leaseUp,
    };
  });
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

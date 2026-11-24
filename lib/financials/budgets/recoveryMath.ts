// Budget-year tenant recoveries (CAM / insurance / real estate tax) — the math.
//
// Each tenant keeps the SHARE the last reconciliation gave them, because
// everything that makes a share particular — PRS, admin fee, exclusions, gross
// leases, the property insurance pool, Wawa at Brookwood — is already inside
// that result. What changes is the POOL: the budget's own CAM, insurance and
// tax lines, including the figures keyed in the Expenses step. So:
//
//   RETAIL   budget due = last recon due × (budget pool ÷ recon-year pool)
//            — a capped tenant grows no faster than its cap.
//   OFFICE   budget due = max(0, budget pool − the tenant's base-year pool)
//            × pro-rata share. An office tenant pays the INCREASE over its
//            base year, so scaling last year's bill by the pool change would be
//            wrong — a 5% pool rise can double a small increase.
//
// Then the year is cut to the months the tenant is actually there, following
// the leasing assumptions: a vacate stops paying after the term ends; a
// vacancy that leases up pays its pro-rata (SF) share from its start month —
// retail at once, office not in year one (its base year IS the budget year).
//
// Pure — no storage — so it is tested directly.

export type PoolRatios = { cam: number; ins: number; ret: number };

export type RetailTenantIn = {
  unitRef: string; name: string; sqft: number;
  camDue: number; insDue: number; retDue: number;
  capped?: boolean; capGrowthPct?: number | null;
};

/** One Op Ex line of an office tenant's schedule. `budget` is the line's own
 *  budget-year figure (the draft's GL account, on the tenant's gross-up basis);
 *  without it the line is its recon-year actual × the building's Op Ex change. */
export type OfficeLineIn = { label?: string; account?: string; actual: number; baseCost: number; budget?: number };
/** The line-by-line working behind an office tenant's Op Ex. */
export type OfficeLineOut = { label: string; account: string; budget: number; base: number; over: number; fromLine: boolean };

export type OfficeTenantIn = {
  unitRef: string; name: string; sqft: number;
  proRataPct: number;
  opexBaseTotal: number; opexActualTotal: number;
  retBase: number; retActual: number;
  noBaseStop?: boolean;
  /** Each Op Ex line's recon-year actual and base-year cost. With them the
   *  base-year stop is applied LINE BY LINE, as the reconciliation applies it:
   *  a line below its base contributes $0 and never offsets one above. */
  opexLines?: OfficeLineIn[];
  /** The rare lease whose stop is on the Op Ex TOTAL, not line by line. */
  aggregateBaseYear?: boolean;
  /** The base year is after the last reconciliation, so its dollars are not
   *  known yet (the recon's history reads $0 for it). Nothing is budgeted —
   *  never the full share against a $0 base. */
  baseUnknown?: boolean;
};

export type TenantRecovery = {
  unitRef: string; name: string;
  /** Months of the budget year the tenant pays recoveries (0–12). */
  months: boolean[];
  /** Full-year amounts before the months cut. */
  camYear: number; insYear: number; retYear: number;
  /** Monthly billing (the estimate, 1/12 of the year) on each active month. */
  cam: number[]; ins: number[]; ret: number[];
  /** Why the year is short, when it is. */
  note?: string;
  leaseUp?: boolean;
  /** Office: each Op Ex line's budget against its base (line-by-line stop). */
  opexDetail?: OfficeLineOut[];
};

const r0 = (n: number) => Math.round(n);
const ALL = () => new Array(12).fill(true);

/** Active months from a start month (1–12) through an end month (1–12). */
export function monthsBetween(start: number, end: number): boolean[] {
  return Array.from({ length: 12 }, (_, i) => i + 1 >= start && i + 1 <= end);
}

/** A twelfth of the year on each active month, in whole dollars that add back
 *  exactly: a full year sums to the annual figure, not to 12 × a rounded month. */
function spread(year: number, months: boolean[]): number[] {
  const active = months.filter(Boolean).length;
  const target = r0((year * active) / 12);
  const out = months.map(() => 0);
  if (!active) return out;
  const base = Math.floor(target / active);
  let left = target - base * active;
  months.forEach((on, i) => { if (on) { out[i] = base + (left > 0 ? 1 : 0); if (left > 0) left--; } });
  return out;
}

export function retailRecovery(t: RetailTenantIn, ratio: PoolRatios, months: boolean[] = ALL(), note?: string): TenantRecovery {
  let camRatio = ratio.cam;
  // A capped tenant's CAM grows no faster than its cap allows.
  if (t.capped && t.capGrowthPct != null) camRatio = Math.min(camRatio, 1 + t.capGrowthPct / 100);
  const camYear = r0(t.camDue * camRatio);
  const insYear = r0(t.insDue * ratio.ins);
  const retYear = r0(t.retDue * ratio.ret);
  return {
    unitRef: t.unitRef, name: t.name, months, note,
    camYear, insYear, retYear,
    cam: spread(camYear, months), ins: spread(insYear, months), ret: spread(retYear, months),
  };
}

export function officeRecovery(t: OfficeTenantIn, ratio: PoolRatios, months: boolean[] = ALL(), note?: string): TenantRecovery {
  const share = (t.proRataPct || 0) / 100;
  const opexBudget = t.opexActualTotal * ratio.cam;
  const retBudget = t.retActual * ratio.ret;
  const opexBase = t.noBaseStop ? 0 : t.opexBaseTotal;
  const retBase = t.noBaseStop ? 0 : t.retBase;
  // Line by line, as the recon does, unless the lease stops on the total. A
  // tenant pays nothing on a line (or a total) that sits at or below its base.
  if (t.baseUnknown) return {
    unitRef: t.unitRef, name: t.name, months, note: note ?? "Base year after the last reconciliation — its base is not known yet, so nothing is budgeted",
    camYear: 0, insYear: 0, retYear: 0, cam: new Array(12).fill(0), ins: new Array(12).fill(0), ret: new Array(12).fill(0),
  };
  // Each line's own budget where the draft has one, else its actual × the
  // building's Op Ex change.
  const lines = (t.opexLines ?? []).map((l) => {
    const budget = l.budget ?? l.actual * ratio.cam;
    const base = t.noBaseStop ? 0 : l.baseCost;
    return { label: l.label ?? l.account ?? "", account: l.account ?? "", budget: r0(budget), base: r0(base), over: r0(Math.max(0, budget - base)), fromLine: l.budget != null };
  });
  const opexIncrease = !lines.length
    ? Math.max(0, opexBudget - opexBase)
    : t.noBaseStop || t.aggregateBaseYear
      ? Math.max(0, lines.reduce((a, l) => a + l.budget, 0) - (t.noBaseStop ? 0 : t.opexBaseTotal))
      : lines.reduce((a, l) => a + l.over, 0);
  const camYear = r0(opexIncrease * share);
  const retYear = r0(Math.max(0, retBudget - retBase) * share);
  return {
    unitRef: t.unitRef, ...(lines.length ? { opexDetail: lines } : {}), name: t.name, months, note,
    camYear, insYear: 0, retYear,
    cam: spread(camYear, months), ins: new Array(12).fill(0), ret: spread(retYear, months),
  };
}

/**
 * A tenant on no reconciliation, RETAIL — assumed NNN: its pro-rata (SF) share
 * of each budget pool, in the months given. No admin fee and no exclusions —
 * nothing on file says otherwise, and pro-rata is the conservative assumption.
 */
export function retailProRata(
  unitRef: string, name: string, sqft: number, months: boolean[],
  pools: { cam: number; ins: number; ret: number },
  denoms: { cam: number; ins: number; ret: number },
  note?: string,
): TenantRecovery {
  const part = (pool: number, denom: number) => (denom > 0 ? (pool * sqft) / denom : 0);
  const camYear = r0(part(pools.cam, denoms.cam));
  const insYear = r0(part(pools.ins, denoms.ins));
  const retYear = r0(part(pools.ret, denoms.ret));
  return {
    unitRef, name, months, note,
    camYear, insYear, retYear,
    cam: spread(camYear, months), ins: spread(insYear, months), ret: spread(retYear, months),
  };
}

/** A vacancy leasing up, RETAIL: assumed NNN from its start month. */
export function retailLeaseUp(
  unitRef: string, sqft: number, startMonth: number,
  pools: { cam: number; ins: number; ret: number },
  denoms: { cam: number; ins: number; ret: number },
): TenantRecovery {
  const months = monthsBetween(Math.min(12, Math.max(1, startMonth)), 12);
  return {
    ...retailProRata(unitRef, "Lease-up (assumed)", sqft, months, pools, denoms, `Assumed lease-up from month ${startMonth}, at its pro-rata share`),
    leaseUp: true,
  };
}

/** Sum tenants' monthly billing into the building's recovery income. */
export function totalRecoveries(ts: TenantRecovery[]): { cam: number[]; ins: number[]; ret: number[] } {
  const out = { cam: new Array(12).fill(0), ins: new Array(12).fill(0), ret: new Array(12).fill(0) };
  for (const t of ts) for (let i = 0; i < 12; i++) {
    out.cam[i] += t.cam[i]; out.ins[i] += t.ins[i]; out.ret[i] += t.ret[i];
  }
  return out;
}

// The office reconciliation engine. Pure functions: pool + tenant inputs in,
// per-tenant statements + building summary out. No I/O, so it's trivially
// unit-tested against a known-good workbook (see compute.test.ts).

import type {
  OfficeExpensePool,
  OfficeTenantInput,
  ReconScheduleLine,
  TenantReconResult,
  BuildingReconResult,
} from "./types";

/** Dollars booked to a GL account in a year; missing → $0 (an empty base
 *  year means the tenant reconciles against the full pool). */
function amountFor(pool: OfficeExpensePool, account: string, year: number): number {
  return pool.values[account]?.[String(year)] ?? 0;
}

/** Earliest year for which the pool's operating-expense / RET accounts carry
 *  any data. Used to flag a base year that predates the history — which would
 *  silently recover against a $0 base (the full current-year pool) and badly
 *  over-bill the tenant. Returns null for an empty pool. */
function earliestPoolYear(pool: OfficeExpensePool): number | null {
  const accounts = [pool.retAccount, ...pool.opexLines.map((l) => l.glAccount)];
  let min = Infinity;
  for (const acct of accounts) {
    for (const y of Object.keys(pool.values[acct] ?? {})) {
      const n = Number(y);
      if (Number.isFinite(n) && n < min) min = n;
    }
  }
  return min === Infinity ? null : min;
}

/** Current-year expense for an account, applying any FINAL overrides from
 *  the Final Expense Summary. A FINAL is keyed by the raw GL account; a
 *  "-95" grossed-up variant scales by the same ratio so the gross-up holds.
 *  Falls back to the pool when no FINAL is supplied. */
function actualFor(
  pool: OfficeExpensePool,
  account: string,
  year: number,
  finals?: Record<string, number>,
): number {
  if (!finals) return amountFor(pool, account, year);
  if (finals[account] != null) return finals[account];
  if (account.endsWith("-95")) {
    const raw = account.slice(0, -3);
    if (finals[raw] != null) {
      const seedRaw = amountFor(pool, raw, year);
      const seed95 = amountFor(pool, account, year);
      return seedRaw !== 0 ? seed95 * (finals[raw] / seedRaw) : seed95;
    }
  }
  return amountFor(pool, account, year);
}

/** Snow Removal is GL 6370 (any suffix, incl. a "-95" gross-up variant); the
 *  label is a fallback for oddly-numbered pools. */
function isSnowAccount(account: string, label: string): boolean {
  return /^6370\b/.test(account) || /snow/i.test(label);
}

/** How much of the base-year snow to zero out for a given recon year (0 → no
 *  exclusion / full base; 1 → fully excluded). In the effective year it prorates
 *  by month: excluded from the reset month through December, i.e. (13−month)/12.
 *  Every year after the effective year is fully excluded. */
export function snowExclusionFraction(
  ex: { effectiveMonth: number; effectiveYear: number } | null | undefined,
  reconYear: number,
): number {
  if (!ex) return 0;
  if (reconYear < ex.effectiveYear) return 0;
  if (reconYear > ex.effectiveYear) return 1;
  const m = Math.min(12, Math.max(1, Math.round(ex.effectiveMonth)));
  return (13 - m) / 12;
}

function scheduleLine(
  pool: OfficeExpensePool,
  account: string,
  label: string,
  baseYear: number,
  reconYear: number,
  finals?: Record<string, number>,
  noBaseStop?: boolean,
): ReconScheduleLine {
  // A true-NNN tenant has no base-year stop: it recovers its share of the
  // full current-year expense, so the base cost is $0 (no floor).
  const baseCost = noBaseStop ? 0 : amountFor(pool, account, baseYear);
  const actual = actualFor(pool, account, reconYear, finals);
  return { glAccount: account, label, baseCost, actual, netIncrease: Math.max(0, actual - baseCost) };
}

/** Reconcile a single tenant for one year. `finals` (account → FINAL) lets
 *  the Final Expense Summary override the current-year expense pool. */
export function reconcileTenant(
  pool: OfficeExpensePool,
  t: OfficeTenantInput,
  reconYear: number,
  finals?: Record<string, number>,
): TenantReconResult {
  const share = t.proRataPct / 100;
  // A true-NNN tenant pays its share of the full expense with no base-year
  // stop (base cost $0). Otherwise a base year after the reconciliation year
  // means the floor hasn't been set yet — nothing is due.
  const noBaseStop = !!t.noBaseStop;
  const futureBase = !noBaseStop && t.baseYear > reconYear;

  // Snow base-year exclusion: zero (or prorate toward zero) the Snow Removal
  // line's base cost, so the tenant recovers its full share of current-year
  // snow. Moot for a true-NNN tenant (already no base) or a future base year.
  const snowFraction = !noBaseStop && !futureBase ? snowExclusionFraction(t.snowExclusion, reconYear) : 0;

  const opexLines = pool.opexLines.map((line) => {
    const useGrossUp = t.grossUp && !!line.grossUpAccount;
    const account = useGrossUp ? line.grossUpAccount! : line.glAccount;
    const label = useGrossUp ? `${line.label} (95%)` : line.label;
    const sl = scheduleLine(pool, account, label, t.baseYear, reconYear, finals, noBaseStop);
    if (futureBase) sl.netIncrease = 0;
    else if (snowFraction > 0 && isSnowAccount(account, label)) {
      sl.baseCost = sl.baseCost * (1 - snowFraction);
      sl.netIncrease = Math.max(0, sl.actual - sl.baseCost);
    }
    return sl;
  });

  const opexBaseTotal = opexLines.reduce((a, l) => a + l.baseCost, 0);
  const opexActualTotal = opexLines.reduce((a, l) => a + l.actual, 0);
  const opexNetIncrease = opexLines.reduce((a, l) => a + l.netIncrease, 0);
  const opexAmountDue = opexNetIncrease * share * t.recoveryPct;
  const opexBalance = opexAmountDue - t.opexEscrow;

  const retLine = scheduleLine(pool, pool.retAccount, pool.retLabel, t.baseYear, reconYear, finals, noBaseStop);
  if (futureBase) retLine.netIncrease = 0;
  const retAmountDue = retLine.netIncrease * share * t.recoveryPct;
  const retBalance = retAmountDue - t.retEscrow;

  // Data-integrity guard: a base year before the pool's earliest data means
  // every base cost reads as $0, so the tenant recovers the full current-year
  // pool instead of the increase over its base — a large silent over-bill.
  // Surface it rather than letting it flow through as a (wrong) number.
  // (A true-NNN tenant recovers the full pool by design, so it's exempt.)
  const dataWarnings: string[] = [];
  if (!futureBase && !noBaseStop) {
    const earliest = earliestPoolYear(pool);
    if (earliest != null && t.baseYear < earliest) {
      dataWarnings.push(
        `Base year ${t.baseYear} predates the expense history (earliest ${earliest}) — recovery is computed against a $0 base, which over-recovers. Verify the base year or extend the expense history.`,
      );
    }
  }

  return {
    unitRef: t.unitRef,
    skylineUnit: t.skylineUnit,
    suite: t.suite,
    name: t.name,
    baseYear: t.baseYear,
    grossUp: t.grossUp,
    proRataPct: t.proRataPct,
    sqft: t.sqft,
    occPct: t.occPct,
    recoveryPct: t.recoveryPct,
    isVacant: false,
    baseYearResetISO: t.baseYearResetISO ?? null,
    futureBaseYear: futureBase,
    noBaseStop: noBaseStop || undefined,
    snowBaseExcluded: snowFraction > 0 && t.snowExclusion
      ? { effectiveMonth: t.snowExclusion.effectiveMonth, effectiveYear: t.snowExclusion.effectiveYear, fraction: snowFraction }
      : undefined,
    rcd: t.rcd ?? null,
    dataWarnings: dataWarnings.length ? dataWarnings : undefined,
    opexLines,
    opexBaseTotal,
    opexActualTotal,
    opexNetIncrease,
    opexAmountDue,
    opexEscrow: t.opexEscrow,
    opexBalance,
    retLine,
    retAmountDue,
    retEscrow: t.retEscrow,
    retBalance,
    camMonthly: t.camMonthly ?? 0,
    retMonthly: t.retMonthly ?? 0,
  };
}

export function reconcileBuilding(
  pool: OfficeExpensePool,
  tenants: OfficeTenantInput[],
  reconYear: number,
  finals?: Record<string, number>,
): BuildingReconResult {
  const results = tenants.map((t) => reconcileTenant(pool, t, reconYear, finals));
  const totals = results.reduce(
    (acc, r) => {
      acc.opexAmountDue += r.opexAmountDue;
      acc.opexEscrow += r.opexEscrow;
      acc.opexBalance += r.opexBalance;
      acc.retAmountDue += r.retAmountDue;
      acc.retEscrow += r.retEscrow;
      acc.retBalance += r.retBalance;
      return acc;
    },
    { opexAmountDue: 0, opexEscrow: 0, opexBalance: 0, retAmountDue: 0, retEscrow: 0, retBalance: 0 },
  );
  return { propertyCode: pool.propertyCode, reconYear, rentableSqft: pool.rentableSqft, tenants: results, totals };
}

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

function scheduleLine(
  pool: OfficeExpensePool,
  account: string,
  label: string,
  baseYear: number,
  reconYear: number,
  finals?: Record<string, number>,
): ReconScheduleLine {
  const baseCost = amountFor(pool, account, baseYear);
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
  // A base year after the reconciliation year means the tenant's expense
  // floor hasn't been set yet — there's no increase to recover, so nothing
  // is due (every line's net increase is forced to zero).
  const futureBase = t.baseYear > reconYear;

  const opexLines = pool.opexLines.map((line) => {
    const useGrossUp = t.grossUp && !!line.grossUpAccount;
    const account = useGrossUp ? line.grossUpAccount! : line.glAccount;
    const label = useGrossUp ? `${line.label} (95%)` : line.label;
    const sl = scheduleLine(pool, account, label, t.baseYear, reconYear, finals);
    if (futureBase) sl.netIncrease = 0;
    return sl;
  });

  const opexBaseTotal = opexLines.reduce((a, l) => a + l.baseCost, 0);
  const opexActualTotal = opexLines.reduce((a, l) => a + l.actual, 0);
  const opexNetIncrease = opexLines.reduce((a, l) => a + l.netIncrease, 0);
  const opexAmountDue = opexNetIncrease * share * t.occPct;
  const opexBalance = opexAmountDue - t.opexEscrow;

  const retLine = scheduleLine(pool, pool.retAccount, pool.retLabel, t.baseYear, reconYear, finals);
  if (futureBase) retLine.netIncrease = 0;
  const retAmountDue = retLine.netIncrease * share * t.occPct;
  const retBalance = retAmountDue - t.retEscrow;

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
    isVacant: false,
    baseYearResetISO: t.baseYearResetISO ?? null,
    futureBaseYear: futureBase,
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
  return { propertyCode: pool.propertyCode, reconYear, tenants: results, totals };
}

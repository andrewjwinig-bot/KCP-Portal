// WHAT EACH EXPENSE LINE ACTUALLY RECOVERED — office buildings (owner,
// 11/2026: "show as a $ and % of each line item what the recoveries were …
// since each expense is calculated on its own line against the base year").
//
// Pure: a reconciled building (compute.ts) in, one row per operating-expense
// line (+ RET) out, with the dollars billed to tenants for that line, the
// share of the booked expense that is, and where the rest went:
//   · base years — each tenant's share of the line up to its base-year cost
//     (the stop), which the lease says the landlord absorbs;
//   · vacancy & not billed — the share of space with no reconciling tenant
//     (vacant, gross leases, amenity space, part-year occupancy);
//   · gross-up — a lease grossed up to 95% recovers on MORE than was booked,
//     so it reads as a negative loss (it adds to the recovery).
// recovered + base years + vacancy − gross-up = the booked expense, exactly.
//
// A lease with a base-year stop on the expense TOTAL (aggregateBaseYear —
// Robert Half 4070-201, ISD Renal 3620-110) has no per-line answer: its
// amount due is spread over the lines in proportion to how far each rose
// above its base, and the row counts it (`viaTotalStop`).

import type { BuildingReconResult, OfficeExpensePool, ReconScheduleLine } from "./types";

export type LineRecovery = {
  glAccount: string;
  label: string;
  /** The booked expense for the year (the FINAL where one was set). */
  expense: number;
  /** Billed to tenants through the reconciliation (amount due). */
  recovered: number;
  /** recovered ÷ expense (0 when there is no expense). */
  pct: number;
  /** Absorbed under the tenants' base-year stops. */
  lostToBaseYears: number;
  /** The share of space with no reconciling tenant. */
  lostToVacancy: number;
  /** Extra recovered because a lease grosses the line up to 95% (≥ 0). */
  grossUpGain: number;
  /** Tenants who paid something on this line. */
  tenantsPaying: number;
  /** Tenants reconciled on this line (paying or under their base). */
  tenantsReconciled: number;
  /** Part of `recovered` from total-stop leases (spread, not per line). */
  viaTotalStop: number;
};

export type BuildingLineRecovery = {
  propertyCode: string;
  year: number;
  lines: LineRecovery[];
  ret: LineRecovery;
  /** Every operating-expense line together (RET apart). */
  opexTotal: LineRecovery;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** The booked expense on a base account, FINAL first. */
export function bookedExpense(pool: OfficeExpensePool, account: string, year: number, finals?: Record<string, number>): number {
  return finals?.[account] ?? pool.values[account]?.[String(year)] ?? 0;
}

type Acc = Omit<LineRecovery, "pct">;
const empty = (glAccount: string, label: string, expense: number): Acc => ({
  glAccount, label, expense, recovered: 0, lostToBaseYears: 0, lostToVacancy: 0, grossUpGain: 0,
  tenantsPaying: 0, tenantsReconciled: 0, viaTotalStop: 0,
});

function finish(a: Acc): LineRecovery {
  // Vacancy is what is left once recovery, the stops and the gross-up are
  // accounted for — so the four always add back to the booked expense.
  const lostToVacancy = a.expense - a.recovered - a.lostToBaseYears + a.grossUpGain;
  return {
    ...a,
    expense: r2(a.expense),
    recovered: r2(a.recovered),
    lostToBaseYears: r2(a.lostToBaseYears),
    grossUpGain: r2(a.grossUpGain),
    lostToVacancy: r2(lostToVacancy),
    viaTotalStop: r2(a.viaTotalStop),
    pct: a.expense > 0 ? a.recovered / a.expense : 0,
  };
}

/** One tenant's contribution to one line. `paid` is what it owes on the line;
 *  `weight` is its share × recovery proration. */
function addTenantLine(acc: Acc, sl: ReconScheduleLine, booked: number, weight: number, paid: number) {
  acc.recovered += paid;
  acc.tenantsReconciled += 1;
  if (paid > 0.005) acc.tenantsPaying += 1;
  // The tenant's slice of what it reconciled on (grossed-up where its lease is)
  // splits into what it paid and what its base absorbed; the slice above the
  // booked figure is the gross-up.
  acc.lostToBaseYears += weight * sl.actual - paid;
  acc.grossUpGain += weight * (sl.actual - booked);
}

export function lineRecoveries(
  pool: OfficeExpensePool,
  result: BuildingReconResult,
  finals?: Record<string, number>,
): BuildingLineRecovery {
  const year = result.reconYear;
  const lines = pool.opexLines.map((l) => empty(l.glAccount, l.label, bookedExpense(pool, l.glAccount, year, finals)));
  const ret = empty(pool.retAccount, pool.retLabel, bookedExpense(pool, pool.retAccount, year, finals));

  for (const t of result.tenants) {
    if (t.isVacant) continue;
    const weight = (t.proRataPct / 100) * t.recoveryPct;
    if (t.aggregateBaseYear && !t.futureBaseYear) {
      // A stop on the TOTAL: spread its amount due by how far each line rose.
      const rises = t.opexLines.map((sl) => Math.max(0, sl.actual - sl.baseCost));
      const sum = rises.reduce((a, b) => a + b, 0);
      t.opexLines.forEach((sl, i) => {
        const paid = sum > 0 ? t.opexAmountDue * (rises[i] / sum) : 0;
        addTenantLine(lines[i], sl, lines[i].expense, weight, paid);
        lines[i].viaTotalStop += paid;
      });
    } else {
      t.opexLines.forEach((sl, i) => addTenantLine(lines[i], sl, lines[i].expense, weight, sl.netIncrease * weight));
    }
    addTenantLine(ret, t.retLine, ret.expense, weight, t.retAmountDue);
  }

  const total = empty("", "Total Operating Expenses", 0);
  for (const a of lines) {
    total.expense += a.expense;
    total.recovered += a.recovered;
    total.lostToBaseYears += a.lostToBaseYears;
    total.grossUpGain += a.grossUpGain;
    total.viaTotalStop += a.viaTotalStop;
  }
  const payers = new Set<string>();
  const reconciled = new Set<string>();
  for (const t of result.tenants) {
    if (t.isVacant) continue;
    reconciled.add(t.unitRef);
    if (t.opexAmountDue > 0.005) payers.add(t.unitRef);
  }
  total.tenantsPaying = payers.size;
  total.tenantsReconciled = reconciled.size;

  return { propertyCode: result.propertyCode, year, lines: lines.map(finish), ret: finish(ret), opexTotal: finish(total) };
}

/** Several buildings summed line by line (a fund, or every business park),
 *  matched by GL account. */
export function combineLineRecoveries(buildings: BuildingLineRecovery[], label = "Combined"): BuildingLineRecovery | null {
  if (!buildings.length) return null;
  const order: string[] = [];
  const byAcct = new Map<string, Acc>();
  const add = (map: Map<string, Acc>, l: LineRecovery, key: string) => {
    let a = map.get(key);
    if (!a) {
      a = empty(l.glAccount, l.label, 0);
      map.set(key, a);
      if (map === byAcct) order.push(key);
    }
    a.expense += l.expense;
    a.recovered += l.recovered;
    a.lostToBaseYears += l.lostToBaseYears;
    a.grossUpGain += l.grossUpGain;
    a.viaTotalStop += l.viaTotalStop;
    a.tenantsPaying += l.tenantsPaying;
    a.tenantsReconciled += l.tenantsReconciled;
  };
  for (const b of buildings) for (const l of b.lines) add(byAcct, l, l.glAccount);
  const one = new Map<string, Acc>();
  for (const b of buildings) { add(one, b.ret, "ret"); add(one, b.opexTotal, "total"); }
  const ret = one.get("ret")!;
  ret.label = "Real Estate Taxes";
  const total = one.get("total")!;
  total.glAccount = "";
  return {
    propertyCode: label,
    year: buildings[0].year,
    lines: order.map((k) => finish(byAcct.get(k)!)),
    ret: finish(ret),
    opexTotal: finish(total),
  };
}

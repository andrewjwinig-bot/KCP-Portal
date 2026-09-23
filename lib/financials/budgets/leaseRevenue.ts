// Lease-based revenue projection for the budget draft (Phase 1b + 2).
//
// Projects next year's rental income from the CURRENT rent roll's in-place
// leases. The rent roll carries no parsed escalations, so base rent is held flat
// unless a LEASING ASSUMPTION (Phase 2) says otherwise:
//   • renew  — hold the current rent, or step to a new rent from a start month.
//   • vacate — pay through the vacate month, then $0.
//   • leaseup — a vacant space starts paying a new rent from a start month.
// Leases expiring in the budget year (or on holdover) and vacant spaces are
// surfaced with their current assumption so the decision is explicit.

import "server-only";
import { resolveCurrentRentroll } from "@/lib/rentroll/current";
import type { LeaseAssumption } from "./leasingAssumptions";
import type { InPlaceCharge } from "./inPlaceRevenue";

const r0 = (n: number) => Math.round(n);

/** MM/DD/YYYY → {y,m} (1-based month), or null. */
function parseMDY(s: string | null | undefined): { y: number; m: number } | null {
  const mm = (s ?? "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return mm ? { y: Number(mm[3]), m: Number(mm[1]) } : null;
}

export type ExpiringLease = {
  unitRef: string;
  tenant: string;
  leaseTo: string | null;
  monthlyRent: number;
  annualRent: number;
  /** The suite's square feet — rent, TI and commissions are set per SF. */
  sqft: number;
  /** True when the lease already ended (holdover on the current roll). */
  holdover: boolean;
  /** The assumption currently applied to this unit, if any. */
  assumption?: LeaseAssumption;
};
export type VacantUnit = { unitRef: string; sqft: number; assumption?: LeaseAssumption };

/** One suite's rent for the budget year — the "Rent by tenant" table. Each
 *  month is either CONTRACTED (on the schedule / an in-place lease: money the
 *  lease guarantees) or ASSUMED (a renewal, a hold past the term or a lease-up:
 *  a decision, so speculative). */
export type RentRow = {
  unitRef: string;
  tenant: string;
  sqft: number;
  months: number[];
  /** true = that month's rent is an assumption, not a contract. */
  assumed: boolean[];
  /** How the row came to be, for its label. */
  status: "contracted" | "expiring" | "holdover" | "vacant" | "lease-up";
  /** What the suite is billed a month TODAY for recoveries, off the rent
   *  roll's Operating Expense / Other Expense / Real Estate Tax columns —
   *  the current estimate the budget's figure is compared with. */
  billing?: { cam: number; ins: number; ret: number };
};

/** A roll unit's current monthly recovery billing. */
const billingOf = (u: { opexMonth?: number; otherMonth?: number; reTaxMonth?: number } | null | undefined) =>
  u ? { cam: u.opexMonth || 0, ins: u.otherMonth || 0, ret: u.reTaxMonth || 0 } : undefined;

export type LeaseRevenueProjection = {
  /** 12 monthly projected base rent (assumption-adjusted), display-positive. */
  rentalMonthly: number[];
  rentalTotal: number;
  inPlaceUnits: number;
  expiring: ExpiringLease[];
  vacant: VacantUnit[];
  /** Tenant improvements and leasing commissions the renewals and lease-ups
   *  carry (TI $/sf and LC $/sf × the suite's SF), in the month the new rent
   *  starts — the capital the deals cost, beside the rent they bring. */
  tiMonthly: number[];
  lcMonthly: number[];
  /** How many assumptions were applied to shape the projection. */
  assumptionsApplied: number;
  hasData: boolean;
  /** Every suite's months, contracted vs assumed. They sum to `rentalMonthly`. */
  rows: RentRow[];
  /** True when rent came from the imported RENT SCHEDULE (Skyline's Budget
   *  Rent Increase Calculation) rather than today's rent roll held flat. */
  fromSchedule?: boolean;
};

/** A decision's monthly rent: the figure the page derived, else its annual
 *  $/SF × the suite's SF ÷ 12 — so a rent keyed as $/SF can never project as
 *  nothing because the derived figure was missing. */
export function assumedMonthlyRent(a: LeaseAssumption | undefined, sqft: number): number | undefined {
  if (!a) return undefined;
  if (a.monthlyRent != null && a.monthlyRent > 0) return a.monthlyRent;
  if (a.rentPsf != null && a.rentPsf > 0 && sqft > 0) return (a.rentPsf * sqft) / 12;
  return a.monthlyRent ?? undefined;
}

/** Last day of a month, as the rent roll writes dates (MM/DD/YYYY). */
function monthEnd(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month, 0));
  return `${String(month).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}/${year}`;
}

/** In-place unit's 12 monthly rents given its current rent, budget-year
 *  expiration month (0 = holdover, 13 = doesn't expire this year), and any
 *  assumption. */
//
// AN EXISTING TENANT'S DATES COME FROM THE LEASE, NOT FROM AN ASSUMPTION.
// A renewal's new rent starts the day after the current term expires — a lease
// ending 11/30 renews from 12/1 — and a tenant who vacates pays through the
// month the term ends. Only a VACANT space needs someone to assume a start
// month, so `startMonth` is read for a lease-up and ignored here (an older
// saved assumption carrying one follows the lease too). A holdover — term
// already over — renews, or is gone, from January.
/** A leasing commission: `pct` percent of the rent over the whole term
 *  (monthly rent × 12 × years). Nothing without a percent, a rent or a term. */
export function leasingCommission(pct: number | undefined, monthlyRent: number, termYears: number | undefined): number {
  if (!(pct && pct > 0) || !(monthlyRent > 0) || !(termYears && termYears > 0)) return 0;
  return (pct / 100) * monthlyRent * 12 * termYears;
}

export function renewalStartMonth(expMonth: number): number {
  if (expMonth === 0) return 1;                 // holdover
  if (expMonth >= 1 && expMonth <= 12) return expMonth + 1; // 13 = next year
  return 13;                                    // doesn't expire this year
}

function inPlaceMonths(cur: number, expMonth: number, a?: LeaseAssumption, sqft = 0): number[] {
  const out = new Array(12).fill(0);
  if (a?.kind === "vacate") {
    // Paid through the month the term ends; a holdover pays nothing more.
    const lastPaid = expMonth >= 1 && expMonth <= 12 ? expMonth : expMonth === 0 ? 0 : 12;
    for (let m = 0; m < 12; m++) out[m] = m + 1 <= lastPaid ? cur : 0;
    return out;
  }
  if (a?.kind === "renew") {
    const newRent = assumedMonthlyRent(a, sqft) ?? cur;
    const start = renewalStartMonth(expMonth);
    for (let m = 0; m < 12; m++) out[m] = m + 1 < start ? cur : newRent;
    return out;
  }
  out.fill(cur); // no assumption → hold flat
  return out;
}

/** Project rental income for the given property codes (one building, or a fund's
 *  members) for `budgetYear`, applying any leasing assumptions. */
export async function projectLeaseRevenue(
  codes: string[],
  budgetYear: number,
  assumptions: Record<string, LeaseAssumption> = {},
  /** The imported rent schedule's charges, when there is one. It carries every
   *  contracted charge for every month of the budget year — steps included —
   *  so where it covers a property it REPLACES "today's rent held flat". */
  schedule: InPlaceCharge[] | null = null,
): Promise<LeaseRevenueProjection> {
  const wanted = new Set(codes.map((c) => c.toUpperCase()));
  const roll = await resolveCurrentRentroll();
  const rentalMonthly = new Array(12).fill(0);
  const tiMonthly = new Array(12).fill(0);
  const lcMonthly = new Array(12).fill(0);
  /** A deal's TI and commission, in the month its new rent starts (1–12).
   *  TI is $/SF × SF. The commission is a PERCENT OF THE RENT over the term —
   *  lcPct × the new annual rent × the term in years — which is how a broker
   *  is paid, so a deal with no term yet carries no commission. */
  const dealCosts = (a: LeaseAssumption, sqft: number, startMonth: number, monthlyRent: number) => {
    if (startMonth < 1 || startMonth > 12) return;
    if (sqft > 0) tiMonthly[startMonth - 1] += (a.tiPsf ?? 0) * sqft;
    lcMonthly[startMonth - 1] += leasingCommission(a.lcPct, monthlyRent, a.termYears);
  };
  const expiring: ExpiringLease[] = [];
  const vacant: VacantUnit[] = [];
  const rows: RentRow[] = [];
  const zero = () => new Array(12).fill(0) as number[];
  const no = () => new Array(12).fill(false) as boolean[];
  let inPlaceUnits = 0;
  let assumptionsApplied = 0;
  let any = false;

  let usedSchedule = false;
  /**
   * One property from the RENT SCHEDULE. Each suite's contracted months are
   * taken as scheduled (steps and all). A suite whose charges STOP inside the
   * year is an expiring lease; a tenant with NO charges for the year is a
   * holdover (or a lease with no contracted rent — Rite Aid); a suite with no
   * tenant is a vacancy. Until someone decides, the months after a lease ends
   * carry nothing — the schedule has no rent for them, and neither does the
   * budget. The decision then fills them: renew (a new rent, or the last
   * scheduled one) or hold from the month after the term, vacate leaves them
   * empty, a lease-up starts from its month.
   */
  const scheduleProperty = (units: NonNullable<NonNullable<typeof roll>["properties"][number]["units"]>, sched: InPlaceCharge[]) => {
    usedSchedule = true;
    const up = (s: string) => s.trim().toUpperCase();
    const byUnit = new Map<string, { tenant: string; months: number[] }>();
    for (const c of sched) {
      const k = up(c.unitRef);
      const e = byUnit.get(k) ?? { tenant: c.tenant, months: new Array(12).fill(0) };
      if (c.month >= 1 && c.month <= 12) e.months[c.month - 1] += c.amount;
      byUnit.set(k, e);
    }
    const seen = new Set<string>();
    const rollUnits = units.filter((u) => !u.amenity);
    const suites = [
      ...rollUnits.map((u) => ({ ref: u.unitRef, roll: u as (typeof rollUnits)[number] | null })),
      ...[...byUnit.keys()].filter((k) => !rollUnits.some((u) => up(u.unitRef) === k)).map((k) => ({ ref: k, roll: null })),
    ];
    for (const { ref, roll: u } of suites) {
      const k = up(ref);
      if (seen.has(k)) continue;
      seen.add(k);
      const a = assumptions[ref] ?? assumptions[k];
      const e = byUnit.get(k);
      const sqft = u?.sqft || 0;
      const scheduled = e?.months ?? new Array(12).fill(0);
      const covered = scheduled.map((v) => Math.abs(v) > 0.005);
      const nCovered = covered.filter(Boolean).length;
      // A suite the roll marks vacant is a VACANCY, whatever it is "named" —
      // the roll writes "Vacant" / "*** VACANT ***" into the tenant field, and
      // reading that as a tenant put empty suites on the expiring list.
      const isVacantName = (n: string) => !n.trim() || /vacant/i.test(n);
      const rollVacant = !!u && (u.isVacant || isVacantName(u.occupantName || ""));
      const tenant = rollVacant ? "" : (u?.occupantName || (e && !isVacantName(e.tenant) ? e.tenant : "") || "");

      if (nCovered === 0 && !tenant) {
        // Vacant — rent only from a lease-up.
        const row: RentRow = { unitRef: ref, tenant: "", sqft: r0(sqft), months: zero(), assumed: no(), status: "vacant" };
        if (a?.kind === "leaseup") {
          const start = a.startMonth ?? 1;
          const rent = assumedMonthlyRent(a, sqft) ?? 0;
          for (let m = 0; m < 12; m++) if (m + 1 >= start) { rentalMonthly[m] += rent; row.months[m] = rent; row.assumed[m] = true; }
          dealCosts(a, sqft, start, rent);
          assumptionsApplied++;
          row.status = "lease-up";
        }
        rows.push(row);
        vacant.push({ unitRef: ref, sqft: r0(sqft), assumption: a });
        continue;
      }

      inPlaceUnits++;
      const row: RentRow = { unitRef: ref, tenant, sqft: r0(sqft), months: scheduled.slice(), assumed: no(), status: "contracted", billing: billingOf(u) };
      rows.push(row);
      for (let m = 0; m < 12; m++) rentalMonthly[m] += scheduled[m];
      if (nCovered === 12) continue; // contracted all year — nothing to decide

      // Where the contracted rent stops (0 = none this year: a holdover).
      const lastMonth = nCovered ? Math.max(...covered.map((c, i) => (c ? i + 1 : 0))) : 0;
      const lastRent = lastMonth ? scheduled[lastMonth - 1] : (u?.baseRent || 0);
      const from = lastMonth + 1; // the first month with no contracted rent
      row.status = lastMonth === 0 ? "holdover" : "expiring";
      if (a) assumptionsApplied++;
      if (a?.kind === "renew" || a?.kind === "hold") {
        const rent = a.kind === "renew" ? (assumedMonthlyRent(a, sqft) ?? lastRent) : lastRent;
        for (let m = from - 1; m < 12; m++) { rentalMonthly[m] += rent; row.months[m] += rent; row.assumed[m] = true; }
        dealCosts(a, sqft, from, rent);
      }
      expiring.push({
        unitRef: ref, tenant,
        // The lease's own date when the roll has it; else the last scheduled month.
        leaseTo: u?.leaseTo || (lastMonth ? monthEnd(budgetYear, lastMonth) : null),
        monthlyRent: r0(lastRent), annualRent: r0(lastRent * 12), sqft: r0(sqft),
        holdover: lastMonth === 0, assumption: a,
      });
    }
  };

  for (const p of roll?.properties ?? []) {
    if (!wanted.has(String(p.propertyCode).toUpperCase())) continue;
    any = true;
    const code = String(p.propertyCode).toUpperCase();
    const sched = (schedule ?? []).filter((c) => c.propertyCode.toUpperCase() === code);
    if (sched.length) {
      scheduleProperty(p.units ?? [], sched);
      continue;
    }
    for (const u of p.units ?? []) {
      if (u.amenity) continue;
      const a = assumptions[u.unitRef];

      if (u.isVacant || !u.occupantName) {
        // Vacant → only produces rent with a lease-up assumption.
        const row: RentRow = { unitRef: u.unitRef, tenant: "", sqft: r0(u.sqft || 0), months: zero(), assumed: no(), status: "vacant" };
        if (a?.kind === "leaseup") {
          const start = a.startMonth ?? 1;
          const rent = assumedMonthlyRent(a, u.sqft || 0) ?? 0;
          for (let m = 0; m < 12; m++) if (m + 1 >= start) { rentalMonthly[m] += rent; row.months[m] = rent; row.assumed[m] = true; }
          dealCosts(a, u.sqft || 0, start, rent);
          assumptionsApplied++;
          row.status = "lease-up";
        }
        rows.push(row);
        vacant.push({ unitRef: u.unitRef, sqft: r0(u.sqft || 0), assumption: a });
        continue;
      }

      const cur = u.baseRent || 0;
      inPlaceUnits++;
      const end = parseMDY(u.leaseTo);
      const expMonth = end ? (end.y < budgetYear ? 0 : end.y === budgetYear ? end.m : 13) : 13;
      const months = inPlaceMonths(cur, expMonth, a, u.sqft || 0);
      for (let m = 0; m < 12; m++) rentalMonthly[m] += months[m];
      // From the renewal month on, a renew/hold decision is the assumption; a
      // lease with no decision is held flat at today's rent (the rent roll
      // has no schedule to say otherwise), which is also an assumption.
      const assumedFrom = expMonth >= 1 && expMonth <= 12 ? expMonth + 1 : expMonth === 0 ? 1 : 13;
      rows.push({
        billing: billingOf(u),
        unitRef: u.unitRef, tenant: u.occupantName, sqft: r0(u.sqft || 0), months: months.slice(),
        assumed: months.map((v, m) => m + 1 >= assumedFrom && Math.abs(v) > 0.005),
        status: expMonth === 13 ? "contracted" : expMonth === 0 ? "holdover" : "expiring",
      });
      if (a) assumptionsApplied++;
      // A renewal — or a tenant HELD at today's rent for a new term, who can
      // still be given TI and a broker paid — costs its deal when the term rolls.
      if (a?.kind === "renew") dealCosts(a, u.sqft || 0, renewalStartMonth(expMonth), assumedMonthlyRent(a, u.sqft || 0) ?? cur);
      if (a?.kind === "hold") dealCosts(a, u.sqft || 0, renewalStartMonth(expMonth), cur);

      if (end && end.y <= budgetYear) {
        expiring.push({
          unitRef: u.unitRef, tenant: u.occupantName, leaseTo: u.leaseTo,
          monthlyRent: r0(cur), annualRent: r0(cur * 12), sqft: r0(u.sqft || 0),
          holdover: end.y < budgetYear, assumption: a,
        });
      }
    }
  }

  expiring.sort((a, b) => (a.leaseTo ?? "").localeCompare(b.leaseTo ?? ""));
  vacant.sort((a, b) => b.sqft - a.sqft);
  const roundedRows = rows
    .map((r) => ({ ...r, months: r.months.map(r0), billing: r.billing && { cam: r0(r.billing.cam), ins: r0(r.billing.ins), ret: r0(r.billing.ret) } }))
    .sort((a, b) => a.unitRef.localeCompare(b.unitRef, undefined, { numeric: true }));
  const roundedRental = Array.from({ length: 12 }, (_, m) => roundedRows.reduce((s, r) => s + r.months[m], 0));
  return {
    fromSchedule: usedSchedule,
    // The budget is in WHOLE DOLLARS: each suite's month is rounded, and the
    // rent line is the sum of those rounded suites — so the table and the line
    // tie to the dollar rather than each rounding on its own.
    rows: roundedRows,
    rentalMonthly: roundedRental,
    rentalTotal: roundedRental.reduce((s, n) => s + n, 0),
    tiMonthly: tiMonthly.map(r0),
    lcMonthly: lcMonthly.map(r0),
    inPlaceUnits,
    expiring,
    vacant,
    assumptionsApplied,
    hasData: any,
  };
}

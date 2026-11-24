// Reads what the shared office needs for each month a GL covers: 2010's Office
// Rental (8110-*) for the month from its imported GL, and suite 4080-400's SF
// from the rent roll. A month 2010 has not posted yet gets nothing — when it
// posts, the next send's late-charge true-up bills it (`sharedOffice.ts`).

import "server-only";
import type { GLParseResult } from "./glParser";
import { assembledGl, type StoredGl } from "@/lib/financials/operating-statements/statementStore";
import { findRentRollUnit } from "@/lib/rentroll/current";
import { LIK_OFFICE_UNIT, OFFICE_RENTAL_MASK, SHARED_OFFICE_FROM, TRUEUP_INTO, monthsOfPeriod, withSharedOffice, type SharedOfficeMonth, type SharedOfficeTrueUp } from "./sharedOffice";
import { trueUpPlan } from "./sharedOfficeTrueUp";

/** 2010's Office Rental for a month, or null when its GL has not reached it. */
export function officeRentalFor(gl: StoredGl | null, month: number): number | null {
  if (!gl) return null;
  const through = gl.coverageEnd ?? gl.maxPeriodInFile ?? 0;
  if (month > through) return null;
  let sum = 0;
  for (const [acct, months] of Object.entries(gl.monthly ?? {})) if (OFFICE_RENTAL_MASK.test(acct)) sum += Number(months?.[month - 1]) || 0;
  return Math.round(sum * 100) / 100;
}

/** Each month's shared office for the months a GL covers — and, when it covers
 *  November, the year-to-date true-up laid into it. A month in the true-up is
 *  never also given its own month line. */
export async function sharedOfficeFor(period: string): Promise<{ months: SharedOfficeMonth[]; trueUp: SharedOfficeTrueUp | null }> {
  const covered = monthsOfPeriod(period);
  const plan = covered.includes(TRUEUP_INTO) ? await trueUpPlan() : null;
  const inPlan = new Set(plan?.months ?? []);
  const own = covered.filter((m) => m >= SHARED_OFFICE_FROM && !inPlan.has(m));
  if (!own.length && !plan) return { months: [], trueUp: null };
  const unit = await findRentRollUnit(LIK_OFFICE_UNIT).catch(() => null);
  const officeSqft = Number(unit?.sqft) || 0;
  if (!(officeSqft > 0)) return { months: [], trueUp: null };
  const byYear = new Map<number, StoredGl | null>();
  const read = async (m: string): Promise<SharedOfficeMonth | null> => {
    const y = Number(m.slice(0, 4));
    if (!byYear.has(y)) byYear.set(y, await assembledGl("2010", y).catch(() => null));
    const rental = officeRentalFor(byYear.get(y) ?? null, Number(m.slice(5, 7)));
    return rental ? { month: m, officeRental: rental, officeSqft } : null;
  };
  const months: SharedOfficeMonth[] = [];
  for (const m of own) { const x = await read(m); if (x) months.push(x); }
  let trueUp: SharedOfficeTrueUp | null = null;
  if (plan) {
    const tm: SharedOfficeMonth[] = [];
    for (const m of plan.months) { const x = await read(m); if (x) tm.push(x); }
    if (tm.length) trueUp = { intoMonth: plan.intoMonth, months: tm };
  }
  return { months, trueUp };
}

/** The GL with the shared office laid in for every month it covers. Never
 *  throws: on any failure the GL is returned as it was. */
export async function withSharedOfficeLoaded(gl: GLParseResult): Promise<GLParseResult> {
  try { const s = await sharedOfficeFor(gl.statementMonth); return withSharedOffice(gl, s.months, s.trueUp); }
  catch (e) { console.error("[allocated] shared office not added", e); return gl; }
}

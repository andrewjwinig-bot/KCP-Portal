// Reads what the shared office needs for each month a GL covers: 2010's Office
// Rental (8110-*) for the month from its imported GL, and suite 4080-400's SF
// from the rent roll. A month 2010 has not posted yet gets nothing — when it
// posts, the next send's late-charge true-up bills it (`sharedOffice.ts`).

import "server-only";
import type { GLParseResult } from "./glParser";
import { assembledGl, type StoredGl } from "@/lib/financials/operating-statements/statementStore";
import { findRentRollUnit } from "@/lib/rentroll/current";
import { LIK_OFFICE_UNIT, OFFICE_RENTAL_MASK, SHARED_OFFICE_FROM, monthsOfPeriod, withSharedOffice, type SharedOfficeMonth } from "./sharedOffice";

/** 2010's Office Rental for a month, or null when its GL has not reached it. */
export function officeRentalFor(gl: StoredGl | null, month: number): number | null {
  if (!gl) return null;
  const through = gl.coverageEnd ?? gl.maxPeriodInFile ?? 0;
  if (month > through) return null;
  let sum = 0;
  for (const [acct, months] of Object.entries(gl.monthly ?? {})) if (OFFICE_RENTAL_MASK.test(acct)) sum += Number(months?.[month - 1]) || 0;
  return Math.round(sum * 100) / 100;
}

export async function sharedOfficeMonths(period: string): Promise<SharedOfficeMonth[]> {
  const months = monthsOfPeriod(period).filter((m) => m >= SHARED_OFFICE_FROM);
  if (!months.length) return [];
  const unit = await findRentRollUnit(LIK_OFFICE_UNIT).catch(() => null);
  const officeSqft = Number(unit?.sqft) || 0;
  if (!(officeSqft > 0)) return [];
  const byYear = new Map<number, StoredGl | null>();
  const out: SharedOfficeMonth[] = [];
  for (const m of months) {
    const y = Number(m.slice(0, 4));
    if (!byYear.has(y)) byYear.set(y, await assembledGl("2010", y).catch(() => null));
    const rental = officeRentalFor(byYear.get(y) ?? null, Number(m.slice(5, 7)));
    if (rental) out.push({ month: m, officeRental: rental, officeSqft });
  }
  return out;
}

/** The GL with the shared office laid in for every month it covers. Never
 *  throws: on any failure the GL is returned as it was. */
export async function withSharedOfficeLoaded(gl: GLParseResult): Promise<GLParseResult> {
  try { return withSharedOffice(gl, await sharedOfficeMonths(gl.statementMonth)); }
  catch (e) { console.error("[allocated] shared office not added", e); return gl; }
}

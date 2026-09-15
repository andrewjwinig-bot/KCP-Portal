// Fund loan → per-building debt-service allocation.
//
// The two Business Park loans are each secured by a POOL of buildings, not a
// single property (JV III = Office Buildings 1/2/4; NI LLC = Buildings 5–8 plus
// Kor Center A/B/C). To show how a fund loan's monthly debt service lands on
// each building, we split it pro-rata by building square footage — the same
// FUND_SF_ALLOC basis the CC Expense Coder uses to explode a fund-coded charge
// across its buildings. SF is the natural driver here: the collateral is the
// buildings themselves, and there's no per-building interest line in the GL to
// pull instead. Splits use a largest-remainder cents allocation so every part
// ties back to the loan total to the penny.

import { FUND_SF_ALLOC, PROPERTY_DEFS } from "../properties/data";
import type { Loan } from "./amortization";

/** A fund loan's borrowing entity (loan.property) → its fund's SF-alloc code. */
const LOAN_PROPERTY_TO_FUND: Record<string, string> = {
  "3600": "PJV3", // Lincoln Joint Venture III — O.B. #1,2,4
  "4000": "PNIPLX", // Neshaminy Interplex, LLC — O.B. #5,6,7,8, Kor Center
};

/**
 * Booked allocation shares that match how the fund's debt service is actually
 * split in the GL — the condo / partnership percentage interests, which are
 * close to but cleaner than raw building SF. Where a fund is listed here we use
 * these (basis "GL"); otherwise we fall back to FUND_SF_ALLOC (basis "SF"),
 * an SF-pro-rata estimate to be confirmed against the GL. Shares must sum to 1.
 *
 * PJV3 (JV III): confirmed against the JV III mortgage-interest GL split —
 * Building 1 (3610) 30%, Building 2 (3620) 35%, Building 4 (3640) 35%
 * (e.g. $6,907 / $8,058 / $8,058 of the ~$23,023 monthly interest).
 */
const FUND_BOOKED_SHARES: Record<string, Record<string, number>> = {
  PJV3: { "3610": 0.3, "3620": 0.35, "3640": 0.35 },
};

export type AllocationBasis = "GL" | "SF";

function sharesForFund(code: string): { shares: Record<string, number>; basis: AllocationBasis } | null {
  if (FUND_BOOKED_SHARES[code]) return { shares: FUND_BOOKED_SHARES[code], basis: "GL" };
  if (FUND_SF_ALLOC[code]) return { shares: FUND_SF_ALLOC[code], basis: "SF" };
  return null;
}

/** Which basis a fund loan's split uses: booked GL shares, SF estimate, or n/a. */
export function allocationBasisForLoan(loan: Loan): AllocationBasis | null {
  const code = fundCodeForLoan(loan);
  return code ? sharesForFund(code)?.basis ?? null : null;
}

export type BuildingAllocation = {
  id: string; // property code, e.g. "4080"
  name: string; // "Building 8"
  sqft: number;
  share: number; // 0..1 share of the fund's total SF
  payment: number; // allocated monthly payment
  principal: number;
  interest: number;
  balance: number; // allocated current balance
};

function propFor(id: string) {
  return PROPERTY_DEFS.find((p) => p.id === id);
}

/**
 * Largest-remainder split of a whole-cent total across shares. The floored
 * cents are distributed and the leftover pennies handed to the largest
 * fractional remainders, so the parts sum EXACTLY to `totalCents`.
 */
function splitCents(totalCents: number, shares: Record<string, number>): Record<string, number> {
  const neg = totalCents < 0;
  const t = Math.abs(totalCents);
  const rows = Object.entries(shares).map(([k, p]) => {
    const exact = t * p;
    const floor = Math.floor(exact);
    return { k, c: floor, f: exact - floor };
  });
  let rem = t - rows.reduce((a, b) => a + b.c, 0);
  rows.sort((a, b) => b.f - a.f);
  for (let i = 0; i < rows.length && rem > 0; i++) {
    rows[i].c += 1;
    rem -= 1;
  }
  return Object.fromEntries(rows.map((x) => [x.k, neg ? -x.c : x.c]));
}

/** The SF-alloc code for a fund loan, or null if the loan isn't a fund pool. */
export function fundCodeForLoan(loan: Loan): string | null {
  return LOAN_PROPERTY_TO_FUND[loan.property] ?? null;
}

/** True when a loan is secured by a multi-building fund pool. */
export function isFundLoan(loan: Loan): boolean {
  const code = fundCodeForLoan(loan);
  return !!code && !!sharesForFund(code);
}

/**
 * Split a fund loan's monthly payment / principal / interest / current balance
 * across the fund's buildings by SF share. Returns null for a single-property
 * loan. Rows are ordered by building code; every column ties to the loan total
 * to the penny.
 */
export function allocateLoanByBuilding(
  loan: Loan,
  amounts: { payment: number; principal: number; interest: number; balance: number },
): BuildingAllocation[] | null {
  const code = fundCodeForLoan(loan);
  if (!code) return null;
  const picked = sharesForFund(code);
  if (!picked) return null;
  const shares = picked.shares;

  const toC = (n: number) => Math.round(n * 100);
  const fromC = (c: number) => c / 100;

  const pay = splitCents(toC(amounts.payment), shares);
  const prin = splitCents(toC(amounts.principal), shares);
  const int = splitCents(toC(amounts.interest), shares);
  const bal = splitCents(toC(amounts.balance), shares);

  return Object.keys(shares)
    .map((id) => {
      const p = propFor(id);
      return {
        id,
        name: p?.name ?? id,
        sqft: p?.sqft ?? 0,
        share: shares[id],
        payment: fromC(pay[id]),
        principal: fromC(prin[id]),
        interest: fromC(int[id]),
        balance: fromC(bal[id]),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

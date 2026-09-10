// Debt Tracker data model + live amortization engine.
//
// A loan is anchored to a known statement balance (`anchorBalance` as of
// `anchorDate`). The schedule is projected forward month-by-month from that
// anchor so the "current" balance and position stay live as time passes —
// no need to re-key the balance every month.

export const LOAN_GROUPS = ["Business Parks", "Shopping Centers", "Residential"] as const;
export type LoanGroup = (typeof LOAN_GROUPS)[number];

export type Loan = {
  id: string;
  property: string;          // GL property code, e.g. "3600"
  partnership: string;       // borrowing entity
  collateral: string;
  lender: string;
  group: LoanGroup;
  originalBalance: number;   // original loan amount at refinance/origination
  annualRatePct: number;     // e.g. 4.5
  amortYears: number;        // amortization term used for the P&I payment
  scheduledPayment: number;  // bank P&I payment (ignored while interest-only)
  maturityDate: string;      // ISO YYYY-MM-DD
  anchorBalance: number;     // known principal balance from a statement
  anchorDate: string;        // ISO YYYY-MM-DD the anchor balance is true
  interestOnly: boolean;
  /**
   * Monthly escrow for taxes and insurance, collected alongside P&I.
   *
   * NOT debt service, and deliberately outside the amortization: escrow is a
   * pass-through that pays the tax bill and the insurance premium, so it does
   * not touch the balance, the interest or the payoff. It is here because it
   * DOES leave the bank account — the debit at 2300 is $39,086.15 while the
   * debt service is $25,031.18 — and cash planning that reads only
   * `scheduledPayment` is short by the difference every month.
   *
   * The bank resets it annually as taxes and premiums move, so it carries the
   * date the current figure takes effect.
   */
  escrowPerMonth?: number;
  escrowEffective?: string;  // ISO YYYY-MM-DD the escrow figure starts
  /**
   * Optional fixed-principal amendment. For payment dates within
   * [startDate, endDate] the borrower pays `principalPerMonth` of principal
   * plus interest on the declining balance, so the total payment varies.
   * Outside the window the loan follows interestOnly / scheduledPayment.
   */
  amendment?: {
    startDate: string;        // ISO YYYY-MM-DD
    endDate: string;          // ISO YYYY-MM-DD
    principalPerMonth: number;
  };
  notes: string;
};

/**
 * What actually leaves the bank account each month: debt service plus escrow.
 *
 * `scheduledPayment` is P&I alone, which is the right figure for the
 * amortization and the wrong one for cash planning — at 2300 the debit is
 * $39,086.15 against debt service of $25,031.18, so anything budgeting from
 * the payment alone is short by $14,054.97 a month.
 *
 * `on` lets a projection ask for the outlay at a date: escrow carries the date
 * the bank's reset takes effect, and before that date the figure is not yet
 * true. Omit it for the current outlay.
 */
export function escrowAt(loan: Loan, on?: string): number {
  if (loan.escrowPerMonth == null) return 0;
  if (loan.escrowEffective && on && on < loan.escrowEffective) return 0;
  return loan.escrowPerMonth;
}

/**
 * Takes DEBT SERVICE rather than computing it, because `scheduledPayment` is
 * not the payment on every loan: 4000 is interest-only under a fixed-principal
 * amendment, so its actual payment is $20,050 of principal plus interest on a
 * declining balance and its `scheduledPayment` (the original P&I) is not paid
 * at all. `loanSummary().monthlyDebtService` already resolves that from the
 * schedule — pass it in rather than guessing here.
 */
export function monthlyOutlay(loan: Loan, debtService: number, on?: string): number {
  return round2(debtService + escrowAt(loan, on));
}

export type ScheduleRow = {
  index: number;
  date: string;              // ISO payment date
  openingBalance: number;
  payment: number;
  interest: number;
  principal: number;
  closingBalance: number;
  isPast: boolean;           // payment date on/before today
  isCurrent: boolean;        // first upcoming payment
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Add `n` months to an ISO date, clamping the day to the month length. */
export function isoAddMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = total % 12;
  const lastDay = new Date(ny, nm + 1, 0).getDate();
  const nd = Math.min(d, lastDay);
  return `${ny}-${String(nm + 1).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
}

/** Whole months from ISO `a` to ISO `b` (negative if b precedes a). */
export function monthsBetween(a: string, b: string): number {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return (by * 12 + bm) - (ay * 12 + am);
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Build the live amortization schedule for a loan, projected from its anchor.
 * Amortizing loans run until the balance is retired; interest-only loans run
 * to maturity (or 10 years out if maturity has already passed).
 */
export function buildSchedule(loan: Loan, today: string = todayISO()): ScheduleRow[] {
  const monthlyRate = loan.annualRatePct / 100 / 12;
  const rows: ScheduleRow[] = [];
  let balance = loan.anchorBalance;

  let maxRows: number;
  if (loan.interestOnly) {
    const toMaturity = monthsBetween(loan.anchorDate, loan.maturityDate);
    maxRows = toMaturity > 0 ? toMaturity : 120;
  } else {
    maxRows = 600;
  }
  // Always project at least through the end of any amendment window.
  if (loan.amendment) {
    const toAmendEnd = monthsBetween(loan.anchorDate, loan.amendment.endDate);
    if (toAmendEnd > maxRows) maxRows = toAmendEnd;
  }

  for (let i = 1; i <= maxRows; i++) {
    const date = isoAddMonths(loan.anchorDate, i);
    const opening = balance;
    const interest = round2(opening * monthlyRate);
    let principal: number;
    let payment: number;

    const amend = loan.amendment;
    const inAmendment = !!amend && date >= amend.startDate && date <= amend.endDate;
    if (inAmendment) {
      // Fixed principal + interest on the declining balance.
      principal = Math.min(round2(amend!.principalPerMonth), opening);
      payment = round2(principal + interest);
    } else if (loan.interestOnly) {
      principal = 0;
      payment = interest;
    } else {
      payment = loan.scheduledPayment;
      principal = round2(payment - interest);
      if (principal >= opening) {
        principal = opening;
        payment = round2(opening + interest);
      }
    }

    const closing = round2(opening - principal);
    rows.push({
      index: i,
      date,
      openingBalance: opening,
      payment,
      interest,
      principal,
      closingBalance: closing,
      isPast: date <= today,
      isCurrent: false,
    });
    balance = closing;
    if (!loan.interestOnly && balance <= 0.01) break;
  }

  const upcoming = rows.find((r) => !r.isPast);
  if (upcoming) upcoming.isCurrent = true;
  else if (rows.length) rows[rows.length - 1].isCurrent = true;

  return rows;
}

export type LoanSummary = {
  projectedBalance: number;  // balance as of today
  nextPayment: ScheduleRow | null;
  monthlyDebtService: number;
  annualInterest: number;    // interest over the next 12 scheduled payments
  payoffDate: string | null; // null for interest-only
  status: "Interest-Only" | "Amortizing" | "Maturity Passed";
};

/** Roll the schedule forward to `today` and derive headline numbers. */
export function summarizeLoan(loan: Loan, today: string = todayISO()): LoanSummary {
  const schedule = buildSchedule(loan, today);
  const past = schedule.filter((r) => r.isPast);
  const projectedBalance = past.length
    ? past[past.length - 1].closingBalance
    : loan.anchorBalance;

  const nextIdx = schedule.findIndex((r) => r.isCurrent);
  const nextPayment = nextIdx >= 0 ? schedule[nextIdx] : null;

  const next12 = nextIdx >= 0 ? schedule.slice(nextIdx, nextIdx + 12) : [];
  const annualInterest = round2(next12.reduce((s, r) => s + r.interest, 0));

  const amend = loan.amendment;
  const inAmendmentToday = !!amend && today >= amend.startDate && today <= amend.endDate;

  // The live next payment already reflects interest-only / amendment / P&I.
  const monthlyDebtService = nextPayment
    ? nextPayment.payment
    : loan.interestOnly
      ? round2((projectedBalance * loan.annualRatePct) / 100 / 12)
      : loan.scheduledPayment;

  const payoffDate = loan.interestOnly
    ? null
    : schedule.length
      ? schedule[schedule.length - 1].date
      : null;

  const maturityPassed = monthsBetween(today, loan.maturityDate) < 0;
  const status: LoanSummary["status"] = inAmendmentToday
    ? "Amortizing"
    : maturityPassed
      ? "Maturity Passed"
      : loan.interestOnly
        ? "Interest-Only"
        : "Amortizing";

  return { projectedBalance, nextPayment, monthlyDebtService, annualInterest, payoffDate, status };
}

export function newLoanId(): string {
  return "loan_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function emptyLoan(): Loan {
  return {
    id: newLoanId(),
    property: "",
    partnership: "",
    collateral: "",
    lender: "",
    group: "Business Parks",
    originalBalance: 0,
    annualRatePct: 0,
    amortYears: 25,
    scheduledPayment: 0,
    maturityDate: "",
    anchorBalance: 0,
    anchorDate: todayISO(),
    interestOnly: false,
    notes: "",
  };
}

/**
 * Korman loan book. Each loan is a named, code-managed constant: storage
 * reconciles the live loans to these definitions on every load, so loan
 * data is kept current here from the monthly Liberty mortgage statements.
 * All five are anchored to their 4/2026 statements (first projected
 * payment 5/1/2026).
 */

// JV III (property 3600) — Liberty Bank. Interest-only.
export const JV_III_3600_LOAN: Loan = {
  id: "loan_jv3",
  property: "3600",
  partnership: "Lincoln Joint Venture III",
  collateral: "O.B. #1,2,4",
  lender: "Liberty Bank",
  group: "Business Parks",
  originalBalance: 7100000,
  annualRatePct: 4.5,
  amortYears: 25,
  scheduledPayment: 39464.11,
  maturityDate: "2028-03-01",
  anchorBalance: 6139294.10,
  anchorDate: "2026-04-01",
  interestOnly: true,
  escrowPerMonth: 11908.90,
  escrowEffective: "2026-10-01",
  notes:
    "Refinanced 7/11/2019 at $7,100,000 on a 25-yr amortization. Term " +
    "extended through 3/1/2028 alongside the NI LLC extension; remains " +
    "interest-only (no fixed-principal amendment). Per the 4/18/2026 " +
    "Liberty statement: principal balance $6,139,294.10, escrow balance " +
    "$115,895.31, rate 4.500%, YTD interest $92,089.42, prior-year " +
    "interest $263,945.77. Payments auto-debit from account x5631. " +
    "Liberty escrow analysis 10/2026: ESCROW SURPLUS of $41,923.65 refunded " +
    "by cheque — expect the deposit, and the escrow balance drops to about " +
    "$73,971.66. From 10/2026 the payment is interest plus escrow of " +
    "$11,908.90; there is no principal and no stated total, because the " +
    "interest moves with the balance. Still interest-only, so no P&I figure " +
    "applies — `scheduledPayment` here is the original amortizing payment " +
    "and is NOT what is billed.",
};

/**
 * NI LLC (property 4000) — Liberty Bank. Carries a pending loan amendment
 * the edit UI can't express.
 *
 * Anchored to the 4/18/2026 Liberty statement: principal balance
 * $22,789,590.83, escrow balance $324,622.90, rate 4.900%. Pending
 * amendment (effective 4/1/2026, not yet signed): fixed $20,050/mo
 * principal plus interest on the declining balance through 3/1/2028.
 */
export const NI_LLC_4000_LOAN: Loan = {
  id: "loan_nillc",
  property: "4000",
  partnership: "Neshaminy Interplex, LLC",
  collateral: "O.B. #5,6,7,8, Kor-Center",
  lender: "Liberty Bank",
  group: "Business Parks",
  originalBalance: 26500000,
  annualRatePct: 4.9,
  amortYears: 25,
  scheduledPayment: 153376.33,
  maturityDate: "2028-03-01",
  anchorBalance: 22789590.83,
  anchorDate: "2026-04-01",
  interestOnly: true,
  amendment: {
    startDate: "2026-04-01",
    endDate: "2028-03-01",
    principalPerMonth: 20050,
  },
  escrowPerMonth: 39044.39,
  escrowEffective: "2026-10-01",
  notes:
    "Refinanced 3/6/2019 at $26,500,000 on a 25-yr amortization; has been " +
    "interest-only. AMENDMENT NOW BILLING (effective 4/1/2026): fixed " +
    "$20,050/mo principal plus interest on the declining balance through " +
    "3/1/2028. Liberty's escrow-reset letter for 10/2026 bills exactly that " +
    "— '$59,094.39, PLUS INTEREST, of which $20,050 will be for principal, " +
    "$39,044.39 will go into escrow, and the remainder will be interest " +
    "due' — which is the amendment structure, so it is no longer pending. " +
    "NOTE the $59,094.39 is NOT the full debit: interest is charged on top " +
    "of it, so the real monthly outlay is principal + escrow + interest on " +
    "the declining balance (roughly $152K at the current balance and 4.900%) " +
    "and it falls as the balance amortizes. Per the 4/18/2026 statement: principal balance " +
    "$22,789,590.83, escrow balance $324,622.90, rate 4.900%, YTD interest " +
    "$372,229.98, prior-year interest $1,119,319.73. Payments auto-debit " +
    "from account x2190.",
};

// Brookwood (property 2300) — Liberty Bank. Amortizing.
export const BROOKWOOD_2300_LOAN: Loan = {
  id: "loan_brookwood",
  property: "2300",
  partnership: "Brookwood Joint Venture",
  collateral: "Shopping Center",
  lender: "Liberty Bank",
  group: "Shopping Centers",
  originalBalance: 5000000,
  annualRatePct: 3.5,
  amortYears: 25,
  scheduledPayment: 25031.18,
  maturityDate: "2027-09-01",
  anchorBalance: 4228154.76,
  anchorDate: "2026-04-01",
  interestOnly: false,
  escrowPerMonth: 14054.97,
  escrowEffective: "2026-10-01",
  notes:
    "Refinanced 8/14/2020 at $5,000,000 @ 3.5% on a 25-yr amortization. " +
    "Prepayment with 30 days notice: 5/4/3/2/1% yrs 1-5. Per the latest " +
    "Liberty statement: principal balance $4,228,154.76, escrow balance " +
    "$86,228.40, rate 3.500%, YTD interest $49,696.71, prior-year interest " +
    "$152,567.52. P&I $25,031.18/mo, payments auto-debit from account x5615. " +
    "Liberty escrow reset effective 10/2026: total monthly debit $39,086.15 " +
    "— P&I $25,031.18 unchanged, escrow $14,054.97. The loan terms did not " +
    "change; only the tax/insurance escrow did.",
};

// Grays Ferry (property 4500) — Liberty Bank. Amortizing.
export const GRAYS_FERRY_4500_LOAN: Loan = {
  id: "loan_graysferry",
  property: "4500",
  partnership: "Grays Ferry Partners, L.P.",
  collateral: "Shopping Center",
  lender: "Liberty Bank",
  group: "Shopping Centers",
  originalBalance: 9000000,
  annualRatePct: 3.55,
  amortYears: 25,
  scheduledPayment: 45297.82,
  maturityDate: "2028-10-01",
  anchorBalance: 7908407.12,
  anchorDate: "2026-04-01",
  interestOnly: false,
  escrowPerMonth: 15416.63,
  escrowEffective: "2026-10-01",
  notes:
    "Originated 9/21/2021 at $9,000,000 @ 3.55% on a 25-yr amortization, " +
    "7-yr term — payments began 11/1/2021 and mature 10/1/2028. Prepayment " +
    "with 30 days notice: 5/4/3/2/1% yrs 1-5. Per the latest Liberty " +
    "statement: principal balance $7,908,407.12, escrow balance $33,678.44, " +
    "rate 3.550%, YTD interest $94,226.94, prior-year interest $288,762.04. " +
    "P&I $45,297.82/mo, payments auto-debit from account x0598. " +
    "Liberty escrow reset effective 10/2026: total monthly debit $60,714.46 " +
    "— P&I $45,297.83, escrow $15,416.63. NOTE the bank's letter states P&I " +
    "one cent above the $45,297.82 previously on the statements; the loan " +
    "terms did not change.",
};

// Parkwood (property 7010) — Liberty Bank. Amortizing.
export const PARKWOOD_7010_LOAN: Loan = {
  id: "loan_parkwood",
  property: "7010",
  partnership: "Parkwood Joint Venture",
  collateral: "Shopping Center",
  lender: "Liberty Bank",
  group: "Shopping Centers",
  originalBalance: 4750000,
  annualRatePct: 3.5,
  amortYears: 25,
  scheduledPayment: 23779.62,
  maturityDate: "2027-09-01",
  anchorBalance: 4016747.06,
  anchorDate: "2026-04-01",
  interestOnly: false,
  escrowPerMonth: 13172.12,
  escrowEffective: "2026-10-01",
  notes:
    "Refinanced 8/14/2020 at $4,750,000 @ 3.5% on a 25-yr amortization. " +
    "Prepayment with 30 days notice: 5/4/3/2/1% yrs 1-5. Per the latest " +
    "Liberty statement: principal balance $4,016,747.06, escrow balance " +
    "$23,109.62, rate 3.500%, YTD interest $47,211.88, prior-year interest " +
    "$144,939.16. P&I $23,779.62/mo, payments auto-debit from account x5656. " +
    "Liberty escrow reset effective 10/2026: total monthly debit $36,951.74 " +
    "— P&I $23,779.62 unchanged, escrow $13,172.12. The loan terms did not " +
    "change; only the tax/insurance escrow did.",
};

/** All loans are code-managed and reconciled to these definitions on load. */
/**
 * KH-Joshua 3044 LLC (property 9840) — M&T Bank. Interest-only ARM.
 *
 * NOTE the property code. The loan was handed over as "3620 KH Joshua", but
 * 3620 is Building 2 at Neshaminy Interplex; KH Joshua is 3044 Joshua Rd,
 * property 9840, and the Closing Disclosure's security interest names that
 * address.
 *
 * TWO THINGS THIS MODEL CANNOT EXPRESS, both real and both dated in the notes:
 *
 *  1. Interest-only for the first 120 payments, THEN amortizing over the
 *     remaining 20 years. `interestOnly` is a boolean with no expiry, so the
 *     projected schedule is interest-only for its whole length and is only
 *     right through 9/2036. After that the real payment steps up sharply.
 *  2. It is a 7/6 ARM. `annualRatePct` is a single fixed rate, correct only
 *     through the first change at payment 85 (10/2033); beyond that the rate
 *     floats and the projection is indicative at best.
 *
 * Both dates matter more than the 2056 maturity — the payment shock arrives
 * long before the loan does.
 */
export const KH_JOSHUA_9840_LOAN: Loan = {
  id: "loan_khjoshua",
  property: "9840",
  partnership: "KH-Joshua 3044 LLC",
  collateral: "3044 Joshua Rd, Lafayette Hill",
  lender: "M&T Bank",
  group: "Residential",
  originalBalance: 375000,
  annualRatePct: 5.625,
  amortYears: 30,
  scheduledPayment: 1757.81,
  maturityDate: "2056-09-01",
  // Balance is true from disbursement and stays there: no principal is paid
  // for ten years. Anchored a month before the first payment (10/1/2026) so
  // the projected dates land on the 1st, matching the bank's due dates.
  anchorBalance: 375000,
  anchorDate: "2026-09-01",
  interestOnly: true,
  // NO ESCROW — the borrower declined it, so taxes and insurance are paid
  // direct, NOT collected with the payment. The $1,757.81 is the whole debit.
  // Budget roughly $7,618.56/yr of property costs separately (CD page 4).
  notes:
    "Refinance closed 8/21/2026 at $375,000 with M&T Bank; first payment " +
    "10/1/2026. Product: 30-yr term, 10-YEAR INTEREST ONLY, 7/6 mo. ARM. " +
    "Initial rate 5.625% — $1,757.81/mo, which is interest only " +
    "($375,000 × 5.625% ÷ 12). NO ESCROW: escrow was declined, so property " +
    "taxes and insurance are paid directly (est. $7,618.56 in year 1) and " +
    "are NOT part of the payment. " +
    "TWO STEP-UPS AHEAD: (1) first rate change at payment 85 — 10/2033 — " +
    "then every 6 months, SOFR 30-day avg + 3.00%, floor 3%, ceiling " +
    "10.625%, capped 5% at the first change and 1% after; P&I then ranges " +
    "$938–$3,320. (2) principal begins at payment 121 — 10/2036 — " +
    "amortizing the balance over the remaining 20 years, with a maximum " +
    "payment of $3,775. The projected schedule here is interest-only " +
    "throughout and is therefore reliable only through 9/2036. " +
    "No prepayment penalty, no balloon, no negative amortization; loan is " +
    "not assumable. Late fee 5% of P&I after 15 days. Appraised value " +
    "$503,000; cash to borrower at closing $361,259.98. " +
    "M&T loan ID 0080462021 (the CD's first page carries 0080451420 from an " +
    "earlier disclosure — 0080462021 is the servicing account). " +
    "Statement of Values: ENTITY_VALUES is a frozen 12/31/2025 snapshot and " +
    "correctly shows this entity with no debt, because the loan closed after " +
    "it. The next snapshot must pick up the $375,000 and the closing cash.",
};

export const MANAGED_LOANS: Loan[] = [
  KH_JOSHUA_9840_LOAN,
  JV_III_3600_LOAN,
  NI_LLC_4000_LOAN,
  BROOKWOOD_2300_LOAN,
  GRAYS_FERRY_4500_LOAN,
  PARKWOOD_7010_LOAN,
];

export const SEED_LOANS: Loan[] = MANAGED_LOANS;

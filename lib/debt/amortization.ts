// Debt Tracker data model + live amortization engine.
//
// A loan is anchored to a known statement balance (`anchorBalance` as of
// `anchorDate`). The schedule is projected forward month-by-month from that
// anchor so the "current" balance and position stay live as time passes —
// no need to re-key the balance every month.

export const LOAN_GROUPS = ["Business Parks", "Shopping Centers"] as const;
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
  notes:
    "Refinanced 7/11/2019 at $7,100,000 on a 25-yr amortization. Term " +
    "extended through 3/1/2028 alongside the NI LLC extension; remains " +
    "interest-only (no fixed-principal amendment). Per the 4/18/2026 " +
    "Liberty statement: principal balance $6,139,294.10, escrow balance " +
    "$115,895.31, rate 4.500%, YTD interest $92,089.42, prior-year " +
    "interest $263,945.77. Payments auto-debit from account x5631.",
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
  notes:
    "Refinanced 3/6/2019 at $26,500,000 on a 25-yr amortization; has been " +
    "interest-only. PENDING AMENDMENT (effective 4/1/2026, not yet signed): " +
    "fixed $20,050/mo principal plus interest on the declining balance " +
    "through 3/1/2028 — the schedule below reflects it from the first " +
    "projected payment; adjust the amendment start once it posts to the " +
    "Liberty statements. Per the 4/18/2026 statement: principal balance " +
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
  notes:
    "Refinanced 8/14/2020 at $5,000,000 @ 3.5% on a 25-yr amortization. " +
    "Prepayment with 30 days notice: 5/4/3/2/1% yrs 1-5. Per the latest " +
    "Liberty statement: principal balance $4,228,154.76, escrow balance " +
    "$86,228.40, rate 3.500%, YTD interest $49,696.71, prior-year interest " +
    "$152,567.52. P&I $25,031.18/mo, payments auto-debit from account x5615.",
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
  notes:
    "Originated 9/21/2021 at $9,000,000 @ 3.55% on a 25-yr amortization, " +
    "7-yr term — payments began 11/1/2021 and mature 10/1/2028. Prepayment " +
    "with 30 days notice: 5/4/3/2/1% yrs 1-5. Per the latest Liberty " +
    "statement: principal balance $7,908,407.12, escrow balance $33,678.44, " +
    "rate 3.550%, YTD interest $94,226.94, prior-year interest $288,762.04. " +
    "P&I $45,297.82/mo, payments auto-debit from account x0598.",
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
  notes:
    "Refinanced 8/14/2020 at $4,750,000 @ 3.5% on a 25-yr amortization. " +
    "Prepayment with 30 days notice: 5/4/3/2/1% yrs 1-5. Per the latest " +
    "Liberty statement: principal balance $4,016,747.06, escrow balance " +
    "$23,109.62, rate 3.500%, YTD interest $47,211.88, prior-year interest " +
    "$144,939.16. P&I $23,779.62/mo, payments auto-debit from account x5656.",
};

/** All loans are code-managed and reconciled to these definitions on load. */
export const MANAGED_LOANS: Loan[] = [
  JV_III_3600_LOAN,
  NI_LLC_4000_LOAN,
  BROOKWOOD_2300_LOAN,
  GRAYS_FERRY_4500_LOAN,
  PARKWOOD_7010_LOAN,
];

export const SEED_LOANS: Loan[] = MANAGED_LOANS;

// Carryover ("hold under $100") logic for the Allocated Expense Invoicer.
//
// Unlike the credit-card invoicer (which holds at the PROPERTY level), the
// allocated invoicer holds at the EXPENSE level: each GL account's allocation
// to a property accrues on its own. A single account whose ACCRUED balance for
// a property (this month + any carried-forward balance) is under the threshold
// is HELD — it is left off that property's invoice and rolls forward until it
// crosses the threshold, at which point the whole accrued amount bills and the
// account resets to $0. This keeps the monthly coding light: an invoice may
// carry only the few accounts that crossed $100 this month.
//
// YEAR-END EXCEPTION: in December every outstanding balance is flushed — even
// under the threshold — so all expenses are booked in the year they occurred
// and nothing carries into the next year's books.
//
// The "expense" unit is the BASE account code (e.g. "8220"), i.e. the coded
// -8501 payable line on the invoice — a single account's suffix rows accrue
// together.
//
// Pure types + math only (NO server-only imports) so the client page, the API
// route, and the tests can all share one source of truth.

export const CARRYOVER_THRESHOLD = 100;

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** December statements flush all balances (year-end booking). */
export function isYearEndMonth(statementMonth: string): boolean {
  return /-12$/.test(statementMonth || "");
}

/** The base account code for a suffixed GL code ("8220-9301" → "8220"). */
export function baseAccountCode(code: string): string {
  return String(code || "").replace(/-\d{3,4}$/, "");
}

/** One month's contribution to a held account. */
export type HeldMonth = { statementMonth: string; amount: number };

/** A single held expense: one base GL account's carried balance for a property. */
export type AccountCarry = {
  accountCode: string; // base code, e.g. "8220"
  accountName: string;
  /** Accrued balance carried forward (sum of the held months). */
  heldTotal: number;
  months: HeldMonth[];
  /** Earliest statement month (YYYY-MM) contributing to this balance. */
  sinceMonth: string;
  updatedAt: string;
};

export type PropertyCarry = {
  propertyId: string;
  /** Keyed by base account code. */
  accounts: Record<string, AccountCarry>;
  updatedAt: string;
};

export type CarryoverLedger = {
  /** Keyed by propertyId. */
  balances: Record<string, PropertyCarry>;
  /** Statement months (YYYY-MM) already finalized — guards against double-counting. */
  committedPeriods: string[];
  /** Amount already recognized (billed or held) per `${pid}|${acct}|${month}`, so
   *  re-processing a month bills only what's NEW. This is what closes the
   *  late-charge gap: a charge that posts to an already-finalized month shows up
   *  as a positive delta (current allocation − recognized) and gets caught up
   *  instead of skipped. Optional for back-compat with pre-existing ledgers. */
  recognized?: Record<string, number>;
  /** Months whose recognized baseline is trustworthy. A month finalized AFTER
   *  this feature shipped is baselined here; a month committed BEFORE it (no
   *  per-account history) is NOT — on its first re-import we backfill the
   *  baseline from the current GL (assume what's there was already billed) rather
   *  than re-billing the whole month. Optional for back-compat. */
  recognizedMonths?: string[];
  updatedAt: string;
};

export function emptyLedger(): CarryoverLedger {
  return { balances: {}, committedPeriods: [], recognized: {}, recognizedMonths: [], updatedAt: "" };
}

export function recognizedKey(propertyId: string, accountCode: string, statementMonth: string): string {
  return `${propertyId}|${accountCode}|${statementMonth}`;
}

/** Amount already recognized for one (property, account, month) — 0 if none. */
export function recognizedFor(ledger: CarryoverLedger, propertyId: string, accountCode: string, statementMonth: string): number {
  return round2(ledger.recognized?.[recognizedKey(propertyId, accountCode, statementMonth)] ?? 0);
}

/** Whether a month's recognized baseline is trustworthy (finalized post-feature,
 *  or already backfilled). A committed-but-not-baselined month is legacy. */
export function isMonthBaselined(ledger: CarryoverLedger, statementMonth: string): boolean {
  return (ledger.recognizedMonths ?? []).includes(statementMonth);
}

export type RecognizedUpdate = { propertyId: string; accountCode: string; statementMonth: string; amount: number };

/** Set recognized amounts and mark their months baselined. Pure. Used to
 *  backfill a legacy committed month's baseline and to record catch-up deltas. */
export function applyRecognized(ledger: CarryoverLedger, updates: RecognizedUpdate[], nowISO: string): CarryoverLedger {
  const recognized = { ...(ledger.recognized ?? {}) };
  const months = new Set(ledger.recognizedMonths ?? []);
  for (const u of updates) {
    recognized[recognizedKey(u.propertyId, u.accountCode, u.statementMonth)] = round2(u.amount);
    months.add(u.statementMonth);
  }
  return { ...ledger, recognized, recognizedMonths: [...months], updatedAt: nowISO };
}

/** Apply catch-up deltas (late charges to already-finalized months) to the held
 *  balances WITHOUT committing a period — the delta is added to each account's
 *  current accrual and billed now if it (with any held prior) crosses $100, else
 *  held forward. `asOfMonth` drives the year-end flush rule. Pure. */
export function applyCatchupToLedger(
  ledger: CarryoverLedger,
  expenses: MonthExpense[],
  asOfMonth: string,
  nowISO: string,
): { ledger: CarryoverLedger; decisions: ExpenseDecision[] } {
  const next: CarryoverLedger = {
    ...ledger,
    balances: cloneBalances(ledger.balances),
    committedPeriods: [...ledger.committedPeriods],
    recognized: { ...(ledger.recognized ?? {}) },
    recognizedMonths: [...(ledger.recognizedMonths ?? [])],
    updatedAt: nowISO,
  };
  const decisions: ExpenseDecision[] = [];
  for (const e of expenses) {
    const pid = e.propertyId, acct = e.accountCode;
    const thisMonth = round2(e.amount);
    const prior = priorForAccount(ledger, pid, acct);
    const accrued = round2(thisMonth + prior);
    const billed = isAccountBilled(accrued, asOfMonth);
    decisions.push({ propertyId: pid, accountCode: acct, accountName: e.accountName, thisMonth, prior, accrued, billed });
    if (!next.balances[pid]) next.balances[pid] = { propertyId: pid, accounts: {}, updatedAt: nowISO };
    if (billed) {
      delete next.balances[pid].accounts[acct];
    } else {
      const existing = ledger.balances[pid]?.accounts[acct];
      next.balances[pid].accounts[acct] = {
        accountCode: acct,
        accountName: e.accountName || existing?.accountName || acct,
        heldTotal: accrued,
        months: [...(existing?.months ?? []), { statementMonth: `catchup:${asOfMonth}`, amount: thisMonth }],
        sinceMonth: existing?.sinceMonth || asOfMonth,
        updatedAt: nowISO,
      };
    }
  }
  for (const pid of Object.keys(next.balances)) {
    if (Object.keys(next.balances[pid].accounts).length === 0) delete next.balances[pid];
  }
  return { ledger: next, decisions };
}

/** Carried-forward balance for one account of a property (0 if none). */
export function priorForAccount(
  ledger: CarryoverLedger,
  propertyId: string,
  accountCode: string,
): number {
  return round2(ledger.balances[propertyId]?.accounts[accountCode]?.heldTotal ?? 0);
}

/** Total carried-forward balance across all of a property's held accounts. */
export function priorForProperty(ledger: CarryoverLedger, propertyId: string): number {
  const pc = ledger.balances[propertyId];
  if (!pc) return 0;
  return round2(Object.values(pc.accounts).reduce((s, a) => s + (Number(a.heldTotal) || 0), 0));
}

/** Whether an account bills given its accrued balance and the statement month. */
export function isAccountBilled(accrued: number, statementMonth: string): boolean {
  if (isYearEndMonth(statementMonth)) return true; // year-end: flush everything
  return round2(accrued) >= CARRYOVER_THRESHOLD;
}

/** This month's allocation for one base account of one property. */
export type MonthExpense = {
  propertyId: string;
  accountCode: string; // base code
  accountName: string;
  amount: number;
};

export type ExpenseDecision = {
  propertyId: string;
  accountCode: string;
  accountName: string;
  thisMonth: number;
  prior: number;
  accrued: number;
  billed: boolean;
};

export type FinalizeResult = {
  ledger: CarryoverLedger;
  decisions: ExpenseDecision[];
};

function cloneBalances(balances: Record<string, PropertyCarry>): Record<string, PropertyCarry> {
  const out: Record<string, PropertyCarry> = {};
  for (const [pid, pc] of Object.entries(balances)) {
    out[pid] = { propertyId: pid, accounts: { ...pc.accounts }, updatedAt: pc.updatedAt };
  }
  return out;
}

/**
 * Apply one finalized month to the ledger. For every (property, account):
 * billed accounts reset to $0; held accounts accrue (this month appended to the
 * carried detail). Accounts held from prior months with no activity this month
 * simply carry forward unchanged — except at year-end, when every remaining
 * balance is flushed (billed) too. Pure: returns the next ledger, never mutates
 * the input.
 */
export function finalizeMonth(
  ledger: CarryoverLedger,
  statementMonth: string,
  expenses: MonthExpense[],
  nowISO: string,
): FinalizeResult {
  const yearEnd = isYearEndMonth(statementMonth);
  const next: CarryoverLedger = {
    balances: cloneBalances(ledger.balances),
    committedPeriods: [...ledger.committedPeriods],
    // A fresh month's expenses ARE its allocation (this month = current alloc),
    // so record them as the recognized baseline + mark the month baselined. That
    // makes a later re-import of this month bill only the delta.
    recognized: { ...(ledger.recognized ?? {}) },
    recognizedMonths: [...new Set([...(ledger.recognizedMonths ?? []), statementMonth])],
    updatedAt: nowISO,
  };
  const decisions: ExpenseDecision[] = [];
  const seen = new Set<string>(); // `${pid}|${acct}` processed this month

  for (const e of expenses) {
    const pid = e.propertyId;
    const acct = e.accountCode;
    seen.add(`${pid}|${acct}`);
    const thisMonth = round2(e.amount);
    next.recognized![recognizedKey(pid, acct, statementMonth)] = thisMonth;
    const prior = priorForAccount(ledger, pid, acct);
    const accrued = round2(thisMonth + prior);
    const billed = isAccountBilled(accrued, statementMonth);
    decisions.push({ propertyId: pid, accountCode: acct, accountName: e.accountName, thisMonth, prior, accrued, billed });

    if (!next.balances[pid]) next.balances[pid] = { propertyId: pid, accounts: {}, updatedAt: nowISO };
    if (billed) {
      delete next.balances[pid].accounts[acct];
    } else {
      const existing = ledger.balances[pid]?.accounts[acct];
      next.balances[pid].accounts[acct] = {
        accountCode: acct,
        accountName: e.accountName || existing?.accountName || acct,
        heldTotal: accrued,
        months: [...(existing?.months ?? []), { statementMonth, amount: thisMonth }],
        sinceMonth: existing?.sinceMonth || statementMonth,
        updatedAt: nowISO,
      };
    }
  }

  // Year-end: flush every remaining held account, including accounts that saw no
  // activity this month (so nothing carries into next year).
  if (yearEnd) {
    for (const pc of Object.values(ledger.balances)) {
      for (const ac of Object.values(pc.accounts)) {
        if (seen.has(`${pc.propertyId}|${ac.accountCode}`)) continue;
        decisions.push({
          propertyId: pc.propertyId,
          accountCode: ac.accountCode,
          accountName: ac.accountName,
          thisMonth: 0,
          prior: round2(ac.heldTotal),
          accrued: round2(ac.heldTotal),
          billed: true,
        });
      }
    }
    for (const pid of Object.keys(next.balances)) next.balances[pid].accounts = {};
  }

  // Drop emptied property entries.
  for (const pid of Object.keys(next.balances)) {
    if (Object.keys(next.balances[pid].accounts).length === 0) delete next.balances[pid];
  }

  if (!next.committedPeriods.includes(statementMonth)) next.committedPeriods.push(statementMonth);
  return { ledger: next, decisions };
}

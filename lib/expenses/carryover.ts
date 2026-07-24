// Carryover ("hold under $100") logic for the Credit Card Expense invoicer.
//
// The invoicer is otherwise single-month and stateless. To avoid cutting tiny
// reimbursement checks, a property whose ACCRUED balance (this month + any
// carried-forward balance) is under the threshold is HELD: no invoice, and the
// property is pulled from the GL Journal Entry + TOP SHEET that month too
// ("hold everything together"). Its charges roll forward until the accrued
// balance crosses the threshold, at which point the whole accrued amount bills
// and posts in that month.
//
// YEAR-END EXCEPTION: in December every outstanding balance is flushed — even
// under the threshold — so all expenses are booked in the year they occurred
// and nothing carries into the next year's books.
//
// Pure types + math only (NO server-only imports) so the client page, the API
// route, and the tests can all share one source of truth.

export const CARRYOVER_THRESHOLD = 100;

// Properties never held (internal / non-check). 2010 is the LIK Management
// "DO NOT PROCESS" tracking statement and is specially handled by the GL
// Journal Entry, so it must always be included.
export const CARRYOVER_EXEMPT = new Set<string>(["2010"]);

export type HeldTx = {
  date: string;
  cardMember: string;
  description: string;
  codedDescription: string;
  category: string;
  propertyId: string;
  suite: string;
  amount: number;
  originalAmount?: number;
  /** The statement month (YYYY-MM) this charge was first held from. */
  statementMonth: string;
};

export type PropertyCarry = {
  propertyId: string;
  /** Sum of heldTx amounts. */
  heldTotal: number;
  heldTx: HeldTx[];
  /** Earliest statement month (YYYY-MM) contributing to this balance. */
  sinceMonth: string;
  updatedAt: string;
};

export type CarryoverLedger = {
  /** Keyed by propertyId. */
  balances: Record<string, PropertyCarry>;
  /** Statement months (YYYY-MM) already finalized — guards against double-counting. */
  committedPeriods: string[];
  /** Ids of one-time preload seeds already applied (guards against re-adding). */
  appliedSeeds?: string[];
  updatedAt: string;
};

export function emptyLedger(): CarryoverLedger {
  return { balances: {}, committedPeriods: [], appliedSeeds: [], updatedAt: "" };
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** December statements flush all balances (year-end booking). */
export function isYearEndMonth(statementMonth: string): boolean {
  return /-12$/.test(statementMonth || "");
}

/** Carried-forward balance for a property (0 if none). */
export function priorBalance(ledger: CarryoverLedger, propertyId: string): number {
  return round2(ledger.balances[propertyId]?.heldTotal ?? 0);
}

/** Whether a property bills given its accrued balance and the statement month. */
export function isBilled(propertyId: string, accrued: number, statementMonth: string): boolean {
  if (isYearEndMonth(statementMonth)) return true;     // year-end: flush everything
  if (CARRYOVER_EXEMPT.has(propertyId)) return true;   // internal / always-billed
  return round2(accrued) >= CARRYOVER_THRESHOLD;
}

export type PropertyDecision = {
  propertyId: string;
  thisMonth: number;
  prior: number;
  accrued: number;
  billed: boolean;
};

export type MonthProperty = {
  propertyId: string;
  /** This month's coded + allocation-expanded charges for the property. */
  tx: HeldTx[];
};

export type FinalizeResult = {
  ledger: CarryoverLedger;
  decisions: PropertyDecision[];
};

/**
 * Apply one finalized month to the ledger. Billed properties reset to $0; held
 * properties accrue (this month's detail appended to their carried detail). At
 * year-end, every remaining balance is flushed too — including properties with
 * no charges this month. Pure: returns the next ledger, never mutates input.
 */
export function finalizeMonth(
  ledger: CarryoverLedger,
  statementMonth: string,
  properties: MonthProperty[],
  nowISO: string,
): FinalizeResult {
  const yearEnd = isYearEndMonth(statementMonth);
  const next: CarryoverLedger = {
    balances: { ...ledger.balances },
    committedPeriods: [...ledger.committedPeriods],
    appliedSeeds: ledger.appliedSeeds ? [...ledger.appliedSeeds] : [],
    updatedAt: nowISO,
  };
  const decisions: PropertyDecision[] = [];
  const processed = new Set<string>();

  for (const p of properties) {
    processed.add(p.propertyId);
    const thisMonth = round2(p.tx.reduce((s, t) => s + (Number(t.amount) || 0), 0));
    const prior = priorBalance(ledger, p.propertyId);
    const accrued = round2(thisMonth + prior);
    const billed = isBilled(p.propertyId, accrued, statementMonth);
    decisions.push({ propertyId: p.propertyId, thisMonth, prior, accrued, billed });

    if (billed) {
      delete next.balances[p.propertyId];
    } else {
      const existing = ledger.balances[p.propertyId];
      next.balances[p.propertyId] = {
        propertyId: p.propertyId,
        heldTotal: accrued,
        heldTx: [...(existing?.heldTx ?? []), ...p.tx],
        sinceMonth: existing?.sinceMonth || statementMonth,
        updatedAt: nowISO,
      };
    }
  }

  // Year-end: flush any held balance that saw no charges this month.
  if (yearEnd) {
    for (const c of Object.values(ledger.balances)) {
      if (processed.has(c.propertyId)) continue;
      decisions.push({
        propertyId: c.propertyId,
        thisMonth: 0,
        prior: round2(c.heldTotal),
        accrued: round2(c.heldTotal),
        billed: true,
      });
      delete next.balances[c.propertyId];
    }
  }

  if (!next.committedPeriods.includes(statementMonth)) {
    next.committedPeriods.push(statementMonth);
  }
  return { ledger: next, decisions };
}

// Payment declarations — a tenant telling us which open charges their payment
// covers, before the cheque arrives.
//
// The problem this exists to solve: a tenant with $16,559 open writes a cheque
// for $6,200 and says nothing. Nobody knows which charges it pays, so the
// payment is applied by guesswork and chased later. Capturing the decision at
// the moment the tenant makes it — on the statement, where they're already
// looking — turns that into a remittance advice we can apply against.
//
// This is deliberately NOT a payment. Nothing here moves money or marks a
// charge paid; it records an intention, which staff reconcile against the
// cheque when it lands.

import type { ChargeCategory, StatementCharge, TenantStatement } from "./types";

/** How the tenant says they're sending it. */
export type RemittanceMethod = "check" | "ach" | "other";

export const METHOD_LABEL: Record<RemittanceMethod, string> = {
  check: "Check",
  ach: "ACH or wire",
  other: "Something else",
};

/** A charge as it was when the tenant selected it — frozen, so a later import
 *  that changes the statement can't rewrite what they said they were paying. */
export type RemittanceLine = {
  dateISO: string | null;
  description: string;
  amount: number;
  category: ChargeCategory;
};

export type Remittance = {
  id: string;
  /** Short human code the tenant writes on the cheque memo line. */
  reference: string;
  period: string;
  unitRef: string;
  propertyCode: string;
  tenantName: string;
  submittedAt: string;
  method: RemittanceMethod;
  /** Server-computed sum of `paying` — never the client's figure. */
  amount: number;
  /** The statement's whole open balance when they declared. */
  statementTotal: number;
  paying: RemittanceLine[];
  /** What they left out — as useful as what they selected, since it's the
   *  disputed or deferred half and it's where the phone call comes from. */
  holding: RemittanceLine[];
  note: string;
};

/** Crockford-style alphabet: no I, L, O or U, so a handwritten reference on a
 *  cheque memo can't be misread as 1, 0 or V. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function makeReference(rand: () => number = Math.random): string {
  let out = "";
  for (let i = 0; i < 6; i++) out += ALPHABET[Math.floor(rand() * ALPHABET.length)];
  return out;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Identity of a charge within a statement. Date + description + amount is
 *  enough — a tenant genuinely billed the same thing twice has two selectable
 *  lines, and selecting "both" is expressed by sending the index twice. */
const lineKey = (c: { dateISO: string | null; description: string; amount: number }) =>
  `${c.dateISO ?? ""}|${c.description}|${c.amount.toFixed(2)}`;

// Flat shape, not a discriminated union — this project's tsconfig is
// non-strict, so a union doesn't narrow at the call site (same reason
// lib/cam/tenantLink/access.ts uses a flat AccessResult).
export type SelectionResult = {
  ok: boolean;
  error?: string;
  paying?: RemittanceLine[];
  holding?: RemittanceLine[];
  amount?: number;
};

/**
 * Resolve a tenant's selection against their actual statement.
 *
 * The client sends charge indexes; everything else — which lines those are,
 * what they sum to — is derived here from the stored statement. A client that
 * sends a total, an unknown charge, or an index twice gets rejected rather than
 * recorded, because this figure is what staff will reconcile a cheque against.
 */
export function resolveSelection(
  statement: TenantStatement,
  charges: StatementCharge[],
  indexes: unknown,
): SelectionResult {
  if (!Array.isArray(indexes)) return { ok: false, error: "No charges were selected." };
  const seen = new Set<number>();
  for (const raw of indexes) {
    const i = Number(raw);
    if (!Number.isInteger(i) || i < 0 || i >= charges.length) {
      return { ok: false, error: "That selection doesn't match your statement — reload and try again." };
    }
    if (seen.has(i)) return { ok: false, error: "A charge was selected twice." };
    seen.add(i);
  }
  if (seen.size === 0) return { ok: false, error: "Select at least one charge to pay." };

  const toLine = (c: StatementCharge): RemittanceLine => ({
    dateISO: c.dateISO, description: c.description, amount: c.amount, category: c.category,
  });
  const paying = charges.filter((_, i) => seen.has(i)).map(toLine);
  const holding = charges.filter((_, i) => !seen.has(i)).map(toLine);
  const amount = round(paying.reduce((a, c) => a + c.amount, 0));

  // A selection that nets to nothing or a credit isn't a payment.
  if (amount <= 0) return { ok: false, error: "The charges you selected don't add up to a payment." };
  // Guard against a stale page: the statement must still hold what they picked.
  const available = new Set(statement.charges.map(lineKey));
  for (const l of paying) {
    if (!available.has(lineKey(l))) {
      return { ok: false, error: "Your statement has been updated — reload it and select again." };
    }
  }
  return { ok: true, paying, holding, amount };
}

/** True when the tenant selected everything — the common case, and worth
 *  distinguishing because it needs no reconciliation work at all. */
export function isPayingInFull(r: Pick<Remittance, "amount" | "statementTotal">): boolean {
  return Math.abs(r.amount - r.statementTotal) < 0.011;
}

// The month's tenant notices, as ONE batch Greg approves (owner, 11/2026:
// "for greg, set all to SEND as default and allow him to UNSELECT tenants to
// withhold sending"). Pure: the store builds it from the accounts, the review
// page and the send read it.

import type { Account } from "./receiptMatch";
import { creditPlan, tierOf, oldestChargeMonths, type CreditPlan, type ReminderTier } from "./monthlyReminder";

export type BatchItemStatus = "pending" | "sent" | "failed";

export type BatchItem = {
  unitRef: string;
  propertyCode: string;
  propertyName: string;
  tenantName: string;
  suite: string;
  tier: ReminderTier;
  /** The account as the notice shows it (snapshot at build). */
  acct: Account;
  /** The laser-statement month the account was read from (the PDF attached). */
  period: string;
  asOf: string;
  oldestMonths: number | null;
  /** The suite's regular monthly charges (rent roll gross), for the credit plan. */
  monthlyCharges: number | null;
  recipients: string[];
  /** Ticked to send. Default TRUE; Greg unticks to withhold. */
  send: boolean;
  /** Why it can't go even when ticked (no email on file). */
  blocked?: string | null;
  status: BatchItemStatus;
  sentAt?: string | null;
  sentTo?: string[];
  error?: string | null;
  correspondenceId?: string | null;
  /** Who unticked / re-ticked it last. */
  toggledBy?: string | null;
};

export type ReminderBatch = {
  /** The notice month, YYYY-MM. */
  month: string;
  /** The month the statements the notice points at are for. */
  nextYM: string;
  builtAt: string;
  builtBy: string | null;
  /** The Credit Balance Report / laser statement the accounts were read from. */
  dataAsOf: string | null;
  /** The portal origin the apply links are built on. */
  origin: string;
  items: BatchItem[];
  /** Greg was emailed to review it. */
  approverNotifiedAt?: string | null;
  /** The Eastern date Greg is reminded, and the date the ticked notices send
   *  on their own if he has not sent them (set at the FIRST build). */
  remindOn?: string | null;
  autoSendOn?: string | null;
  approverRemindedAt?: string | null;
  /** Sent by the automatic send, not a person. */
  autoSent?: boolean;
  approvedAt?: string | null;
  approvedBy?: string | null;
  /** The credit summary to Drew and Tami (business day before the 25th). */
  summarySentAt?: string | null;
};

export type AccountIn = {
  unitRef: string; propertyCode: string; propertyName: string; tenantName: string; suite: string;
  acct: Account; period: string; asOf: string; monthlyCharges: number | null; recipients: string[];
};

/** Former occupants (`-FO`) are never sent a monthly notice. */
export const isFormerOccupant = (unitRef: string) => /-FO$/i.test(unitRef);

/**
 * The batch's items: every account that needs a notice, in the statement's
 * own order. `previous` carries Greg's choices through a rebuild (a second
 * import before he approves) — and anything already SENT is kept as it went.
 */
export function buildItems(accounts: AccountIn[], previous: BatchItem[] = []): BatchItem[] {
  const prev = new Map(previous.map((p) => [p.unitRef.toUpperCase(), p]));
  const out: BatchItem[] = [];
  for (const a of accounts) {
    if (isFormerOccupant(a.unitRef)) continue;
    const before = prev.get(a.unitRef.toUpperCase());
    if (before && before.status === "sent") { out.push(before); continue; }
    const tier = tierOf(a.acct, a.asOf);
    if (!tier) continue;
    const blocked = a.recipients.length ? null : "No email on file";
    out.push({
      ...a, tier, oldestMonths: oldestChargeMonths(a.acct, a.asOf),
      send: before ? before.send : true, toggledBy: before?.toggledBy ?? null,
      blocked, status: "pending", error: null,
    });
  }
  return out;
}

export type BatchCounts = { total: number; toSend: number; withheld: number; blocked: number; sent: number; failed: number; byTier: Record<ReminderTier, number> };

export function batchCounts(items: BatchItem[]): BatchCounts {
  const byTier: Record<ReminderTier, number> = { courtesy: 0, "past-due": 0, credit: 0 };
  let toSend = 0, withheld = 0, blocked = 0, sent = 0, failed = 0;
  for (const i of items) {
    byTier[i.tier]++;
    if (i.status === "sent") { sent++; continue; }
    if (i.status === "failed") failed++;
    if (i.blocked) blocked++;
    else if (i.send) toSend++;
    else withheld++;
  }
  return { total: items.length, toSend, withheld, blocked, sent, failed, byTier };
}

/** Will this item go when Greg presses Send? */
export const willSend = (i: BatchItem) => i.send && !i.blocked && i.status !== "sent";

/** The credit an item's apply link offers — null when it has none. */
export const itemCreditPlan = (i: BatchItem): CreditPlan | null => creditPlan(i.acct, i.monthlyCharges);

// ─── Credit requests ─────────────────────────────────────────────────────────

/** A tenant asked us to apply their credit (the notice's button, confirmed). */
export type CreditRequest = {
  id: string;
  month: string;
  nextYM: string;
  unitRef: string; propertyCode: string; propertyName: string; tenantName: string; suite: string;
  plan: CreditPlan;
  requestedAt: string;
  /** Tami posted it in Skyline. */
  postedAt?: string | null;
  postedBy?: string | null;
  tamiNotifiedAt?: string | null;
  tenantConfirmedAt?: string | null;
  confirmationTo?: string[];
};

export const creditRequestId = (month: string, unitRef: string) => `${month}_${unitRef.toUpperCase()}`;

/** The summary's order: not yet posted first, then by property and suite. */
export function summaryOrder(reqs: CreditRequest[]): CreditRequest[] {
  return [...reqs].sort((a, b) => Number(!!a.postedAt) - Number(!!b.postedAt)
    || a.propertyCode.localeCompare(b.propertyCode) || a.unitRef.localeCompare(b.unitRef));
}

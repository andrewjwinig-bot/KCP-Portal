// The monthly tenant notices, end to end (owner, 11/2026). See
// reminderBatch.ts for the shape and monthlyReminder.ts for the emails.
//
//   build      — ANY Credit Balance Report import on or after the 15th builds
//                (or rebuilds, keeping Greg's unticks) the month's batch and,
//                the first time, emails Greg to review it ("if anyone has
//                imported the credit balance report then trigger it to send
//                to greg")
//   send       — Greg (or Drew / Tami / admin) presses Send: every ticked
//                notice goes, one email per tenant, from the company
//   apply      — a tenant's "apply my credit" confirm records the request,
//                emails Tami what to post and the tenant a confirmation
//   summary    — the business day before the 25th, every credit asked for,
//                unposted first, to Drew and Tami

import { takeLock, releaseLock } from "@/lib/lock";
import "server-only";
import { getJSON, listJSON, storeJSON } from "@/lib/storage";
import { allRuns } from "./store";
import { allAgingSnapshots, currentAging } from "./agingStore";
import { statementOf } from "./currentAccount";
import { accountOf } from "./receiptMatch";
import { propertyLabel, statementPdf, suiteRecipients } from "./tenantMail";
import { resolveCurrentRentroll } from "@/lib/rentroll/current";
import { sendMailDetailed, VERIFIED_FROM, type MailMessage, type MailResult } from "@/lib/mail";
import { newCorrespondenceId, recordTenantEmail } from "./correspondenceStore";
import {
  AR_CONTACT_EMAIL, NOTICE_FROM_NAME, creditPlan, monthlyReminderParts, openAfterCredit,
  renderCreditAppliedEmail, renderMonthlyReminder, type MonthlyReminderInput,
} from "./monthlyReminder";
import {
  autoSendFreshness, batchCounts, buildItems, creditRequestId, dataFreshness, itemCreditPlan, staleMessage, summaryOrder, willSend,
  type AccountIn, type BatchItem, type CreditRequest, type ReminderBatch,
} from "./reminderBatch";
import { approvalReminderEmail, approvalRequestEmail, creditSummaryEmail, postCreditEmail, staleDataEmail } from "./reminderInternalEmails";
import { getOrEmptySuiteContacts, saveSuiteContacts } from "@/lib/suites/contactsStorage";
import { emptyContact } from "@/lib/suites/contacts";
import { addBusinessHours, applyDeadline, AUTO_SEND_AFTER_HOURS, creditSummaryDay, etDateOf, etToday, nextMonthOf, NOTICE_DAY, REMIND_AFTER_HOURS } from "./reminderSchedule";
import { signCreditApplyToken, creditApplySecret } from "./creditApplyLink";

const BATCHES = "tenant-reminder-batches";
const REQUESTS = "tenant-credit-requests";

/** Where the notices come from. `ar@` until verified in Postmark falls back
 *  to the portal's verified sender — under the company's name either way. */
export const NOTICE_FROM = (process.env.TENANT_NOTICE_FROM ?? "ar@kormancommercial.com").trim();
/** Greg approves the month's notices (owner: "let Greg approve instead of Tami"). */
export const NOTICE_APPROVER_TO = (process.env.TENANT_NOTICE_APPROVER_TO ?? "gmasciantonio@kormancommercial.com").trim();
/** Who gets the credit summary before statements. */
/** Copied when the notices wait on a fresh Credit Balance Report. */
const STALE_COPY_TO = (process.env.TENANT_NOTICE_STALE_CC ?? "dwinig@kormancommercial.com").trim();
export const CREDIT_SUMMARY_TO = (process.env.CREDIT_SUMMARY_TO ?? `dwinig@kormancommercial.com, ${AR_CONTACT_EMAIL}`).trim();


/** The month's batch. A failed READ throws — it is never "no batch" (bug
 *  audit 11/2026: a blip read as null made buildBatch start the month over,
 *  every notice unsent, saved over the real batch — and the next send re-sent
 *  everything already delivered). */
export async function getBatch(month: string): Promise<ReminderBatch | null> {
  return (await getJSON(BATCHES, month, { retryOnMiss: true })) as ReminderBatch | null;
}

/** ONE writer at a time: Greg's Send, the cron's automatic send and a Credit
 *  Balance import's rebuild all rewrite the batch, and two at once sent
 *  tenants twice (bug audit 11/2026). */
const lockName = (month: string) => `tenant-notices-${month}`;
async function withBatchLock<T>(month: string, busy: () => T, fn: () => Promise<T>): Promise<T> {
  const token = await takeLock(lockName(month));
  if (!token) return busy();
  try { return await fn(); } finally { await releaseLock(lockName(month), token); }
}
/** Save the batch — and a notice the STORED copy shows as sent stays sent,
 *  whoever is saving (Greg unticking, a rebuild, the cron) and however old
 *  their copy is. Only ever adds "sent"; never takes it away. */
async function saveBatch(b: ReminderBatch): Promise<void> {
  const cur = (await getJSON(BATCHES, b.month).catch(() => null)) as ReminderBatch | null;
  if (cur?.items?.length) {
    const sentNow = new Map(cur.items.filter((i) => i.status === "sent").map((i) => [i.unitRef, i]));
    b.items = b.items.map((i) => (i.status !== "sent" && sentNow.has(i.unitRef) ? sentNow.get(i.unitRef)! : i));
    const have = new Set(b.items.map((i) => i.unitRef));
    for (const [ref, i] of sentNow) if (!have.has(ref)) b.items.push(i);
  }
  await storeJSON(BATCHES, b.month, b);
}
export async function listBatches(): Promise<ReminderBatch[]> {
  const all = (await listJSON(BATCHES, { fresh: true }).catch(() => [])) as ReminderBatch[];
  return all.filter(Boolean).sort((a, b) => b.month.localeCompare(a.month));
}

/** Send from the company. Postmark refuses an unverified sender, so a refused
 *  `ar@` retries from the portal's verified address, same display name. */
async function sendNotice(msg: Omit<MailMessage, "from">): Promise<{ result: MailResult; from: string }> {
  let from = `${NOTICE_FROM_NAME} <${NOTICE_FROM}>`;
  let result = await sendMailDetailed({ ...msg, from });
  if (!result.ok && NOTICE_FROM.toLowerCase() !== VERIFIED_FROM.toLowerCase()) {
    console.warn(`[tenant-notices] sending from ${NOTICE_FROM} refused (${result.error}) — retrying from ${VERIFIED_FROM}`);
    from = `${NOTICE_FROM_NAME} <${VERIFIED_FROM}>`;
    result = await sendMailDetailed({ ...msg, from });
  }
  return { result, from };
}

// ─── Build ───────────────────────────────────────────────────────────────────

/** Every tenant's account as it stands: the newest laser statement's roster
 *  (plus anyone only on the Credit Balance Report), each read through
 *  `statementOf` — the same reader Receipt Reconciliation and Open Credits use. */
/** When the newest Credit Balance Report was run in Skyline (else imported). */
async function newestReportRun(): Promise<string | null> {
  const snaps = await allAgingSnapshots().catch(() => []);
  let best: string | null = null, bestT = -Infinity;
  for (const s of snaps) {
    const at = s?.runAt ?? s?.importedAt ?? null;
    const t = at ? Date.parse(at) : NaN;
    if (Number.isFinite(t) && t > bestT) { bestT = t; best = at; }
  }
  return best;
}

async function loadAccounts(): Promise<{ accounts: AccountIn[]; dataAsOf: string | null }> {
  const [runs, aging, roll] = await Promise.all([allRuns(), currentAging(), resolveCurrentRentroll().catch(() => null)]);
  const run = runs[0];
  if (!run) return { accounts: [], dataAsOf: null };
  const gross = new Map<string, number>();
  for (const p of roll?.properties ?? []) for (const u of p.units ?? []) if (!u.isVacant && u.grossRentTotal > 0) gross.set(u.unitRef.toUpperCase(), u.grossRentTotal);
  const units = [...run.statements.map((s) => s.unitRef)];
  const seen = new Set(units.map((u) => u.toUpperCase()));
  for (const t of aging.tenants) if (!seen.has(t.unitRef.toUpperCase())) { units.push(t.unitRef); seen.add(t.unitRef.toUpperCase()); }
  const accounts: AccountIn[] = [];
  let dataAsOf: string | null = null;
  for (const unit of units) {
    const found = await statementOf(run.period, unit, { aging }).catch(() => null);
    if (!found) continue;
    const { st, asOf } = found;
    const date = asOf ?? etToday();
    if (!dataAsOf || date > dataAsOf) dataAsOf = date;
    accounts.push({
      unitRef: st.unitRef, propertyCode: st.propertyCode, propertyName: propertyLabel(st.propertyCode), tenantName: st.tenantName,
      suite: st.suite, acct: accountOf(st), period: run.period, asOf: date,
      monthlyCharges: gross.get(st.unitRef.replace(/-(CU|FO)$/i, "").toUpperCase()) ?? null,
      recipients: await suiteRecipients(st.unitRef).catch(() => []),
    });
  }
  return { accounts, dataAsOf };
}

/**
 * Build (or rebuild) the month's batch. A notice already SENT is never
 * rebuilt; once the month has been sent, a fresh import refreshes only the
 * notices still to go (failed or not yet sent), so a retry goes on today's
 * figures. The first build emails Greg; a rebuild after that does not.
 */
export async function buildBatch(opts: { by: string | null; origin: string; notify?: boolean; today?: string }): Promise<ReminderBatch> {
  const month = (opts.today ?? etToday()).slice(0, 7);
  return withBatchLock(month, () => { throw new Error("The notices are being sent right now — import again in a few minutes to rebuild them."); }, () => buildBatchLocked(opts));
}

async function buildBatchLocked(opts: { by: string | null; origin: string; notify?: boolean; today?: string }): Promise<ReminderBatch> {
  const today = opts.today ?? etToday();
  const month = today.slice(0, 7);
  const prev = await getBatch(month);
  const [{ accounts, dataAsOf }, dataRunAt] = await Promise.all([loadAccounts(), newestReportRun()]);
  if (prev?.approvedAt) {
    const refreshed: ReminderBatch = { ...prev, builtAt: new Date().toISOString(), builtBy: opts.by, dataAsOf, dataRunAt, items: buildItems(accounts, prev.items) };
    await saveBatch(refreshed);
    return refreshed;
  }
  const batch: ReminderBatch = {
    month, nextYM: nextMonthOf(month), builtAt: new Date().toISOString(), builtBy: opts.by, dataAsOf, dataRunAt,
    origin: opts.origin, items: buildItems(accounts, prev?.items ?? []),
    approverNotifiedAt: prev?.approverNotifiedAt ?? null, approvedAt: null, approvedBy: null, summarySentAt: prev?.summarySentAt ?? null,
    staleNotifiedAt: null,
    // The reminder / automatic-send clock starts when Greg is EMAILED, not at
    // a preview build (the page's Build Notices Now) — set below.
    remindOn: prev?.remindOn ?? null,
    autoSendOn: prev?.autoSendOn ?? null,
    remindAt: prev?.remindAt ?? null,
    autoSendAt: prev?.autoSendAt ?? null,
    approverRemindedAt: prev?.approverRemindedAt ?? null,
  };
  if (opts.notify !== false && !batch.approverNotifiedAt) {
    const nowIso = new Date().toISOString();
    batch.remindAt = addBusinessHours(nowIso, REMIND_AFTER_HOURS);
    batch.autoSendAt = addBusinessHours(nowIso, AUTO_SEND_AFTER_HOURS);
    batch.remindOn = etDateOf(new Date(batch.remindAt));
    batch.autoSendOn = etDateOf(new Date(batch.autoSendAt));
    const mail = approvalRequestEmail({ month, nextYM: batch.nextYM, counts: batchCounts(batch.items), dataAsOf, autoSendOn: batch.autoSendOn ?? null, autoSendAt: batch.autoSendAt });
    const r = await sendMailDetailed({ to: NOTICE_APPROVER_TO, subject: mail.subject, textBody: mail.text, htmlBody: mail.html });
    if (r.ok) batch.approverNotifiedAt = new Date().toISOString();
    else { batch.remindOn = null; batch.autoSendOn = null; batch.remindAt = null; batch.autoSendAt = null; console.error(`[tenant-notices] could not email the approver: ${r.error}`); }
  }
  await saveBatch(batch);
  return batch;
}

/** The Credit Balance Report import's hook: on or after the 15th, build the
 *  month's notices and tell Greg. Never throws — the import must not fail. */
export async function buildOnImport(by: string | null, origin: string): Promise<{ built: boolean; month?: string; toSend?: number }> {
  try {
    const today = etToday();
    if (Number(today.slice(8, 10)) < NOTICE_DAY) return { built: false };
    const b = await buildBatch({ by, origin, today });
    return { built: true, month: b.month, toSend: batchCounts(b.items).toSend };
  } catch (e) {
    console.error("[tenant-notices] build on import failed", e);
    return { built: false };
  }
}

// ─── Greg's choices ──────────────────────────────────────────────────────────

export async function setSend(month: string, unitRefs: string[], send: boolean, by: string | null): Promise<ReminderBatch | null> {
  const b = await getBatch(month);
  if (!b || b.approvedAt) return b;
  const keys = new Set(unitRefs.map((u) => u.toUpperCase()));
  b.items = b.items.map((i) => (keys.has(i.unitRef.toUpperCase()) && i.status !== "sent" ? { ...i, send, toggledBy: by } : i));
  await saveBatch(b);
  return b;
}

/** Greg sets who a tenant's notice goes to (owner: "greg needs to be able to
 *  add or edit the email it sends to in case there are multiple recipients or
 *  it needs to be updated"). Saved on the SUITE'S CONTACTS — the one list
 *  every tenant email reads — so it holds next month and for Tami's emails
 *  too: the addresses given become the suite's statement recipients (a new one
 *  is added as a contact), every other contact stays but is no longer one. */
export async function setRecipients(month: string, unitRef: string, emails: string[]): Promise<{ batch: ReminderBatch | null; error?: string }> {
  const clean = [...new Map(emails.map((e) => e.trim()).filter(Boolean).map((e) => [e.toLowerCase(), e])).values()];
  if (!clean.length) return { batch: null, error: "Keep at least one address — to not send this tenant a notice, untick them instead." };
  const bad = clean.find((e) => !/^[^\s@,;<>]+@[^\s@,;<>]+\.[a-z]{2,}$/i.test(e));
  if (bad) return { batch: null, error: `"${bad}" is not an email address.` };
  const b = await getBatch(month);
  if (!b) return { batch: null, error: "No notices for that month." };
  const item = b.items.find((i) => i.unitRef.toUpperCase() === unitRef.toUpperCase());
  if (!item) return { batch: null, error: "That tenant is not in this month's notices." };
  if (item.status === "sent") return { batch: null, error: "This tenant's notice has already gone." };
  const suite = unitRef.replace(/-(CU|FO)$/i, "");
  const rec = await getOrEmptySuiteContacts(suite);
  const want = new Set(clean.map((e) => e.toLowerCase()));
  const contacts = rec.contacts.map((c) => ({ ...c, camRecipient: !!c.email.trim() && want.has(c.email.trim().toLowerCase()) }));
  for (const e of clean) {
    if (!contacts.some((c) => c.email.trim().toLowerCase() === e.toLowerCase())) contacts.push({ ...emptyContact(), email: e, camRecipient: true, source: "staff" });
  }
  await saveSuiteContacts(suite, contacts);
  item.recipients = await suiteRecipients(item.unitRef);
  item.blocked = item.recipients.length ? null : "No email on file";
  await saveBatch(b);
  return { batch: b };
}

// ─── The emails ──────────────────────────────────────────────────────────────

async function applyUrlFor(origin: string, item: BatchItem, month: string): Promise<string | undefined> {
  if (!itemCreditPlan(item)) return undefined;
  const secret = creditApplySecret();
  if (!secret) return undefined;
  return `${origin}/credit-apply/${await signCreditApplyToken(secret, item.unitRef, month)}`;
}

export async function noticeInputFor(b: ReminderBatch, item: BatchItem, attached = true): Promise<MonthlyReminderInput> {
  return {
    tier: item.tier, tenantName: item.tenantName, propertyName: item.propertyName, propertyCode: item.propertyCode, suite: item.suite,
    acct: item.acct, asOfISO: item.asOf, nextYM: b.nextYM, monthlyCharges: item.monthlyCharges, attached,
    applyUrl: await applyUrlFor(b.origin, item, b.month),
  };
}

/** The notice exactly as it would send — the page's preview. */
export async function previewNotice(b: ReminderBatch, item: BatchItem) {
  const x = await noticeInputFor(b, item);
  const parts = monthlyReminderParts(x);
  return { subject: parts.subject, ...renderMonthlyReminder(x, parts.opening, parts.closing) };
}

/** Send every ticked notice. Progress is saved after each email, so a timeout
 *  or a second press never sends a tenant twice. */
type SendResult = { batch: ReminderBatch | null; sent: number; failed: number; remaining: number; stale?: string; busy?: string };
export async function sendBatch(month: string, by: string | null, deadlineMs = 270_000, opts: { automatic?: boolean } = {}): Promise<SendResult> {
  return withBatchLock<SendResult>(month,
    () => ({ batch: null, sent: 0, failed: 0, remaining: 0, busy: "The notices are already being sent — this run stopped so no tenant gets two." }),
    () => sendBatchLocked(month, by, deadlineMs, !!opts.automatic));
}

async function sendBatchLocked(month: string, by: string | null, deadlineMs: number, automatic = false): Promise<SendResult> {
  const started = Date.now();
  const b = await getBatch(month);
  if (!b) return { batch: null, sent: 0, failed: 0, remaining: 0 };
  // The 24-hour gate — checked here so no path (page, retry, cron) can skip it.
  // The automatic send (nobody pressed Send) goes on the data Greg was emailed.
  const fresh = automatic && !b.approvedAt ? autoSendFreshness(b) : dataFreshness(b.dataRunAt);
  if (!fresh.fresh) return { batch: b, sent: 0, failed: 0, remaining: b.items.filter(willSend).length, stale: staleMessage(fresh) };
  if (!b.approvedAt) { b.approvedAt = new Date().toISOString(); b.approvedBy = by; await saveBatch(b); }
  let sent = 0, failed = 0;
  for (const item of [...b.items]) {
    if (!willSend(item)) continue;
    // The store may know it went (saveBatch keeps a stored "sent").
    if (b.items.find((x) => x.unitRef === item.unitRef)?.status === "sent") continue;
    if (Date.now() - started > deadlineMs) break;
    try {
      const x = await noticeInputFor(b, item);
      const parts = monthlyReminderParts(x);
      const { html, text } = renderMonthlyReminder(x, parts.opening, parts.closing);
      const fresh = await statementOf(item.period, item.unitRef).catch(() => null);
      const att = fresh ? await statementPdf(item.period, fresh.st).catch(() => null) : null;
      const { result, from } = await sendNotice({
        to: item.recipients.join(", "), subject: parts.subject, textBody: text, htmlBody: html, noLinkTracking: true,
        headers: [{ Name: "Reply-To", Value: AR_CONTACT_EMAIL }], ...(att ? { attachments: [att] } : {}),
      });
      if (!result.ok) throw new Error(result.error ?? "the email did not send");
      const id = newCorrespondenceId(item.unitRef);
      // SENT is saved the moment the mail went — a failure recording the
      // correspondence must not turn a delivered notice into "failed", which a
      // Retry would send again (bug audit 11/2026).
      Object.assign(item, { status: "sent", sentAt: new Date().toISOString(), sentTo: item.recipients, error: null, correspondenceId: id });
      sent++;
      await saveBatch(b);
      await recordTenantEmail({
        id, kind: "monthly-notice", unitRef: item.unitRef, propertyCode: item.propertyCode, tenantName: item.tenantName,
        sentAt: new Date().toISOString(), sentBy: by, from, to: item.recipients, bcc: null, replyTo: AR_CONTACT_EMAIL,
        subject: parts.subject, text, html, messageId: result.messageId ?? null, testMode: !!result.testMode,
        attachment: att ? { name: att.name, contentType: att.contentType, size: att.content.byteLength, base64: Buffer.from(att.content).toString("base64") } : null,
        summary: item.tier === "credit" ? "Credit balance notice" : item.tier === "past-due" ? "Past-due notice" : "Account reminder",
        refId: null, balance: item.acct.net,
      }).catch((err) => console.error(`[tenant-notices] ${item.unitRef}: sent, but the correspondence record failed`, err));
    } catch (e) {
      if (item.status === "sent") continue;
      Object.assign(item, { status: "failed", error: e instanceof Error ? e.message : String(e) });
      failed++;
    }
    await saveBatch(b);
  }
  const remaining = b.items.filter(willSend).filter((i) => i.status !== "failed").length;
  return { batch: b, sent, failed, remaining };
}

// ─── If Greg forgets ─────────────────────────────────────────────────────────

/** The daily cron: remind Greg one business day after the build, and send
 *  every ticked notice on its own after two. Unticked tenants stay held. */
export async function autoSendTick(opts: { today?: string; now?: Date } = {}): Promise<{ action: "none" | "reminded" | "sent"; detail?: string }> {
  const now = opts.now ?? new Date();
  const today = opts.today ?? etToday();
  const b = await getBatch(today.slice(0, 7));
  if (!b || b.approvedAt && !b.items.some((i) => willSend(i) && i.status !== "failed")) return { action: "none" };
  // A batch from before the 48-hour clock carries dates only.
  const autoDue = b.autoSendAt ? now.getTime() >= Date.parse(b.autoSendAt) : !!(b.autoSendOn && today >= b.autoSendOn);
  const remindDue = b.remindAt ? now.getTime() >= Date.parse(b.remindAt) : !!(b.remindOn && today >= b.remindOn);
  // Stale data: nothing goes on its own. Tell Greg (and Drew) once, so the
  // automatic send does not just quietly never happen.
  const fresh = b.approvedAt ? dataFreshness(b.dataRunAt, now) : autoSendFreshness(b, now);
  if (!fresh.fresh) {
    const due = b.approvedAt || autoDue;
    if (due && !b.staleNotifiedAt) {
      const mail = staleDataEmail({ month: b.month, counts: batchCounts(b.items), message: staleMessage(dataFreshness(b.dataRunAt, now)) });
      const r = await sendMailDetailed({ to: NOTICE_APPROVER_TO, cc: STALE_COPY_TO, subject: mail.subject, textBody: mail.text, htmlBody: mail.html });
      if (r.ok) { b.staleNotifiedAt = new Date().toISOString(); await saveBatch(b); }
      return { action: "none", detail: "data too old — told the approver" };
    }
    if (due) return { action: "none", detail: "data too old" };
  }
  if (b.approvedAt) {
    // A send that ran out of time — finish it.
    const r = await sendBatch(b.month, b.approvedBy ?? "Automatic");
    return { action: "sent", detail: `${r.sent} more sent` };
  }
  if (autoDue) {
    b.autoSent = true;
    await saveBatch(b);
    const r = await sendBatch(b.month, "Automatic", undefined, { automatic: true });
    return { action: "sent", detail: `${r.sent} sent · ${r.failed} failed` };
  }
  if (remindDue && !b.approverRemindedAt) {
    const mail = approvalReminderEmail({ month: b.month, counts: batchCounts(b.items), autoSendOn: b.autoSendOn ?? today, autoSendAt: b.autoSendAt ?? null });
    const r = await sendMailDetailed({ to: NOTICE_APPROVER_TO, subject: mail.subject, textBody: mail.text, htmlBody: mail.html });
    if (r.ok) { b.approverRemindedAt = new Date().toISOString(); await saveBatch(b); }
    return { action: "reminded" };
  }
  return { action: "none" };
}

// ─── Apply my credit ─────────────────────────────────────────────────────────

export async function getCreditRequest(month: string, unitRef: string): Promise<CreditRequest | null> {
  return (await getJSON(REQUESTS, creditRequestId(month, unitRef)).catch(() => null)) as CreditRequest | null;
}
export async function creditRequestsFor(month: string): Promise<CreditRequest[]> {
  const all = (await listJSON(REQUESTS, { fresh: true }).catch(() => [])) as CreditRequest[];
  return summaryOrder(all.filter((r) => r && r.month === month));
}

export type ApplyView =
  | { state: "invalid" }
  | { state: "closed"; tenantName: string; deadline: string }
  | { state: "ready" | "done"; item: BatchItem; batch: ReminderBatch; request: CreditRequest | null; deadline: string };

/** What the tenant's link opens on — never applies anything. */
export async function applyView(unitRef: string, month: string, today = etToday()): Promise<ApplyView> {
  const b = await getBatch(month);
  const item = b?.items.find((i) => i.unitRef.toUpperCase() === unitRef.toUpperCase());
  if (!b || !item || !itemCreditPlan(item)) return { state: "invalid" };
  const deadline = applyDeadline(month);
  const request = await getCreditRequest(month, unitRef);
  if (request) return { state: "done", item, batch: b, request, deadline };
  if (today > deadline) return { state: "closed", tenantName: item.tenantName, deadline };
  return { state: "ready", item, batch: b, request: null, deadline };
}

/** The tenant confirmed: record it, email Tami what to post, confirm to the
 *  tenant. A second confirm returns the first. */
export async function confirmApply(unitRef: string, month: string): Promise<ApplyView> {
  const v = await applyView(unitRef, month);
  if (v.state !== "ready") return v;
  const { item, batch } = v;
  const plan = itemCreditPlan(item)!;
  const r: CreditRequest = {
    id: creditRequestId(month, item.unitRef), month, nextYM: batch.nextYM,
    unitRef: item.unitRef, propertyCode: item.propertyCode, propertyName: item.propertyName, tenantName: item.tenantName, suite: item.suite,
    plan, requestedAt: new Date().toISOString(),
  };
  await storeJSON(REQUESTS, r.id, r);

  const tami = postCreditEmail(r);
  const toTami = await sendMailDetailed({ to: AR_CONTACT_EMAIL, subject: tami.subject, textBody: tami.text, htmlBody: tami.html });
  if (toTami.ok) r.tamiNotifiedAt = new Date().toISOString();

  if (item.recipients.length) {
    const conf = renderCreditAppliedEmail({
      tenantName: item.tenantName, propertyName: item.propertyName, propertyCode: item.propertyCode, suite: item.suite,
      plan, charges: item.monthlyCharges, balanceAfter: Math.max(0, item.acct.net), stillOpen: openAfterCredit(item.acct, plan),
      nextYM: batch.nextYM, requestedAtISO: r.requestedAt,
    });
    const { result, from } = await sendNotice({
      to: item.recipients.join(", "), subject: conf.subject, textBody: conf.text, htmlBody: conf.html,
      headers: [{ Name: "Reply-To", Value: AR_CONTACT_EMAIL }], isAutoReply: true,
    });
    if (result.ok) {
      r.tenantConfirmedAt = new Date().toISOString();
      r.confirmationTo = item.recipients;
      await recordTenantEmail({
        id: newCorrespondenceId(item.unitRef), kind: "credit-applied", unitRef: item.unitRef, propertyCode: item.propertyCode, tenantName: item.tenantName,
        sentAt: r.tenantConfirmedAt, sentBy: null, from, to: item.recipients, bcc: null, replyTo: AR_CONTACT_EMAIL, subject: conf.subject,
        text: conf.text, html: conf.html, messageId: result.messageId ?? null, testMode: !!result.testMode, attachment: null,
        summary: "Credit applied confirmation", refId: r.id, balance: item.acct.net,
      });
    }
  }
  await storeJSON(REQUESTS, r.id, r);
  return { state: "done", item, batch, request: r, deadline: v.deadline };
}

export async function markPosted(month: string, unitRef: string, posted: boolean, by: string | null): Promise<CreditRequest | null> {
  const r = await getCreditRequest(month, unitRef);
  if (!r) return null;
  const next: CreditRequest = { ...r, postedAt: posted ? new Date().toISOString() : null, postedBy: posted ? by : null };
  await storeJSON(REQUESTS, next.id, next);
  return next;
}

// ─── The summary before statements ───────────────────────────────────────────

/** The business day before the 25th: every credit asked for, unposted first,
 *  to Drew and Tami. Once per month; `force` sends on any day. */
export async function sendCreditSummary(opts: { origin: string; today?: string; force?: boolean }): Promise<{ sent: boolean; reason?: string; month: string }> {
  const today = opts.today ?? etToday();
  const month = today.slice(0, 7);
  if (!opts.force && today !== creditSummaryDay(month)) return { sent: false, reason: `not the summary day (${creditSummaryDay(month)})`, month };
  const b = await getBatch(month);
  if (!b?.approvedAt) return { sent: false, reason: "no notices went out this month", month };
  if (b.summarySentAt && !opts.force) return { sent: false, reason: "already sent", month };
  const requests = await creditRequestsFor(month);
  const mail = creditSummaryEmail({ month, nextYM: b.nextYM, requests });
  const r = await sendMailDetailed({ to: CREDIT_SUMMARY_TO, subject: mail.subject, textBody: mail.text, htmlBody: mail.html });
  if (!r.ok) return { sent: false, reason: r.error ?? "the email did not send", month };
  b.summarySentAt = new Date().toISOString();
  await saveBatch(b);
  return { sent: true, month };
}

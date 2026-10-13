// The Monday cash position email to ownership (owner: "email the cash position
// pdf to ownership every monday").
//
// It goes out ONCE A WEEK, and only on fresh numbers: as soon as every bank has
// been imported since Monday (the import calls `maybeSendCashPosition`), so
// ownership has it the moment the week's balances are in. The Monday-afternoon
// cron is the fallback — if the week's balances still are not in, it does NOT
// send last week's figures dressed as this week's; it reminds Drew instead.
// Recipients are kept here, edited on the Cash Analysis page.

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";
import { sendMail, isMailConfigured, VERIFIED_FROM } from "@/lib/mail";
import { buildBalanceView, type BalanceView } from "./view";
import { asOfOf, buildBalancePdf } from "./export";
import { todayET } from "./store";

const PREFIX = "bank-balances";
const ID = "ownership-email";
const MAX_RECIPIENTS = 20;
/** Copied (blind) on every send — the record that it went. */
const COPY_TO = (process.env.CASH_POSITION_COPY_TO ?? "dwinig@kormancommercial.com").trim();
const REMIND_TO = "dwinig@kormancommercial.com";

/** On the list from the start (owner: "add drew and alison to the monday
 * email"). A seed someone removes stays removed (`removedSeeds`). */
export const SEEDED_RECIPIENTS = ["dwinig@kormancommercial.com", "akorman@kormancommercial.com"];

export type OwnershipEmailDoc = {
  recipients: string[];
  /** Seeded recipients someone took off the list — never re-added. */
  removedSeeds?: string[];
  /** Monday (YYYY-MM-DD, Eastern) of the week last sent. */
  lastSentWeek?: string | null;
  lastSentAt?: string | null;
  lastSentTo?: string[];
  lastSentBy?: string | null;
  lastRemindedWeek?: string | null;
};

const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[a-z]{2,}$/i;
export function cleanRecipients(list: unknown): string[] {
  const out: string[] = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const e = String(raw ?? "").trim().toLowerCase();
    if (EMAIL.test(e) && !out.includes(e)) out.push(e);
  }
  return out.slice(0, MAX_RECIPIENTS);
}

export async function loadEmailDoc(): Promise<OwnershipEmailDoc> {
  const d = (await getJSON(PREFIX, ID)) as OwnershipEmailDoc | null;
  return withSeeds({ recipients: [], ...(d ?? {}) });
}
/** The stored list plus every seed not deliberately removed. */
export function withSeeds(doc: OwnershipEmailDoc): OwnershipEmailDoc {
  const removed = new Set(doc.removedSeeds ?? []);
  const missing = SEEDED_RECIPIENTS.filter((e) => !removed.has(e) && !doc.recipients.includes(e));
  return { ...doc, recipients: cleanRecipients([...missing, ...doc.recipients]) };
}
export async function saveRecipients(list: unknown): Promise<OwnershipEmailDoc> {
  const doc = await loadEmailDoc();
  doc.recipients = cleanRecipients(list);
  doc.removedSeeds = SEEDED_RECIPIENTS.filter((e) => !doc.recipients.includes(e));
  await storeJSON(PREFIX, ID, doc);
  return doc;
}

/** The Monday (YYYY-MM-DD, Eastern) of the week containing `now`. */
export function weekOf(now = new Date()): string {
  const d = new Date(`${todayET(now)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** Every bank on record has been imported this week (Eastern). */
export function freshThisWeek(view: BalanceView, now = new Date()): boolean {
  const monday = weekOf(now);
  return view.byBank.length > 0 && view.byBank.every((b) => !!b.importedAt && todayET(new Date(b.importedAt)) >= monday);
}

const money0 = (n: number) => {
  const v = Math.round(n);
  const s = Math.abs(v).toLocaleString("en-US");
  return v < 0 ? `($${s})` : `$${s}`;
};
const longDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

export function composeCashPosition(view: BalanceView, now = new Date()) {
  const num = (n: number | null) => n ?? 0;
  const rows = view.rows;
  const ops = rows.filter((r) => !r.restricted);
  const cash = rows.reduce((s, r) => s + num(r.balance), 0);
  const deposits = rows.filter((r) => r.restricted).reduce((s, r) => s + num(r.balance), 0);
  const reserves = ops.reduce((s, r) => s + (r.balance == null ? 0 : r.reserves), 0);
  const net = ops.reduce((s, r) => s + num(r.netAvailable), 0);
  const debt = rows.reduce((s, r) => s + num(r.debt), 0) + (view.unplacedDebt ?? 0);
  const debtService = rows.reduce((s, r) => s + num(r.debtService), 0) + (view.unplacedDebtService ?? 0);
  const compared = rows.filter((r) => r.change != null);
  const change = compared.length ? compared.reduce((s, r) => s + num(r.change), 0) : null;
  const priorAsOf = compared.map((r) => r.priorAsOf).filter((d): d is string => !!d).sort()[0] ?? null;
  const asOf = asOfOf(view);
  const week = longDate(weekOf(now));
  const subject = `Cash Position — Week of ${week}`;
  const lines = [
    `Cash position as of ${asOf ? longDate(asOf) : "the latest import"} — the full report is attached.`,
    "",
    `Cash in bank          ${money0(cash)}`,
    ...(change != null ? [`  Week over week       ${change >= 0 ? "+" : ""}${money0(change)}${priorAsOf ? ` since ${longDate(priorAsOf)}` : ""}`] : []),
    `Security deposits     ${money0(deposits)}  (tenants' money, held in full)`,
    `Reserves              ${money0(reserves)}`,
    `Net available         ${money0(net)}`,
    `Debt service / month  ${money0(debtService)}  (${money0(debt)} principal; not deducted)`,
    "",
    view.byBank.map((b) => `${b.bank.replace("JPM-", "")} as of ${b.asOf ? longDate(b.asOf) : "—"}`).join(" · "),
    "",
    "Korman Commercial Properties",
  ];
  const file = `Cash Position ${asOf ?? weekOf(now)}.pdf`;
  return { subject, textBody: lines.join("\n"), file };
}

export type SendOutcome = { sent: boolean; reason?: string; to?: string[]; week?: string };

/** Send this week's cash position. `force` sends again even if this week's went. */
export async function sendCashPosition(opts: { by: string | null; force?: boolean; now?: Date }): Promise<SendOutcome> {
  const now = opts.now ?? new Date();
  const week = weekOf(now);
  const doc = await loadEmailDoc();
  if (!doc.recipients.length) return { sent: false, reason: "No recipients set" };
  if (!opts.force && doc.lastSentWeek === week) return { sent: false, reason: "Already sent this week", week };
  if (!isMailConfigured()) return { sent: false, reason: "Mail is not configured" };
  const view = await buildBalanceView(now);
  if (!view.byBank.length) return { sent: false, reason: "No bank balances imported" };
  const { subject, textBody, file } = composeCashPosition(view, now);
  const ok = await sendMail({
    to: doc.recipients.join(", "), from: VERIFIED_FROM, subject, textBody,
    // No blind copy to someone already on the To line.
    ...(COPY_TO && !doc.recipients.includes(COPY_TO.toLowerCase()) ? { bcc: COPY_TO } : {}),
    attachments: [{ name: file, content: new Uint8Array(buildBalancePdf(view)), contentType: "application/pdf" }],
  });
  if (!ok) return { sent: false, reason: "The email did not go" };
  Object.assign(doc, { lastSentWeek: week, lastSentAt: now.toISOString(), lastSentTo: doc.recipients, lastSentBy: opts.by });
  await storeJSON(PREFIX, ID, doc);
  return { sent: true, to: doc.recipients, week };
}

/** After an import: send once every bank is in for the week, if not sent yet. */
export async function maybeSendCashPosition(by: string | null, now = new Date()): Promise<SendOutcome> {
  const doc = await loadEmailDoc();
  if (!doc.recipients.length) return { sent: false, reason: "No recipients set" };
  if (doc.lastSentWeek === weekOf(now)) return { sent: false, reason: "Already sent this week" };
  const view = await buildBalanceView(now);
  if (!freshThisWeek(view, now)) return { sent: false, reason: "Waiting for every bank to be imported this week" };
  return sendCashPosition({ by, now });
}

/** The Monday-afternoon fallback: send if fresh, else remind Drew (once). */
export async function cronCashPosition(now = new Date()): Promise<SendOutcome> {
  const doc = await loadEmailDoc();
  const week = weekOf(now);
  if (!doc.recipients.length || doc.lastSentWeek === week) return { sent: false, reason: doc.recipients.length ? "Already sent this week" : "No recipients set" };
  const view = await buildBalanceView(now);
  if (freshThisWeek(view, now)) return sendCashPosition({ by: "Monday schedule", now });
  if (doc.lastRemindedWeek !== week && isMailConfigured()) {
    const stale = view.byBank.filter((b) => !b.importedAt || todayET(new Date(b.importedAt)) < week).map((b) => b.bank.replace("JPM-", ""));
    await sendMail({
      to: REMIND_TO, from: VERIFIED_FROM,
      subject: "Cash position not sent — import this week's bank balances",
      textBody: `This week's cash position has not gone to ownership: ${stale.length ? stale.join(", ") : "some banks"} ${stale.length === 1 ? "has" : "have"} not been imported since Monday.\n\nImport the bank PDFs on Cash Analysis and it sends automatically.`,
    });
    doc.lastRemindedWeek = week;
    await storeJSON(PREFIX, ID, doc);
  }
  return { sent: false, reason: "Balances not imported this week — Drew reminded", week };
}

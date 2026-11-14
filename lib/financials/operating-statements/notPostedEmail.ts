// The "not posted to the GL" alert: ONE email per import, not one per property
// (owner, 11/2026: "i imported and got a bunch of Not posted to the GL emails
// … roll this up into one email instead of one per property").
//
// A GL import is one request PER FILE, so no single request knows the whole
// batch. Each import STAGES its property's significant not-posted lines
// (`stageNotPosted`, no mail); the page asks for the digest once every file
// has landed (`POST /api/financials/operating-statements/not-posted/email`),
// and a daily cron sends anything a closed tab left staged. The digest groups
// every staged property into one message, biggest dollars first.
//
// Deduped by content per property: re-importing the IDENTICAL statement stages
// nothing, but any change to a property's missing set (something posted, or a
// new month) stages a fresh entry.

import "server-only";
import { sendMail, isMailConfigured } from "@/lib/mail";
import { deleteJSON, getJSON, listJSON, storeJSON } from "@/lib/storage";
import crypto from "node:crypto";
import { significantNotPosted, type NotPostedItem, type NotPostedSummary } from "./notPosted";
import { composeNotPostedDigest, type StagedNotPosted } from "./notPostedDigest";

const TO = "mjaster@kormancommercial.com";
const CC = "dwinig@kormancommercial.com";
const FROM = "dwinig@kormancommercial.com"; // verified sender
/** Last emailed content per property-year — the dedupe. */
const SENT = "not-posted-emailed";
/** Waiting for the batch's digest. */
const PENDING = "not-posted-pending";

const idOf = (key: string, year: number) => `${key}-${year}`.replace(/[^0-9A-Za-z]+/g, "-") || "unknown";

function signature(key: string, year: number, items: NotPostedItem[]): string {
  return crypto
    .createHash("sha1")
    .update(JSON.stringify({
      key, year,
      items: items.map((i) => `${i.period}|${i.section}|${i.line}|${i.type}|${Math.round(i.expected)}`).sort(),
    }))
    .digest("hex")
    .slice(0, 16);
}

/** Stage one property's significant not-posted lines for the import's digest.
 *  Sends nothing. A property whose set is unchanged since it was last emailed
 *  (or now empty) clears any stale staged entry instead. */
export async function stageNotPosted(
  np: NotPostedSummary,
  opts: { key: string; propertyName: string; year: number; importedBy?: string | null },
): Promise<{ staged: boolean; reason?: string }> {
  const id = idOf(opts.key, opts.year);
  // Only the big, easy-to-miss postings (management fees, insurance, real
  // estate taxes, debt service) — not routine lines briefly reading $0.
  const items = significantNotPosted(np.items);
  if (!items.length) {
    await deleteJSON(PENDING, id).catch(() => false);
    return { staged: false, reason: "nothing-significant" };
  }
  const sig = signature(opts.key, opts.year, items);
  const prev = (await getJSON(SENT, id)) as { sig?: string } | null;
  if (prev?.sig === sig) {
    await deleteJSON(PENDING, id).catch(() => false);
    return { staged: false, reason: "unchanged" };
  }
  const entry: StagedNotPosted = {
    id, key: opts.key, propertyName: opts.propertyName, year: opts.year,
    items, sig, importedBy: opts.importedBy ?? null, stagedAt: new Date().toISOString(),
  };
  await storeJSON(PENDING, id, entry);
  return { staged: true };
}

/** Send every staged property as ONE email. `olderThanMs` lets the cron leave
 *  alone an import still in progress. */
export async function sendNotPostedDigest(opts: { olderThanMs?: number } = {}): Promise<{ sent: boolean; properties: number; lines: number; reason?: string }> {
  const all = ((await listJSON(PENDING, { fresh: true })) as StagedNotPosted[]).filter((e) => e && Array.isArray(e.items) && e.items.length);
  const cutoff = opts.olderThanMs ? Date.now() - opts.olderThanMs : Infinity;
  const due = all.filter((e) => Date.parse(e.stagedAt) <= cutoff);
  if (!due.length) return { sent: false, properties: 0, lines: 0, reason: "nothing-staged" };
  if (!isMailConfigured()) return { sent: false, properties: due.length, lines: 0, reason: "mail-not-configured" };

  const mail = composeNotPostedDigest(due);
  const ok = await sendMail({ to: TO, cc: CC, from: FROM, subject: mail.subject, textBody: mail.text, htmlBody: mail.html, noLinkTracking: true });
  if (!ok) return { sent: false, properties: due.length, lines: mail.lines, reason: "send-failed" };

  const at = new Date().toISOString();
  for (const e of due) {
    await storeJSON(SENT, e.id, { sig: e.sig, sentAt: at });
    await deleteJSON(PENDING, e.id).catch(() => false);
  }
  return { sent: true, properties: due.length, lines: mail.lines };
}

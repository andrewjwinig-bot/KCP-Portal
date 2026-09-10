// Minimal Postmark outbound wrapper. Reuses the same token + verified-from
// address that the inbound auto-reply does. Returns true on send, false on
// any failure or when not configured — callers should treat sending as
// best-effort so the underlying save / submit never fails because mail
// didn't go out.

import "server-only";

// Internal team notified on every new tenant service request + conference
// room reservation, so nothing gets lost. Postmark accepts a comma-separated
// recipient list in the To field.
export const NEW_REQUEST_NOTIFY = [
  "gmasciantonio@kormancommercial.com",
  "cloiseau@kormancommercial.com",
  "jgosik@kormancommercial.com",
  "nfox@kormancommercial.com",
].join(", ");

export type MailAttachment = {
  /** Filename the recipient sees, e.g. "Invoice - 4080 - 207 - Pragmatics.pdf". */
  name: string;
  /** Raw file bytes — base64-encoded before being handed to Postmark. */
  content: Uint8Array;
  /** MIME type, e.g. "application/pdf". */
  contentType: string;
};

export type MailMessage = {
  to: string;
  /** Optional carbon-copy recipient(s) — comma-separated. */
  cc?: string;
  /** Optional blind-copy recipient(s) — comma-separated. Used where the team
   *  needs a copy for its own records but the recipient shouldn't see an
   *  internal address on their mail, or reply-all onto it. */
  bcc?: string;
  subject: string;
  textBody: string;
  /** Extra RFC-style headers; "Auto-Submitted: auto-replied" is added
   *  automatically when isAutoReply is true. */
  headers?: { Name: string; Value: string }[];
  /** RFC 3834 marker — set true for system-generated confirmations. */
  isAutoReply?: boolean;
  /** Optional binary attachments — currently used by the quarterly
   *  AvidBill commission-invoice batch. */
  attachments?: MailAttachment[];
  /** Overrides the default `MAINTENANCE_REPLY_FROM` for this message
   *  only. Used by the commissions batch which sends from
   *  dwinig@kormancommercial.com so staff replies + bounces don't
   *  hit the service inbox. The sender must be verified in Postmark
   *  before mail will actually go out. */
  from?: string;
};

/**
 * The address Postmark is known to accept mail from.
 *
 * SIX flows independently hard-coded this with the comment "verified Postmark
 * sender" — the Avid invoices, the operating-statement notice, the move-out
 * watcher, the weekly digest, the allocation report, the remittance advice —
 * because the DEFAULT (`MAINTENANCE_REPLY_FROM`, the service inbox) does not
 * reliably send. Nobody wrote that down in one place, so every new flow either
 * remembers to override it or silently fails.
 *
 * The investor K-1 share was the one that forgot: it set no `from`, fell back
 * to the service address, and nothing it sent ever arrived — while every flow
 * that overrides kept working, which is exactly why "invoices send fine, why
 * not this?" had no obvious answer.
 *
 * `POSTMARK_VERIFIED_FROM` overrides it without a deploy.
 */
export const VERIFIED_FROM = (process.env.POSTMARK_VERIFIED_FROM ?? "dwinig@kormancommercial.com").trim();

export function isMailConfigured(): boolean {
  return !!(process.env.POSTMARK_SERVER_TOKEN && process.env.MAINTENANCE_REPLY_FROM);
}

/** The Postmark request body. One builder, so the detailed and boolean send
 *  paths cannot drift in what they actually transmit. */
function buildPayload(msg: MailMessage, from: string) {
  const headers = [...(msg.headers ?? [])];
  if (msg.isAutoReply) headers.push({ Name: "Auto-Submitted", Value: "auto-replied" });
  const Attachments = (msg.attachments ?? []).map((a) => ({
    Name: a.name,
    Content: Buffer.from(a.content).toString("base64"),
    ContentType: a.contentType,
  }));
  return {
    From: from,
    To: msg.to,
    ...(msg.cc ? { Cc: msg.cc } : {}),
    ...(msg.bcc ? { Bcc: msg.bcc } : {}),
    Subject: msg.subject,
    TextBody: msg.textBody,
    MessageStream: "outbound",
    Headers: headers,
    ...(Attachments.length > 0 ? { Attachments } : {}),
  };
}

/**
 * Postmark's TEST token accepts every send, returns 200, and delivers
 * NOTHING.
 *
 * Worth naming, because from the app's side a test-mode send is
 * indistinguishable from a real one — the API says OK either way — so a
 * "Sent ✓" can be perfectly truthful about the API call and completely wrong
 * about the recipient's inbox. Anywhere we report a send, we report this too.
 */
export function isMailTestMode(): boolean {
  return (process.env.POSTMARK_SERVER_TOKEN ?? "").trim().toUpperCase() === "POSTMARK_API_TEST";
}

/** What Postmark actually said. `ok` alone hides the useful half. */
export type MailResult = {
  ok: boolean;
  /** Postmark's id for the message — the thing to search Activity for. */
  messageId?: string;
  /** Postmark's own error text when it refused (inactive recipient, unverified
   *  sender, sandbox restriction), rather than a bare false. */
  error?: string;
  /** True when the send was accepted by a TEST token and delivered nowhere. */
  testMode?: boolean;
};

/**
 * Send, and report what came back.
 *
 * `sendMail` returns a bare boolean and throws the rest away: the message id,
 * Postmark's error text, and whether the token was a test token. That made a
 * failed or undelivered send look exactly like a successful one from
 * everywhere in the app — so anything that tells a user "sent" should use
 * this and quote the id.
 */
export async function sendMailDetailed(msg: MailMessage): Promise<MailResult> {
  const token = process.env.POSTMARK_SERVER_TOKEN;
  const from = msg.from || process.env.MAINTENANCE_REPLY_FROM;
  if (!token) return { ok: false, error: "POSTMARK_SERVER_TOKEN is not set — no mail can be sent." };
  if (!from) return { ok: false, error: "MAINTENANCE_REPLY_FROM is not set — no sender address." };
  if (!msg.to || !msg.subject || !msg.textBody) return { ok: false, error: "Missing recipient, subject or body." };

  const built = buildPayload(msg, from);
  try {
    const res = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        "X-Postmark-Server-Token": token,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(built),
    });
    const body = await res.json().catch(() => null) as
      | { MessageID?: string; ErrorCode?: number; Message?: string }
      | null;
    // Postmark answers 200 with ErrorCode 0 on success. A non-zero code in a
    // 200 body is still a refusal, so both are checked rather than trusting
    // the status alone.
    const code = body?.ErrorCode ?? 0;
    // One line per send, in the runtime log.
    //
    // There was NO record of a send anywhere: the audit log goes to blob
    // storage, and the API's own answer was reduced to a boolean and dropped.
    // So "the app says sent, nothing arrived" had nothing to inspect — which
    // is how this went unexplained for two days. Recipients and status only;
    // never the token, never the body, never the PIN.
    console.log("[mail]", JSON.stringify({
      to: msg.to, cc: msg.cc ?? null, bcc: msg.bcc ?? null, from,
      subject: msg.subject,
      status: res.status, errorCode: code,
      messageId: body?.MessageID ?? null,
      postmark: body?.Message ?? null,
      testMode: isMailTestMode(),
    }));
    if (!res.ok || code !== 0) {
      return { ok: false, error: body?.Message ?? `Postmark returned ${res.status}.`, testMode: isMailTestMode() };
    }
    return { ok: true, messageId: body?.MessageID, testMode: isMailTestMode() };
  } catch (e) {
    const error = e instanceof Error ? e.message : "Could not reach Postmark.";
    console.log("[mail] request failed", JSON.stringify({ to: msg.to, subject: msg.subject, error }));
    return { ok: false, error };
  }
}

/** Best-effort send for the many callers that only branch on success. New code
 *  that REPORTS a send to a user should call `sendMailDetailed` instead. */
export async function sendMail(msg: MailMessage): Promise<boolean> {
  return (await sendMailDetailed(msg)).ok;
}

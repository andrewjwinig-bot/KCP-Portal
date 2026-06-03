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

export function isMailConfigured(): boolean {
  return !!(process.env.POSTMARK_SERVER_TOKEN && process.env.MAINTENANCE_REPLY_FROM);
}

export async function sendMail(msg: MailMessage): Promise<boolean> {
  const token = process.env.POSTMARK_SERVER_TOKEN;
  const from = msg.from || process.env.MAINTENANCE_REPLY_FROM;
  if (!token || !from) return false;
  if (!msg.to || !msg.subject || !msg.textBody) return false;

  const headers = [...(msg.headers ?? [])];
  if (msg.isAutoReply) {
    headers.push({ Name: "Auto-Submitted", Value: "auto-replied" });
  }

  const Attachments = (msg.attachments ?? []).map((a) => ({
    Name: a.name,
    Content: Buffer.from(a.content).toString("base64"),
    ContentType: a.contentType,
  }));

  try {
    const res = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        "X-Postmark-Server-Token": token,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        From: from,
        To: msg.to,
        Subject: msg.subject,
        TextBody: msg.textBody,
        MessageStream: "outbound",
        Headers: headers,
        ...(Attachments.length > 0 ? { Attachments } : {}),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Minimal Postmark outbound wrapper. Reuses the same token + verified-from
// address that the inbound auto-reply does. Returns true on send, false on
// any failure or when not configured — callers should treat sending as
// best-effort so the underlying save / submit never fails because mail
// didn't go out.

import "server-only";

export type MailMessage = {
  to: string;
  subject: string;
  textBody: string;
  /** Extra RFC-style headers; "Auto-Submitted: auto-replied" is added
   *  automatically when isAutoReply is true. */
  headers?: { Name: string; Value: string }[];
  /** RFC 3834 marker — set true for system-generated confirmations. */
  isAutoReply?: boolean;
};

export function isMailConfigured(): boolean {
  return !!(process.env.POSTMARK_SERVER_TOKEN && process.env.MAINTENANCE_REPLY_FROM);
}

export async function sendMail(msg: MailMessage): Promise<boolean> {
  const token = process.env.POSTMARK_SERVER_TOKEN;
  const from = process.env.MAINTENANCE_REPLY_FROM;
  if (!token || !from) return false;
  if (!msg.to || !msg.subject || !msg.textBody) return false;

  const headers = [...(msg.headers ?? [])];
  if (msg.isAutoReply) {
    headers.push({ Name: "Auto-Submitted", Value: "auto-replied" });
  }

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
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

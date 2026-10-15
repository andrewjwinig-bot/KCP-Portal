// Inbound email normalizer.
//
// The portal no longer stores or surfaces emails — tenants submit through
// /submit instead. This module is now scoped to extracting sender / subject
// from an inbound webhook payload so the inbound route can fire an
// auto-reply pointing at the form.

export type ParsedEmail = {
  id: string;
  fromName: string;
  fromEmail: string;
  to: string;
  subject: string;
  textBody: string;
  htmlBody: string;
  messageId: string;
  headers: { Name: string; Value: string }[];
};

type AnyJson = Record<string, unknown>;

function str(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v;
  if (v == null) return fallback;
  return String(v);
}

function safeId(): string {
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 12) +
    Math.random().toString(36).slice(2, 8)
  );
}

export function normalizeInbound(payload: AnyJson): ParsedEmail {
  // Postmark inbound shape (https://postmarkapp.com/developer/user-guide/inbound/parse-an-email)
  if ("MessageID" in payload || "FromFull" in payload || "TextBody" in payload) {
    const fromFull = (payload.FromFull ?? {}) as AnyJson;
    const headers = Array.isArray(payload.Headers)
      ? (payload.Headers as { Name?: unknown; Value?: unknown }[]).map((h) => ({
          Name: str(h.Name),
          Value: str(h.Value),
        }))
      : [];
    return {
      id: str(payload.MessageID) || safeId(),
      fromName: str(fromFull.Name) || str(payload.FromName),
      fromEmail: str(fromFull.Email) || str(payload.From),
      to: str(payload.To),
      subject: str(payload.Subject),
      textBody: str(payload.StrippedTextReply) || str(payload.TextBody),
      htmlBody: str(payload.HtmlBody),
      messageId: str(payload.MessageID),
      headers,
    };
  }

  // Generic fallback (Resend / SendGrid / Mailgun / hand-rolled forwarders)
  const from = payload.from as AnyJson | string | undefined;
  const fromObj = (typeof from === "object" && from) || {};
  return {
    id: str(payload.messageId ?? payload["message-id"]) || safeId(),
    fromName: str(fromObj.name) || str(payload.fromName),
    fromEmail:
      str(fromObj.address ?? fromObj.email) ||
      (typeof from === "string" ? from : "") ||
      str(payload.fromEmail),
    to: str(payload.to),
    subject: str(payload.subject),
    textBody: str(payload.text ?? payload.textBody ?? payload.body),
    htmlBody: str(payload.html ?? payload.htmlBody),
    messageId: str(payload.messageId ?? payload["message-id"]),
    headers: [],
  };
}

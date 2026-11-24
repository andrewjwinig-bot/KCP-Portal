// A sent receipt email as an RFC 822 message (.eml) — the record Tami can
// open in Outlook, forward, or hand over as proof that the tenant was asked
// (owner, 11/2026: "a proof and a record in the portal that we did request a
// response from the tenant"). Pure: built from the archived copy, never
// re-rendered, so it is the email as it went.

export type SentEmailForEml = {
  sentAt: string;
  from: string;
  to: string[];
  bcc: string | null;
  replyTo: string | null;
  subject: string;
  html: string;
  text: string;
  messageId: string | null;
  attachment: { name: string; contentType: string; base64: string } | null;
};

/** RFC 2047 encoded-word for a header that isn't plain ASCII. */
function encodeHeader(s: string): string {
  const clean = s.replace(/[\r\n]+/g, " ");
  return /^[\x20-\x7e]*$/.test(clean) ? clean : `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`;
}
/** Base64 wrapped at 76 columns, as MIME requires. */
const wrap76 = (b64: string) => b64.replace(/(.{76})/g, "$1\r\n");
const b64 = (s: string) => wrap76(Buffer.from(s, "utf8").toString("base64"));

export function toEml(e: SentEmailForEml): string {
  const outer = `kcp-mixed-${e.sentAt.replace(/\D/g, "")}`;
  const alt = `kcp-alt-${e.sentAt.replace(/\D/g, "")}`;
  const headers = [
    `Date: ${new Date(e.sentAt).toUTCString().replace("GMT", "+0000")}`,
    `From: ${encodeHeader(e.from)}`,
    `To: ${encodeHeader(e.to.join(", "))}`,
    ...(e.bcc ? [`Bcc: ${encodeHeader(e.bcc)}`] : []),
    ...(e.replyTo ? [`Reply-To: ${encodeHeader(e.replyTo)}`] : []),
    `Subject: ${encodeHeader(e.subject)}`,
    ...(e.messageId ? [`X-PM-Message-Id: ${encodeHeader(e.messageId)}`] : []),
    "X-KCP-Record: Receipt Reconciliation - archived copy of the email as sent",
    "MIME-Version: 1.0",
  ];
  const altPart = [
    `Content-Type: multipart/alternative; boundary="${alt}"`, "",
    `--${alt}`, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", b64(e.text),
    `--${alt}`, "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: base64", "", b64(e.html),
    `--${alt}--`,
  ];
  if (!e.attachment) return [...headers, ...altPart].join("\r\n") + "\r\n";
  const name = e.attachment.name.replace(/["\r\n]/g, "");
  return [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${outer}"`, "",
    `--${outer}`, ...altPart,
    `--${outer}`,
    `Content-Type: ${e.attachment.contentType}; name="${name}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${name}"`, "",
    wrap76(e.attachment.base64),
    `--${outer}--`,
  ].join("\r\n") + "\r\n";
}

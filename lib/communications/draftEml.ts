// Tenant Communications — the email as an OUTLOOK DRAFT (owner, 11/2026:
// "dont let greg send the emails from the portal but make it a draft email in
// his outlook to add his custom distribution lists to send from there").
//
// An .eml carrying `X-Unsent: 1` opens in Outlook as a NEW message in compose,
// not as a received one: the subject and the graphic are filled in, To is left
// empty for his distribution lists, and there is no From, so it goes from the
// mailbox he opens it in. Pure — the page builds it in the browser from the
// same `renderTenantEmail` HTML the preview shows.

import { renderTenantEmail, type TenantTemplate } from "./templates";
import type { ScheduleRow } from "./schedule";

const b64 = (s: string): string => {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const out = btoa(bin);
  return out.replace(/.{1,76}/g, "$&\r\n").trimEnd();
};

/** A header value, RFC 2047 encoded when it is not plain ASCII. */
const header = (s: string): string => {
  const clean = s.replace(/[\r\n]+/g, " ").trim();
  return /^[\x20-\x7e]*$/.test(clean) ? clean : `=?UTF-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(clean)))}?=`;
};

export function draftEml(t: TenantTemplate, subject: string, work?: { rows: ScheduleRow[]; building?: string }): string {
  const { html, text } = renderTenantEmail(t, undefined, work);
  const boundary = `kcp-draft-${t.id}`;
  return [
    "X-Unsent: 1",
    "To: ",
    `Subject: ${header(subject || t.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", b64(text),
    `--${boundary}`, "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: base64", "", b64(html),
    `--${boundary}--`, "",
  ].join("\r\n");
}

/** "Winter Tips.eml" — what the download is called. */
export const draftFileName = (subject: string): string =>
  `${subject.replace(/[\\/:*?"<>|]+/g, "").trim().slice(0, 80) || "Tenant email"}.eml`;

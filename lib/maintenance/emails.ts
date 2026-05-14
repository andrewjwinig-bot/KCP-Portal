// Storage + types for maintenance emails ingested via the inbound webhook.
//
// One JSON blob per email under the "maintenance-emails" storage prefix.

import { listJSON, storeJSON, getJSON, deleteJSON } from "@/lib/storage";

export type MaintenanceEmail = {
  id: string;
  receivedAt: string;        // ISO timestamp the webhook fired
  date: string | null;       // Original email Date header (ISO if parseable)
  fromName: string;
  fromEmail: string;
  to: string;
  cc: string;
  subject: string;
  textBody: string;
  htmlBody: string;          // Stored but not rendered to UI
  messageId: string;
  attachmentCount: number;
  attachments: { name: string; contentType: string; size: number }[];
  source: "postmark" | "resend" | "mailgun" | "sendgrid" | "generic";
  aiSummary: string;          // Filled by Claude triage on inbound (best-effort)
  aiCategories: string[];     // 0-3 categories from REQUEST_CATEGORIES
};

const PREFIX = "maintenance-emails";

export async function saveEmail(e: MaintenanceEmail): Promise<void> {
  await storeJSON(PREFIX, e.id, e);
}

export async function listEmails(): Promise<MaintenanceEmail[]> {
  const all = (await listJSON(PREFIX)) as MaintenanceEmail[];
  return all.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}

export async function getEmail(id: string): Promise<MaintenanceEmail | null> {
  return (await getJSON(PREFIX, id)) as MaintenanceEmail | null;
}

export async function removeEmail(id: string): Promise<boolean> {
  return deleteJSON(PREFIX, id);
}

// ── Inbound payload normalization ──────────────────────────────────────────
//
// Tries Postmark first (cleanest format), falls back to a generic shape so
// Resend / SendGrid / Mailgun parsed-email payloads also work.

type AnyJson = Record<string, unknown>;

function str(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v;
  if (v == null) return fallback;
  return String(v);
}

function toIso(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function safeId(): string {
  // 24-char id; collisions astronomically unlikely for this volume.
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 12) +
    Math.random().toString(36).slice(2, 8)
  );
}

export function normalizeInbound(payload: AnyJson): MaintenanceEmail {
  // Postmark shape (https://postmarkapp.com/developer/user-guide/inbound/parse-an-email)
  if ("MessageID" in payload || "FromFull" in payload || "TextBody" in payload) {
    const fromFull = (payload.FromFull ?? {}) as AnyJson;
    const attachments = (payload.Attachments as AnyJson[] | undefined) ?? [];
    return {
      id: str(payload.MessageID) || safeId(),
      receivedAt: new Date().toISOString(),
      date: toIso(payload.Date),
      fromName: str(fromFull.Name) || str(payload.FromName),
      fromEmail: str(fromFull.Email) || str(payload.From),
      to: str(payload.To),
      cc: str(payload.Cc),
      subject: str(payload.Subject),
      textBody: str(payload.StrippedTextReply) || str(payload.TextBody),
      htmlBody: str(payload.HtmlBody),
      messageId: str(payload.MessageID),
      attachmentCount: attachments.length,
      attachments: attachments.map((a) => ({
        name: str(a.Name),
        contentType: str(a.ContentType),
        size: typeof a.ContentLength === "number" ? a.ContentLength : 0,
      })),
      source: "postmark",
      aiSummary: "",
      aiCategories: [],
    };
  }

  // Generic shape — Resend, SendGrid Inbound Parse, Mailgun routes,
  // or a hand-rolled M365 forwarder all map cleanly to lowercase keys.
  const from = payload.from as AnyJson | string | undefined;
  const fromObj = (typeof from === "object" && from) || {};
  const attachments = ((payload.attachments as AnyJson[]) ?? []).map((a) => ({
    name: str(a.filename ?? a.name),
    contentType: str(a.contentType ?? a.content_type ?? a.type),
    size: typeof a.size === "number" ? a.size : 0,
  }));

  return {
    id: str(payload.messageId ?? payload["message-id"]) || safeId(),
    receivedAt: new Date().toISOString(),
    date: toIso(payload.date ?? payload.Date),
    fromName: str(fromObj.name) || str(payload.fromName),
    fromEmail:
      str(fromObj.address ?? fromObj.email) ||
      (typeof from === "string" ? from : "") ||
      str(payload.fromEmail),
    to: str(payload.to),
    cc: str(payload.cc),
    subject: str(payload.subject),
    textBody: str(payload.text ?? payload.textBody ?? payload.body),
    htmlBody: str(payload.html ?? payload.htmlBody),
    messageId: str(payload.messageId ?? payload["message-id"]),
    attachmentCount: attachments.length,
    attachments,
    source: "generic",
    aiSummary: "",
    aiCategories: [],
  };
}

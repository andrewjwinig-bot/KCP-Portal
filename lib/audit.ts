// Lightweight audit log — one blob per event (no shared read-modify-write, so
// concurrent writes never collide). Records who did what, when, and from where,
// for accountability on a financial app. Best-effort: logging never throws into
// the caller's path. Admin-only to read.

import "server-only";
import { storeJSON, listJSON } from "@/lib/storage";

const PREFIX = "audit-log";

export type AuditEvent = {
  at: string;            // ISO timestamp
  event: string;         // e.g. "login.success", "login.fail", "logout", "gl.upload"
  user: string | null;   // userId when known
  ip: string | null;
  detail?: string;       // short human context (no secrets)
};

/** Record one event. Never throws — failures are swallowed so auditing can't
 *  break the action being audited. */
export async function logAudit(e: Omit<AuditEvent, "at">): Promise<void> {
  try {
    const at = new Date().toISOString();
    const slug = `${at}-${Math.random().toString(36).slice(2, 8)}`.replace(/[^a-zA-Z0-9_-]+/g, "_");
    await storeJSON(PREFIX, slug, { at, ...e } satisfies AuditEvent);
  } catch {
    /* best-effort */
  }
}

/** Most recent events, newest first (capped). */
export async function listAudit(limit = 500): Promise<AuditEvent[]> {
  const all = (await listJSON(PREFIX)) as AuditEvent[];
  return all
    .filter((e) => e && e.at)
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, limit);
}

/** Pull the client IP from request headers (proxy-aware). */
export function auditIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip");
}

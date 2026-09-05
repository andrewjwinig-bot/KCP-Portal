// Per-user TOTP secret storage (encrypted at rest). One blob per user under a
// private prefix; the secret is AES-256-GCM encrypted with a key derived from
// SITE_AUTH_SECRET (defense-in-depth on top of the already-private Blob).
//
// Kill-switch: set SITE_2FA_DISABLED=1 in the env to instantly disable 2FA for
// everyone (password-only login) — the recovery path if an authenticator is
// lost or a clock drifts.

import "server-only";
import { createCipheriv, createDecipheriv, scryptSync, randomBytes } from "crypto";
import { getJSON, storeJSON, deleteJSON } from "@/lib/storage";

const PREFIX = "totp";

type TotpRecord = { userId: string; secretEnc: string; enabled: boolean; updatedAt: string };

function key(): Buffer {
  const base = process.env.SITE_AUTH_SECRET || process.env.HISTORY_AUTH_SECRET;
  if (!base) {
    // Fail closed in production — never encrypt 2FA secrets with a committed
    // literal key. Prod already requires SITE_AUTH_SECRET (middleware enforces
    // it), so this only guards a misconfiguration. Local dev without secrets
    // still works via the throwaway fallback.
    if (process.env.NODE_ENV === "production") {
      throw new Error("SITE_AUTH_SECRET (or HISTORY_AUTH_SECRET) must be set to encrypt 2FA secrets.");
    }
    return scryptSync("kcp-dev-totp-key", "kcp-totp-enc", 32);
  }
  return scryptSync(base, "kcp-totp-enc", 32);
}

function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}.${tag.toString("hex")}.${ct.toString("hex")}`;
}

function decrypt(enc: string): string | null {
  try {
    const [ivH, tagH, ctH] = enc.split(".");
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivH, "hex"));
    decipher.setAuthTag(Buffer.from(tagH, "hex"));
    return Buffer.concat([decipher.update(Buffer.from(ctH, "hex")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** Global kill-switch — true means 2FA is off for everyone. */
export function twoFactorDisabled(): boolean {
  return !!process.env.SITE_2FA_DISABLED;
}

async function get(userId: string): Promise<TotpRecord | null> {
  // retryOnMiss: a transient empty storage lookup must not read as "not
  // enrolled" — that would re-prompt an already-paired user to set up again.
  return (await getJSON(PREFIX, userId, { retryOnMiss: true })) as TotpRecord | null;
}

/** Store a not-yet-confirmed secret (enrollment step 1). */
export async function setPendingSecret(userId: string, secretB32: string): Promise<void> {
  await storeJSON(PREFIX, userId, { userId, secretEnc: encrypt(secretB32), enabled: false, updatedAt: new Date().toISOString() } satisfies TotpRecord);
}

/** Confirm + enable after the user proves a valid code (enrollment step 2). */
export async function enableTotp(userId: string): Promise<void> {
  const rec = await get(userId);
  if (rec) await storeJSON(PREFIX, userId, { ...rec, enabled: true, updatedAt: new Date().toISOString() });
}

export async function disableTotp(userId: string): Promise<void> {
  await deleteJSON(PREFIX, userId);
}

/** The user's secret (decrypted), regardless of enabled state — for verifying
 *  an enrollment code or a login code. Null when none stored. */
export async function getSecret(userId: string): Promise<string | null> {
  const rec = await get(userId);
  return rec ? decrypt(rec.secretEnc) : null;
}

/** True when the user has an ENABLED secret and 2FA isn't globally disabled. */
export async function totpRequired(userId: string): Promise<boolean> {
  if (twoFactorDisabled()) return false;
  const rec = await get(userId);
  return !!rec?.enabled;
}

export async function totpEnabled(userId: string): Promise<boolean> {
  const rec = await get(userId);
  return !!rec?.enabled;
}

// ── "2FA required" roster ─────────────────────────────────────────────────────
// Which users must set up 2FA. Admin-managed (stored) plus an always-on env
// list (SITE_2FA_REQUIRED="alison,nancy"). A required user who hasn't enrolled
// is funneled into guided setup at login.
const REQ_PREFIX = "totp-config";
const REQ_ID = "required";

function envRequired(): string[] {
  return (process.env.SITE_2FA_REQUIRED || "").split(",").map((s) => s.trim()).filter(Boolean);
}

export async function getRequiredUsers(): Promise<string[]> {
  const rec = (await getJSON(REQ_PREFIX, REQ_ID)) as { users?: string[] } | null;
  return [...new Set([...(rec?.users ?? []), ...envRequired()])];
}

export async function setRequiredUsers(users: string[]): Promise<void> {
  await storeJSON(REQ_PREFIX, REQ_ID, { users: [...new Set(users)], updatedAt: new Date().toISOString() });
}

/** A user who must enroll before using the app: required, not globally
 *  disabled, and not yet enrolled. */
export async function mustEnroll(userId: string): Promise<boolean> {
  if (twoFactorDisabled()) return false;
  const required = await getRequiredUsers();
  if (!required.includes(userId)) return false;
  return !(await totpEnabled(userId));
}

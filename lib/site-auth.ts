import { dailyExpiry } from "./auth-expiry";

export const SITE_COOKIE = "site_auth";

function b64urlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return new Uint8Array(sig);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * Build a signed site-access cookie value: "<expiresAtSec>.<userId>.<hmac>".
 * The signed-in user id is part of the payload so the server can trust who
 * is logged in (not just that they knew a password).
 */
export async function signSiteToken(
  secret: string,
  userId: string,
  enrollPending = false,
): Promise<{ value: string; maxAge: number }> {
  const { expiresSec, maxAge } = dailyExpiry();
  // Normal sessions stay 3-part (unchanged); an enroll-pending session adds an
  // "enroll" flag segment so the middleware can confine the user to 2FA setup.
  const payload = enrollPending ? `${expiresSec}.${userId}.enroll` : `${expiresSec}.${userId}`;
  const sig = await hmac(secret, payload);
  return { value: `${payload}.${b64urlEncode(sig)}`, maxAge };
}

/** Verify a site token. Returns the signed-in user id + whether the session is
 *  confined to 2FA enrollment, or null if invalid. */
export async function verifySiteTokenFull(
  token: string | undefined,
  secret: string,
): Promise<{ userId: string; enrollPending: boolean } | null> {
  if (!token) return null;
  const parts = token.split(".");
  let expiresStr: string, userId: string, flag: string, sigStr: string;
  if (parts.length === 3) { [expiresStr, userId, sigStr] = parts; flag = ""; }
  else if (parts.length === 4) { [expiresStr, userId, flag, sigStr] = parts; }
  else return null;
  const expires = Number(expiresStr);
  if (!Number.isFinite(expires) || expires < Math.floor(Date.now() / 1000)) return null;
  if (!userId) return null;
  const payload = flag ? `${expiresStr}.${userId}.${flag}` : `${expiresStr}.${userId}`;
  const expected = await hmac(secret, payload);
  let provided: Uint8Array;
  try { provided = b64urlDecode(sigStr); } catch { return null; }
  return timingSafeEqual(expected, provided) ? { userId, enrollPending: flag === "enroll" } : null;
}

/** Verify a site token → the signed-in user id (or null). */
export async function verifySiteToken(
  token: string | undefined,
  secret: string,
): Promise<string | null> {
  return (await verifySiteTokenFull(token, secret))?.userId ?? null;
}

/** True only when both env vars are configured. When either is missing, the
 *  middleware leaves the site open (useful for local dev). */
export function siteAuthConfigured(): boolean {
  return !!process.env.SITE_PASSWORD && !!process.env.SITE_AUTH_SECRET;
}

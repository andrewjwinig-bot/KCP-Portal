export const SITE_COOKIE = "site_auth";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

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
): Promise<{ value: string; maxAge: number }> {
  const expires = Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS;
  const payload = `${expires}.${userId}`;
  const sig = await hmac(secret, payload);
  return { value: `${payload}.${b64urlEncode(sig)}`, maxAge: MAX_AGE_SECONDS };
}

/** Verify a site token. Returns the signed-in user id, or null if invalid. */
export async function verifySiteToken(
  token: string | undefined,
  secret: string,
): Promise<string | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [expiresStr, userId, sigStr] = parts;
  const expires = Number(expiresStr);
  if (!Number.isFinite(expires) || expires < Math.floor(Date.now() / 1000)) return null;
  if (!userId) return null;
  const expected = await hmac(secret, `${expiresStr}.${userId}`);
  let provided: Uint8Array;
  try { provided = b64urlDecode(sigStr); } catch { return null; }
  return timingSafeEqual(expected, provided) ? userId : null;
}

/** True only when both env vars are configured. When either is missing, the
 *  middleware leaves the site open (useful for local dev). */
export function siteAuthConfigured(): boolean {
  return !!process.env.SITE_PASSWORD && !!process.env.SITE_AUTH_SECRET;
}

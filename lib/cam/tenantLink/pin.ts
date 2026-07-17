// Pure crypto for tenant-link access PINs — no "server-only" / storage imports,
// so it's unit-testable. `access.ts` wraps these with the token + store checks.

import crypto from "crypto";

const PIN_TTL_SEC = 12 * 60 * 60; // re-prompt after 12h

/** A fresh 6-digit access PIN (uniformly random). */
export function generatePin(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Constant-time equality of two non-empty strings of equal length. */
export function pinsMatch(a: string, b: string): boolean {
  const x = Buffer.from(String(a ?? "")), y = Buffer.from(String(b ?? ""));
  return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y);
}

function sign(secret: string, body: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("base64url");
}

/** Signed "PIN satisfied" cookie value (+ maxAge), bound to one link id. */
export function signPinCookie(secret: string, linkId: string): { value: string; maxAge: number } {
  const exp = Math.floor(Date.now() / 1000) + PIN_TTL_SEC;
  const body = `${linkId}.${exp}`;
  return { value: `${body}.${sign(secret, body)}`, maxAge: PIN_TTL_SEC };
}

/** True only when the cookie is well-formed, signed with `secret`, bound to
 *  `linkId`, and not past its embedded expiry. */
export function verifyPinCookie(value: string | undefined, secret: string, linkId: string): boolean {
  if (!value) return false;
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  const [id, expStr, sig] = parts;
  if (id !== linkId) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Math.floor(Date.now() / 1000) > exp) return false;
  const expect = sign(secret, `${id}.${expStr}`);
  const a = Buffer.from(sig), b = Buffer.from(expect);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

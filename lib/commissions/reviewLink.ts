// Signed link to a quarter's commission invoices — the one Alison is emailed
// at quarter-end to review them and release them to AvidXchange, opened
// without signing in (she has no /commissions page).
//
// Domain-separated (`kcp.commissions.review.v1:`) from the tenant, K-1 and
// budget-review signers, so no other token opens it even though all of them
// fall back to the same site secret. Scoped to ONE quarter: the public routes
// refuse any other, and an approval made through it is stamped with the
// reviewer's name.

const enc = new TextEncoder();
/** Domain separator. Changing it invalidates every issued review link. */
const DOMAIN = "kcp.commissions.review.v1:";

export type CommissionReviewPayload = { v: 1; q: string; /** Expires (epoch ms). */ e?: number };

/** A review link lives 60 days (security audit 11/2026: these never expired).
 *  The link only opens a memo and an approve path nothing requires any more,
 *  so two months is generous. Links signed before expiry existed carry no `e`
 *  and stop opening on LEGACY_EXPIRES. */
export const REVIEW_LINK_DAYS = 60;
export const LEGACY_EXPIRES = Date.parse("2027-01-31T23:59:59Z");

export function commissionReviewSecret(): string | null {
  return process.env.SITE_AUTH_SECRET || null;
}

function b64urlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function signCommissionReviewToken(secret: string, quarterLabel: string, now: number = Date.now()): Promise<string> {
  const e = now + REVIEW_LINK_DAYS * 86_400_000;
  const body = b64urlEncode(enc.encode(JSON.stringify({ v: 1, q: quarterLabel, e } satisfies CommissionReviewPayload)));
  return `${body}.${b64urlEncode(await hmac(secret, DOMAIN + body))}`;
}

/** The quarter a token opens, or null for a bad signature. */
export async function verifyCommissionReviewToken(token: string | undefined, secret: string | null, now: number = Date.now()): Promise<string | null> {
  if (!token || !secret) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  let expected: Uint8Array, given: Uint8Array;
  try { expected = await hmac(secret, DOMAIN + body); } catch { return null; }
  try { given = b64urlDecode(token.slice(dot + 1)); } catch { return null; }
  if (!timingSafeEqual(expected, given)) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(b64urlDecode(body))) as CommissionReviewPayload;
    if (!(p.v === 1 && typeof p.q === "string" && p.q)) return null;
    const expires = typeof p.e === "number" ? p.e : LEGACY_EXPIRES;
    return now <= expires ? p.q : null;
  } catch { return null; }
}

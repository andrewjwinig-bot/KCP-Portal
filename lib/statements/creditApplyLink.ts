// The "apply my credit" link on a monthly account notice. Signed, scoped to
// ONE suite and ONE notice month, and DOMAIN-SEPARATED from every other signed
// link (tenant portal, K-1, budget review) — so no other token opens it, even
// where they share the site secret. Nothing is stored for the link itself: the
// notice month's batch holds the account it offers, and the request record
// makes a second confirm a no-op.

const enc = new TextEncoder();
/** Domain separator. Changing it invalidates every issued link. */
const DOMAIN = "kcp.tenant.credit-apply.v1:";

export type CreditApplyPayload = { v: 1; u: string; m: string };

export function creditApplySecret(): string | null {
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

export async function signCreditApplyToken(secret: string, unitRef: string, month: string): Promise<string> {
  const body = b64urlEncode(enc.encode(JSON.stringify({ v: 1, u: unitRef, m: month } satisfies CreditApplyPayload)));
  return `${body}.${b64urlEncode(await hmac(secret, DOMAIN + body))}`;
}

export async function verifyCreditApplyToken(token: string | undefined, secret: string): Promise<CreditApplyPayload | null> {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  let expected: Uint8Array, given: Uint8Array;
  try { expected = await hmac(secret, DOMAIN + body); } catch { return null; }
  try { given = b64urlDecode(token.slice(dot + 1)); } catch { return null; }
  if (!timingSafeEqual(expected, given)) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(b64urlDecode(body))) as CreditApplyPayload;
    if (p.v !== 1 || typeof p.u !== "string" || !/^\d{4}-\d{2}$/.test(p.m)) return null;
    return p;
  } catch { return null; }
}

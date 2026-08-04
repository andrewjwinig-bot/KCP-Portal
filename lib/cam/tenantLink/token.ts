// Signed, revocable tenant CAM-statement link tokens.
//
// A token is "<b64url(payload)>.<b64url(hmac)>" where payload identifies exactly
// one tenant's statement: { v, id, p (property), u (unitRef), y (year), k (kind
// office|retail), exp? }. The HMAC (SHA-256, keyed by the link secret) makes the
// token unforgeable; `id` lets a specific link be revoked server-side; `exp` is
// an optional hard expiry. Mirrors lib/site-auth's primitives.

const enc = new TextEncoder();

export type TenantLinkKind = "office" | "retail";
export type TenantLinkPayload = {
  v: 1;
  id: string;          // link id (for revocation lookup)
  p: string;           // property code
  u: string;           // unit ref
  y: number;           // recon year
  k: TenantLinkKind;
  exp?: number;        // optional expiry (unix seconds)
};

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

/** The signing secret — a dedicated key if set, else the site-auth secret. */
export function linkSecret(): string | null {
  return process.env.TENANT_LINK_SECRET || process.env.SITE_AUTH_SECRET || null;
}

export async function signTenantToken(secret: string, payload: TenantLinkPayload): Promise<string> {
  const body = b64urlEncode(enc.encode(JSON.stringify(payload)));
  const sig = b64urlEncode(await hmac(secret, body));
  return `${body}.${sig}`;
}

/** Verify signature + expiry and return the payload, or null. Revocation is a
 *  separate store check the caller does with the returned `id`. */
export async function verifyTenantToken(token: string | undefined, secret: string): Promise<TenantLinkPayload | null> {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let expected: Uint8Array, provided: Uint8Array;
  try {
    expected = await hmac(secret, body);
    provided = b64urlDecode(sig);
  } catch { return null; }
  if (!timingSafeEqual(expected, provided)) return null;
  let payload: TenantLinkPayload;
  try { payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body))); }
  catch { return null; }
  if (payload.v !== 1 || !payload.id || !payload.p || !payload.u || !payload.y || !payload.k) return null;
  if (payload.exp != null && payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

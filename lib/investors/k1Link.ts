// Signed, revocable investor-portal links.
//
// Deliberately separate from the tenant link module rather than sharing its
// signer. Two reasons, both about blast radius: the audience is different (an
// investor is not a tenant and must never be able to reach a tenant's account
// with their token), and the HMAC is domain-separated with a fixed prefix so a
// token minted for one surface can never verify on the other — even if both end
// up falling back to the same site secret.

import "server-only";
import { createCollectionStore } from "@/lib/collectionStore";

const enc = new TextEncoder();
/** Domain separator. Changing it invalidates every issued investor link. */
const DOMAIN = "kcp.investor.k1.v1:";

export type InvestorLinkPayload = {
  v: 1;
  id: string;          // link id, for revocation
  o: string;           // owner id (own-7010-akgst)
  p: string;           // property code
  exp?: number;        // optional hard expiry (unix seconds)
};

export type InvestorLink = {
  id: string;
  /** Primary interest — kept for older links and for the signed token's `o`. */
  ownerId: string;
  /** EVERY interest this link covers. One person holding a trust interest and a
   *  personal one in the same partnership gets ONE link showing both K-1s, so
   *  they aren't asked to juggle two links and two PINs for their own documents.
   *  Always derived server-side from the roster (same name, same property) —
   *  never from a client-supplied list, or a caller could widen a link onto
   *  someone else's K-1. Absent on links minted before this existed. */
  ownerIds?: string[];
  ownerName: string;
  propertyCode: string;
  createdAt: string;
  createdBy?: string;
  revoked: boolean;
  expiresAt?: string | null;
  /** Access PIN. Unlike the tenant portal this is NOT optional — a K-1 carries
   *  a taxpayer ID, so a forwarded link alone must not open it. */
  pin: string;
  views: { at: string; ip?: string }[];
  lastViewedAt?: string | null;
  viewCount: number;
  /**
   * When the link email actually went out, and to whom.
   *
   * A link EXISTING and a link having been EMAILED are different facts, and
   * the roster used to show one pill for both — "SHARED" for a link that was
   * only ever created. Recorded here so "did this investor's K-1 actually
   * go out, and when" is answerable on the roster rather than from the admin
   * audit log or Postmark. Absent on links minted before this existed, and on
   * links created without sending.
   */
  sentAt?: string | null;
  sentTo?: string[];
  /** When the PIN's own email went. Null after a send means it did NOT — the
   *  investor holds a link they cannot open, which the roster must show. */
  pinSentAt?: string | null;
  /** How many times this link has been emailed (a re-send is a real event). */
  sendCount?: number;
};

/** The interests a link covers, tolerating links minted before `ownerIds`. */
export function linkOwnerIds(l: Pick<InvestorLink, "ownerId" | "ownerIds">): string[] {
  return l.ownerIds?.length ? l.ownerIds : [l.ownerId];
}

const store = createCollectionStore<InvestorLink>({ prefix: "investor-links", keyOf: (l) => l.id });

export const saveInvestorLink = (l: InvestorLink) => store.set(l.id, l);
export const getInvestorLink = (id: string) => store.get(id);
export const listInvestorLinks = () => store.all().then((ls) => ls.filter(Boolean));
export async function revokeInvestorLink(id: string): Promise<boolean> {
  const l = await store.get(id);
  if (!l) return false;
  l.revoked = true;
  await store.set(id, l);
  return true;
}

/** A dedicated secret when set, else the site secret. Domain separation above
 *  makes sharing the site secret safe against cross-surface replay. */
export function investorLinkSecret(): string | null {
  return process.env.INVESTOR_LINK_SECRET || process.env.SITE_AUTH_SECRET || null;
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

export async function signInvestorToken(secret: string, payload: InvestorLinkPayload): Promise<string> {
  const body = b64urlEncode(enc.encode(JSON.stringify(payload)));
  return `${body}.${b64urlEncode(await hmac(secret, DOMAIN + body))}`;
}

/** Verify signature + expiry. Revocation is a separate store lookup by `id`. */
export async function verifyInvestorToken(token: string | undefined, secret: string): Promise<InvestorLinkPayload | null> {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let expected: Uint8Array;
  try { expected = await hmac(secret, DOMAIN + body); } catch { return null; }
  let given: Uint8Array;
  try { given = b64urlDecode(sig); } catch { return null; }
  if (!timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body))) as InvestorLinkPayload;
    if (payload.v !== 1 || !payload.id || !payload.o || !payload.p) return null;
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;
    return payload;
  } catch { return null; }
}

/** 6-digit access PIN. */
export function generatePin(): string {
  const b = new Uint32Array(1);
  crypto.getRandomValues(b);
  return String(b[0] % 1_000_000).padStart(6, "0");
}

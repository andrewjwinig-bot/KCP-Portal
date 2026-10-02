// Signed, revocable links to the Rent Roll Review — the page Harry (shopping
// centres) and Nancy (business parks) are SENT, opened without signing in.
//
// Modelled on the investor K-1 links and deliberately separate from them: the
// HMAC is domain-separated with its own prefix, so a token minted for one
// surface can never verify on another even when both fall back to the same
// site secret. A link is scoped to ONE person, ONE group of properties and ONE
// budget year; the public routes refuse any property outside that group, and
// every decision made through it is stamped with that person's name.
// Revoking kills it at once; minting again for the same person, group and year
// reuses the live link rather than issuing a second.

import "server-only";
import { createCollectionStore } from "@/lib/collectionStore";

const enc = new TextEncoder();
/** Domain separator. Changing it invalidates every issued review link. */
const DOMAIN = "kcp.budget.review.v1:";

export type ReviewGroup = "SC" | "BP";
export type ReviewPayload = { v: 1; id: string; u: string; g: ReviewGroup; y: number };

export type ReviewLink = {
  id: string;
  /** The person the link is for — "harry" / "nancy". */
  user: string;
  group: ReviewGroup;
  year: number;
  createdAt: string;
  createdBy?: string;
  revoked: boolean;
  viewCount: number;
  lastViewedAt?: string | null;
};

const store = createCollectionStore<ReviewLink>({ prefix: "budget-review-links", keyOf: (l) => l.id });

export function reviewLinkSecret(): string | null {
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

export async function signReviewToken(secret: string, payload: ReviewPayload): Promise<string> {
  const body = b64urlEncode(enc.encode(JSON.stringify(payload)));
  return `${body}.${b64urlEncode(await hmac(secret, DOMAIN + body))}`;
}

/** Signature only; revocation is the store lookup in `resolveReviewToken`. */
export async function verifyReviewToken(token: string | undefined, secret: string): Promise<ReviewPayload | null> {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  let expected: Uint8Array, given: Uint8Array;
  try { expected = await hmac(secret, DOMAIN + body); } catch { return null; }
  try { given = b64urlDecode(token.slice(dot + 1)); } catch { return null; }
  if (!timingSafeEqual(expected, given)) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(b64urlDecode(body))) as ReviewPayload;
    if (p.v !== 1 || !p.id || !p.u || (p.g !== "SC" && p.g !== "BP") || !p.y) return null;
    return p;
  } catch { return null; }
}

/** A live, signed link for this person, group and year — the existing one if
 *  there is one. */
export async function mintReviewLink(user: string, group: ReviewGroup, year: number, createdBy?: string): Promise<{ link: ReviewLink; token: string } | null> {
  const secret = reviewLinkSecret();
  if (!secret) return null;
  const live = (await store.all()).find((l) => !l.revoked && l.user === user && l.group === group && l.year === year);
  const link: ReviewLink = live ?? {
    id: crypto.randomUUID(), user, group, year,
    createdAt: new Date().toISOString(), createdBy, revoked: false, viewCount: 0,
  };
  if (!live) await store.set(link.id, link);
  return { link, token: await signReviewToken(secret, { v: 1, id: link.id, u: user, g: group, y: year }) };
}

export async function revokeReviewLink(id: string): Promise<boolean> {
  const l = await store.get(id);
  if (!l) return false;
  await store.set(id, { ...l, revoked: true });
  return true;
}

export async function listReviewLinks(): Promise<ReviewLink[]> {
  return store.all();
}

/** The live link a token opens, or null (bad signature, revoked, or unknown).
 *  Counts the view when `recordView`. */
export async function resolveReviewToken(token: string | undefined, recordView = false): Promise<ReviewLink | null> {
  const secret = reviewLinkSecret();
  if (!secret) return null;
  const p = await verifyReviewToken(token, secret);
  if (!p) return null;
  const l = await store.get(p.id);
  if (!l || l.revoked || l.user !== p.u || l.group !== p.g || l.year !== p.y) return null;
  if (recordView) {
    const next = { ...l, viewCount: (l.viewCount ?? 0) + 1, lastViewedAt: new Date().toISOString() };
    await store.set(l.id, next).catch(() => {});
    return next;
  }
  return l;
}

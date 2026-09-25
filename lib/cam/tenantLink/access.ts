// Shared access gate for every tenant-token route. Verifies the signed token,
// checks the link isn't revoked, and — when the link carries an access PIN —
// requires a valid short-lived "PIN satisfied" cookie. The token in the URL is
// the primary secret; the PIN is a second factor so a leaked/forwarded link
// alone can't open the portal. Enforced server-side (not just in the UI).

import "server-only";
import type { NextRequest } from "next/server";
import { verifyTenantToken, linkSecret, type TenantLinkPayload } from "./token";
import { getTenantLink, type TenantLink } from "./store";
import { pinsMatch, signPinCookie, verifyPinCookie, generatePin } from "./pin";

export { generatePin };
export const makePinCookie = signPinCookie;
export const pinCookieName = (linkId: string) => `kcp_pin_${linkId}`;

// Flat shape (not a discriminated union) so it narrows correctly under this
// project's non-strict tsconfig. On success `ok` is true and payload/link are
// set; on failure `ok` is false with error/status (+ pinRequired when only the
// PIN is missing).
export type AccessResult = {
  ok: boolean;
  status: number;
  error?: string;
  pinRequired?: boolean;
  payload?: TenantLinkPayload;
  link?: TenantLink;
};

/** Whether the request already carries a valid "PIN satisfied" cookie for this
 *  link (always true when the link has no PIN). */
export function pinSatisfied(link: TenantLink, req: NextRequest): boolean {
  if (!link.pin) return true;
  const secret = linkSecret();
  if (!secret) return false;
  return verifyPinCookie(req.cookies.get(pinCookieName(link.id))?.value, secret, link.id);
}

/** Constant-time PIN comparison. A link with no PIN always matches. */
export function pinMatches(link: TenantLink, pin: string): boolean {
  if (!link.pin) return true;
  return pinsMatch(link.pin, pin);
}

/** Full gate for a token route. Returns the payload + link on success, or a
 *  structured failure ({ pinRequired: true } when only the PIN is missing). */
export async function checkTenantAccess(token: string, req: NextRequest): Promise<AccessResult> {
  const secret = linkSecret();
  if (!secret) return { ok: false, status: 503, error: "Sharing is not configured." };
  const payload = await verifyTenantToken(token, secret);
  if (!payload) return { ok: false, status: 401, error: "This link is invalid or has expired." };
  const link = await getTenantLink(payload.id);
  if (!link || link.revoked) return { ok: false, status: 401, error: "This link has been revoked." };
  if (link.pin) {
    const cookie = req.cookies.get(pinCookieName(link.id))?.value;
    if (!verifyPinCookie(cookie, secret, link.id)) {
      return { ok: false, status: 401, error: "Enter the access PIN to view this statement.", pinRequired: true };
    }
  }
  return { ok: true, status: 200, payload, link };
}

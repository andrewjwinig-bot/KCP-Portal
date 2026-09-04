// Access gate for every investor-portal route: verify the signed token, check
// the link isn't revoked, and require a satisfied PIN.
//
// Unlike the tenant portal, the PIN is mandatory. A K-1 carries a taxpayer ID
// and a capital account; a link forwarded in an email thread must not be enough
// to open one on its own.

import "server-only";
import type { NextRequest } from "next/server";
import { verifyInvestorToken, investorLinkSecret, getInvestorLink, type InvestorLink, type InvestorLinkPayload } from "./k1Link";
import { verifyPinCookie, signPinCookie, pinsMatch } from "@/lib/cam/tenantLink/pin";

export { signPinCookie as makeInvestorPinCookie, pinsMatch as investorPinMatches };

/** Distinct from the tenant cookie name so the two portals never share state. */
export const investorPinCookieName = (linkId: string) => `kcp_ipin_${linkId}`;

// Flat shape (not a discriminated union) so it narrows under this project's
// non-strict tsconfig — same reason lib/cam/tenantLink/access.ts is flat.
export type InvestorAccess = {
  ok: boolean;
  status: number;
  error?: string;
  pinRequired?: boolean;
  payload?: InvestorLinkPayload;
  link?: InvestorLink;
};

export async function checkInvestorAccess(token: string, req: NextRequest): Promise<InvestorAccess> {
  const secret = investorLinkSecret();
  if (!secret) return { ok: false, status: 503, error: "Investor sharing is not configured." };
  const payload = await verifyInvestorToken(token, secret);
  if (!payload) return { ok: false, status: 401, error: "This link is invalid or has expired." };
  const link = await getInvestorLink(payload.id);
  if (!link || link.revoked) return { ok: false, status: 401, error: "This link has been revoked." };
  // The token carries the owner; the stored link is the authority. A mismatch
  // means a tampered or stale token — refuse rather than trust either side.
  if (link.ownerId !== payload.o) return { ok: false, status: 401, error: "This link is no longer valid." };
  if (!verifyPinCookie(req.cookies.get(investorPinCookieName(link.id))?.value, secret, link.id)) {
    return { ok: false, status: 401, error: "Enter your access PIN to continue.", pinRequired: true };
  }
  return { ok: true, status: 200, payload, link };
}

/** Record a view — best-effort, capped, never throws into the caller. */
export async function logInvestorView(link: InvestorLink, ip?: string): Promise<void> {
  try {
    const { saveInvestorLink } = await import("./k1Link");
    const at = new Date().toISOString();
    link.views = [...(link.views ?? []), { at, ...(ip ? { ip } : {}) }].slice(-50);
    link.viewCount = (link.viewCount ?? 0) + 1;
    link.lastViewedAt = at;
    await saveInvestorLink(link);
  } catch { /* best-effort */ }
}

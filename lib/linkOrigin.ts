import type { NextRequest } from "next/server";

/**
 * The host every shared link is built on.
 *
 * A tenant or investor link is emailed and then lives for months, so the
 * hostname baked into it matters more than the one that happened to serve the
 * request that minted it. Five routes each derived it from the incoming `Host`
 * header, which meant a link minted from a preview deployment, or from the
 * bare `kcp-portal.vercel.app` before a custom domain was attached, carried
 * that hostname forever.
 *
 * `PORTAL_ORIGIN` pins it. Set it once in the Vercel project (e.g.
 * `https://portal.kormancommercial.com`) and every link — CAM statements,
 * monthly statements, payment allocations, investor K-1s — is built on it,
 * whichever deployment mints it.
 *
 * This also matters for deliverability rather than tidiness: mail already goes
 * out from `@kormancommercial.com`, so a link pointing at a `vercel.app` host
 * puts the sending domain and the link domain in different places, which is a
 * heuristic spam filters score against directly.
 *
 * Unset, it falls back to the request's own host, so nothing breaks before the
 * domain is configured.
 */
export function linkOrigin(req: NextRequest): string {
  const pinned = (process.env.PORTAL_ORIGIN ?? "").trim().replace(/\/+$/, "");
  if (pinned) return /^https?:\/\//i.test(pinned) ? pinned : `https://${pinned}`;
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${req.headers.get("host") ?? req.nextUrl.host}`;
}

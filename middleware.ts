import { NextResponse, type NextRequest } from "next/server";
import { HISTORY_COOKIE, verifyHistoryToken } from "./lib/history-auth";
import { SITE_COOKIE, verifySiteToken } from "./lib/site-auth";

// Two layers:
//  - Site auth (SITE_PASSWORD / SITE_AUTH_SECRET): gates every page + API
//    except the login route itself, redirecting to /login when missing.
//  - Admin auth (HISTORY_PASSWORD / HISTORY_AUTH_SECRET): keeps the existing
//    elevated gates on payroll / history / generation endpoints.
//
// If the SITE env vars aren't set, site auth is treated as not configured and
// pages stay open (useful for local dev without a password).
export const config = {
  // Catch everything except static asset routes and the two login endpoints.
  matcher: [
    "/((?!_next/static|_next/image|_next/data|favicon.ico|images|login|submit|api/site/login|api/site/logout|api/maintenance/inbound|api/maintenance/submit|api/tenants).*)",
  ],
};

const ADMIN_PATH_PREFIXES = [
  "/history",
  "/api/periods",
  "/api/parse-payroll",
  "/api/generate-all",
  "/api/generate-pdf",
  "/api/allocation",
];

function isAdminPath(pathname: string): boolean {
  return ADMIN_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── Site-wide auth ──────────────────────────────────────────────────
  const sitePassword = process.env.SITE_PASSWORD;
  const siteSecret = process.env.SITE_AUTH_SECRET;
  if (sitePassword && siteSecret) {
    const siteToken = req.cookies.get(SITE_COOKIE)?.value;
    const siteOk = await verifySiteToken(siteToken, siteSecret);
    if (!siteOk) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }

  // ── Admin auth for elevated paths ───────────────────────────────────
  if (isAdminPath(pathname)) {
    // Always allow the admin login screen + its API; site auth above already
    // gated whether you can reach them.
    if (pathname === "/history/login" || pathname.startsWith("/api/history/")) {
      return NextResponse.next();
    }
    const adminSecret = process.env.HISTORY_AUTH_SECRET;
    if (!adminSecret) {
      return NextResponse.json(
        { error: "Admin auth not configured: set HISTORY_PASSWORD and HISTORY_AUTH_SECRET env vars." },
        { status: 503 },
      );
    }
    const adminToken = req.cookies.get(HISTORY_COOKIE)?.value;
    const adminOk = await verifyHistoryToken(adminToken, adminSecret);
    if (!adminOk) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const url = req.nextUrl.clone();
      url.pathname = "/history/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

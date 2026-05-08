import { NextResponse, type NextRequest } from "next/server";
import { HISTORY_COOKIE, verifyHistoryToken } from "./lib/history-auth";

export const config = {
  matcher: [
    "/",
    "/history",
    "/history/:path*",
    "/api/periods",
    "/api/periods/:path*",
    "/api/parse-payroll",
    "/api/generate-all",
    "/api/generate-pdf",
    "/api/allocation",
  ],
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/history/login" || pathname.startsWith("/api/history/")) {
    return NextResponse.next();
  }

  const secret = process.env.HISTORY_AUTH_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "History auth not configured: set HISTORY_PASSWORD and HISTORY_AUTH_SECRET env vars." },
      { status: 503 },
    );
  }

  const token = req.cookies.get(HISTORY_COOKIE)?.value;
  const ok = await verifyHistoryToken(token, secret);
  if (ok) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/history/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

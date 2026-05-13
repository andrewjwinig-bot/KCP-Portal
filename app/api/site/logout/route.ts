import { NextResponse } from "next/server";
import { SITE_COOKIE } from "@/lib/site-auth";
import { HISTORY_COOKIE } from "@/lib/history-auth";

export const runtime = "nodejs";

/** Site-wide logout. Clears both the site cookie and the admin cookie so
 *  signing out drops the user back to the login screen with no elevated
 *  state remaining. */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SITE_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
  res.cookies.set(HISTORY_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}

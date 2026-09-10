import { NextResponse } from "next/server";
import { HISTORY_COOKIE } from "../../../../lib/history-auth";

export const runtime = "nodejs";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(HISTORY_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

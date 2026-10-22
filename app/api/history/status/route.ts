import { NextRequest, NextResponse } from "next/server";
import { HISTORY_COOKIE, verifyHistoryToken } from "../../../../lib/history-auth";

export const runtime = "nodejs";

/** GET /api/history/status — returns whether the admin auth cookie is currently valid. */
export async function GET(req: NextRequest) {
  const secret = process.env.HISTORY_AUTH_SECRET;
  if (!secret) return NextResponse.json({ authed: false });
  const token = req.cookies.get(HISTORY_COOKIE)?.value;
  const ok = await verifyHistoryToken(token, secret);
  return NextResponse.json({ authed: ok });
}

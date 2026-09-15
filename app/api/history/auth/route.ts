import { NextResponse } from "next/server";
import { z } from "zod";
import { HISTORY_COOKIE, signHistoryToken } from "../../../../lib/history-auth";

export const runtime = "nodejs";

const Body = z.object({ password: z.string() });

export async function POST(req: Request) {
  const password = process.env.HISTORY_PASSWORD;
  const secret = process.env.HISTORY_AUTH_SECRET;
  if (!password || !secret) {
    return NextResponse.json({ error: "Server not configured" }, { status: 503 });
  }

  let body: z.infer<typeof Body>;
  try { body = Body.parse(await req.json()); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }

  if (body.password !== password) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const { value, maxAge } = await signHistoryToken(secret);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(HISTORY_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  });
  return res;
}

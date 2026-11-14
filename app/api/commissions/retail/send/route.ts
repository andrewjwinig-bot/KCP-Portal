import { NextRequest, NextResponse } from "next/server";
import { sendRetailEntry } from "@/lib/commissions/sendRetailEntry";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { USERS } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** POST { id } — Harry's "Send to Avid": that one retail commission to
 *  AvidXchange, its GL import to Marie, and the payroll figure to Harry.
 *  Gated with /api/commissions by middleware. Safe to repeat. */
export async function POST(req: NextRequest) {
  let id = "";
  try { id = String((await req.json())?.id ?? ""); } catch { /* empty */ }
  if (!id) return NextResponse.json({ ok: false, reason: "No commission id" }, { status: 400 });
  let by: string | null = null;
  const secret = process.env.SITE_AUTH_SECRET;
  const cookie = req.cookies.get(SITE_COOKIE)?.value;
  if (secret && cookie) {
    const uid = await verifySiteToken(cookie, secret);
    by = uid ? (USERS as Record<string, { label?: string }>)[uid]?.label ?? uid : null;
  }
  const res = await sendRetailEntry(id, by);
  return NextResponse.json(res, { status: res.avid ? 200 : 502 });
}

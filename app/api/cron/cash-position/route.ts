import { NextResponse } from "next/server";
import { cronCashPosition } from "@/lib/financials/bank-balances/ownershipEmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Monday-afternoon fallback for the cash position email (vercel.json). The
 * email normally goes the moment the week's bank balances are imported; this
 * sends it if that somehow did not happen, and otherwise reminds Drew rather
 * than sending last week's figures. Bearer `CRON_SECRET` only.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await cronCashPosition());
}

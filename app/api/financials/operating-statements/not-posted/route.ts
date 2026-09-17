import { NextResponse } from "next/server";
import { collectNotPosted } from "@/lib/financials/operating-statements/notPosted";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET [?year=YYYY][&key=<propertyKey>] → the not-posted scan across the
// portfolio's latest imported month (or one property when key is given).
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const year = Number(url.searchParams.get("year")) || new Date().getFullYear();
    const key = url.searchParams.get("key") || undefined;
    return NextResponse.json(await collectNotPosted(year, key));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to scan" }, { status: 500 });
  }
}

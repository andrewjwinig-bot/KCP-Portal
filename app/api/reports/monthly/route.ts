import { NextResponse } from "next/server";
import { buildMonthlyReport } from "@/lib/reports/monthly";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** GET ?year=&month= → the assembled Master Monthly Review for that month. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const now = new Date();
  const year = Number(url.searchParams.get("year")) || now.getFullYear();
  const month = Math.min(12, Math.max(1, Number(url.searchParams.get("month")) || now.getMonth() + 1));
  try {
    const report = await buildMonthlyReport(year, month, now);
    return NextResponse.json({ report });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to build report" }, { status: 500 });
  }
}

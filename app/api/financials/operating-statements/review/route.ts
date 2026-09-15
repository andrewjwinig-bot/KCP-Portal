import { NextResponse } from "next/server";
import { reviewFlaggedLines } from "@/lib/financials/operating-statements/review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET ?year=YYYY — every active "?" flagged line across all properties, for the
// concentrated cross-property review list.
export async function GET(req: Request) {
  const year = Number(new URL(req.url).searchParams.get("year")) || new Date().getFullYear();
  try {
    return NextResponse.json(await reviewFlaggedLines(year));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to build review" }, { status: 500 });
  }
}

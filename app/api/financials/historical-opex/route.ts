import { NextResponse } from "next/server";
import { listHistoricalOpEx } from "@/lib/financials/historical-opex/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const entries = await listHistoricalOpEx();
    return NextResponse.json({ entries });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load" },
      { status: 500 },
    );
  }
}

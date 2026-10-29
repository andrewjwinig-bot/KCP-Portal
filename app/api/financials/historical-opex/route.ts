import { NextResponse } from "next/server";
import { listHistoricalOpEx } from "@/lib/financials/historical-opex/storage";
import { glDerivedOpEx, mergeOpEx } from "@/lib/financials/historical-opex/glDerived";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    // Manual (office) history is authoritative and untouched; the GLs fill in
    // every property the manual store doesn't already cover, so one set of
    // imported documents feeds both Operating Statements and this page.
    const [manual, derived] = await Promise.all([listHistoricalOpEx(), glDerivedOpEx()]);
    return NextResponse.json({ entries: mergeOpEx(manual, derived) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load" },
      { status: 500 },
    );
  }
}

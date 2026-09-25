import { NextRequest, NextResponse } from "next/server";
import { loadManagementFees, managementFeeDetail } from "@/lib/financials/management-fees/compute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET ?year=            → the full building × month management-fee dataset
// GET ?year=&code=1100  → one building's drill-down (fee / revenue / fee% / budget)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year")) || new Date().getFullYear();
  const code = searchParams.get("code");

  if (code) {
    const detail = await managementFeeDetail(code, year);
    if (!detail) return NextResponse.json({ error: `No data for ${code} ${year}.` }, { status: 404 });
    return NextResponse.json({ detail });
  }
  return NextResponse.json(await loadManagementFees(year));
}

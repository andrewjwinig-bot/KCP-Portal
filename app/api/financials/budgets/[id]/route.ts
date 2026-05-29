import { NextResponse } from "next/server";
import { getBudget, deleteBudget } from "@/lib/financials/budgets/storage";
import { enrichWithRentRollDates } from "@/lib/financials/budgets/enrich";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const wb = await getBudget(params.id);
    if (!wb) return NextResponse.json({ error: "Not found" }, { status: 404 });
    // Layer in lease windows from the portal's stored rent roll for
    // any rent-roster tenant whose dates the workbook didn't already
    // carry (typically in-place leases — the workbook only ships
    // dates for leases on the Renew & Vac tab).
    await enrichWithRentRollDates(wb);
    return NextResponse.json({ workbook: wb });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load budget" },
      { status: 500 },
    );
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ok = await deleteBudget(params.id);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to delete" },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { listBudgets } from "@/lib/financials/budgets/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const workbooks = await listBudgets();
    // Lighter list payload — drop the heavy `properties` array, callers
    // hit /[id] when they need the full data.
    const summary = workbooks.map((w) => ({
      id: w.id,
      label: w.label,
      category: w.category,
      year: w.year,
      uploadedAt: w.uploadedAt,
      uploadedBy: w.uploadedBy,
      propertyCount: w.properties.length,
    }));
    return NextResponse.json({ workbooks: summary });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load budgets" },
      { status: 500 },
    );
  }
}

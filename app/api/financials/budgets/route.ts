import { NextResponse } from "next/server";
import { listBudgets } from "@/lib/financials/budgets/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const workbooks = await listBudgets();
    // Light list payload — drop heavy sections / sub-lines, but include
    // each property's code + name so the page can build a combined
    // property dropdown across all workbooks without hitting /[id] for
    // every one.
    const summary = workbooks.map((w) => ({
      id: w.id,
      label: w.label,
      kind: w.kind,
      category: w.category,
      year: w.year,
      uploadedAt: w.uploadedAt,
      uploadedBy: w.uploadedBy,
      propertyCount: w.properties.length,
      properties: w.properties.map((p) => ({
        propertyCode: p.propertyCode,
        propertyName: p.propertyName,
      })),
    }));
    return NextResponse.json({ workbooks: summary });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load budgets" },
      { status: 500 },
    );
  }
}

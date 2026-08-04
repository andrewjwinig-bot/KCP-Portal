import { NextResponse } from "next/server";
import { getBudget } from "@/lib/financials/budgets/storage";
import { generateBudgetDownloadPdf } from "@/lib/financials/budgets/budgetPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/financials/budgets/:id/download/pdf?property=2300
// Returns a presentation-ready single-property summary PDF — title
// band, KPI tiles, and the full section / line / subtotal table with
// automatic pagination. Detail surfaces (rent roll, allocations, CIP)
// stay on the Excel download.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const url = new URL(req.url);
    const propertyCode = (url.searchParams.get("property") ?? "").toUpperCase();
    if (!propertyCode) {
      return NextResponse.json({ error: "?property=<code> required" }, { status: 400 });
    }
    const wb = await getBudget(params.id);
    if (!wb) return NextResponse.json({ error: "Budget not found" }, { status: 404 });
    const property = wb.properties.find((p) => p.propertyCode.toUpperCase() === propertyCode);
    if (!property) {
      return NextResponse.json({ error: `Property ${propertyCode} not in this budget` }, { status: 404 });
    }
    const buf = await generateBudgetDownloadPdf(wb, property);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${wb.year} Budget - ${property.propertyCode} ${property.propertyName}.pdf"`,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to generate budget PDF" },
      { status: 500 },
    );
  }
}

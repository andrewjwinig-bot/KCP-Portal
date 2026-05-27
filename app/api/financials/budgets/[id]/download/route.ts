import { NextResponse } from "next/server";
import { getBudget } from "@/lib/financials/budgets/storage";
import { generateBudgetDownloadXlsx } from "@/lib/financials/budgets/budgetDownload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/financials/budgets/:id/download?property=2300
// Returns the presentation-ready full-budget .xlsx for one property —
// every section, every line, every sub-line, plus the headline KPI
// rollups and cross-section subtotals.
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
    const buf = generateBudgetDownloadXlsx(wb, property);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${wb.year} Budget - ${property.propertyCode} ${property.propertyName}.xlsx"`,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to generate budget download" },
      { status: 500 },
    );
  }
}

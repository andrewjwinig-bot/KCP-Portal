import { NextResponse } from "next/server";
import { getJSON } from "@/lib/storage";
import { listLoans } from "@/lib/debt/storage";
import { buildLiveBudget } from "@/lib/financials/budgets/build";
import { getBudget, saveBudget } from "@/lib/financials/budgets/storage";
import type { BudgetCategory } from "@/lib/financials/budgets/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// POST /api/financials/budgets/create
// Body: { year, category, priorBudgetId?, opExGrowthPct? }
//
// Builds a live BudgetWorkbook from the current rent roll, loans, and an
// optional prior-year budget for OpEx baseline. Returns the new id.
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      year?: number;
      category?: BudgetCategory;
      priorBudgetId?: string;
      opExGrowthPct?: number;
      retGrowthPct?: number;
      insGrowthPct?: number;
      name?: string;
    };
    const year = Number(body.year);
    const category = body.category as BudgetCategory;
    const opExGrowthPct = Number.isFinite(body.opExGrowthPct) ? Number(body.opExGrowthPct) : 3;
    const retGrowthPct = Number.isFinite(body.retGrowthPct) ? Number(body.retGrowthPct) : undefined;
    const insGrowthPct = Number.isFinite(body.insGrowthPct) ? Number(body.insGrowthPct) : undefined;
    const validCategory: BudgetCategory[] = ["Shopping Centers", "Office", "Residential", "Other"];
    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      return NextResponse.json({ error: "Invalid year" }, { status: 400 });
    }
    if (!validCategory.includes(category)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }

    const rentroll = (await getJSON("rentroll", "current")) as
      | { properties: any[]; uploadedAt?: string }
      | null;
    const loans = await listLoans();
    const prior = body.priorBudgetId ? await getBudget(body.priorBudgetId) : null;

    const wb = buildLiveBudget({
      year,
      category,
      rentroll,
      loans,
      prior,
      opExGrowthPct,
      retGrowthPct,
      insGrowthPct,
    });

    if (wb.properties.length === 0) {
      return NextResponse.json(
        { error: "No properties found for that category in the current rent roll" },
        { status: 400 },
      );
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (name) wb.label = name;
    wb.status = "draft"; // new in-app budgets start as a draft until finalized
    await saveBudget(wb);
    return NextResponse.json({
      ok: true,
      id: wb.id,
      label: wb.label,
      year: wb.year,
      category: wb.category,
      propertyCount: wb.properties.length,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to build budget" },
      { status: 500 },
    );
  }
}

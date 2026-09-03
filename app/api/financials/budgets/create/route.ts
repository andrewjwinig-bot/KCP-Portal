import { NextResponse } from "next/server";
import { getJSON } from "@/lib/storage";
import { listLoans } from "@/lib/debt/storage";
import { buildLiveBudget, rentRollCodesForCategory, type ReprojExpenseLine } from "@/lib/financials/budgets/build";
import { getBudget, saveBudget, listBudgets } from "@/lib/financials/budgets/storage";
import { loadReprojection } from "@/lib/financials/reprojections/load";
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
    // Prior budget = an explicit pick, else auto-select the newest same-category
    // budget. It provides structure (reimbursement/capital lines, GL mapping) and
    // an OpEx fallback; reprojByCode below overrides the OpEx numbers.
    let prior = body.priorBudgetId ? await getBudget(body.priorBudgetId) : null;
    if (!prior) {
      const all = await listBudgets().catch(() => []);
      prior = all.filter((w) => w.category === category).sort((a, b) => b.year - a.year)[0]
        ?? all.sort((a, b) => b.year - a.year)[0] ?? null;
    }

    // Operating expenses autofill from each building's reprojection (this year's
    // YTD actuals + forecast for the rest), basis = the year before the budget.
    // No dropdown — one reproj per building in the category.
    const reprojByCode: Record<string, { reimbExp: ReprojExpenseLine[]; nonReimb: ReprojExpenseLine[] }> = {};
    if (rentroll) {
      const codes = rentRollCodesForCategory(rentroll as any, category);
      for (const code of codes) {
        const loaded = await loadReprojection(code, year - 1).catch(() => null);
        if (!loaded) continue;
        const reimbExp: ReprojExpenseLine[] = [];
        const nonReimb: ReprojExpenseLine[] = [];
        for (const sec of loaded.reprojection.sections) {
          const bucket = sec.role === "reimbursable-expense" ? reimbExp
            : (sec.role === "non-reimbursable-expense" || sec.role === "residential-expense") ? nonReimb
            : null;
          if (!bucket) continue;
          for (const l of sec.lines) bucket.push({ label: l.label, blended: l.blended });
        }
        if (reimbExp.length || nonReimb.length) reprojByCode[code] = { reimbExp, nonReimb };
      }
    }

    const wb = buildLiveBudget({
      year,
      category,
      rentroll,
      loans,
      prior,
      opExGrowthPct,
      retGrowthPct,
      insGrowthPct,
      reprojByCode,
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

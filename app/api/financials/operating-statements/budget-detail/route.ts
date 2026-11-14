import { NextResponse } from "next/server";
import { resolvePropertyBudget, budgetDetailForMask } from "@/lib/financials/operating-statements/budgetCrosswalk";
import { accountMatchesMask } from "@/lib/financials/operating-statements/mask";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET — the budget lines behind a statement line's budget cell. Resolves the
// property's budget (with the same year fallback as the statement) and returns
// every budget line whose GL account matches the statement line's mask, with
// month / YTD / annual amounts — so "$200 budgeted, $0 actual" can be traced
// to the budget line it came from (e.g. "Misc Expenses").
export async function GET(req: Request) {
  const url = new URL(req.url);
  const property = url.searchParams.get("property");
  const year = Number(url.searchParams.get("year"));
  const mask = url.searchParams.get("mask");
  const period = Number(url.searchParams.get("period")) || 12;

  if (!property || !year || !mask) {
    return NextResponse.json({ error: "property, year and mask are required" }, { status: 400 });
  }

  const budget = await resolvePropertyBudget(property, year);
  if (!budget) {
    return NextResponse.json({ rows: [], budgetYear: null, fallback: false });
  }
  const rows = budgetDetailForMask(budget, mask, period);
  // For the rental-income line, also surface the workbook's per-tenant rent
  // roster (suite/tenant × month, with renewal/new-lease colors) so the budget
  // drill-down shows who makes up the budgeted rent.
  const showsRent = budget.rentAccounts.some((a) => accountMatchesMask(mask, a));
  const rentDetail = showsRent ? budget.rentDetail ?? null : null;
  return NextResponse.json({ rows, rentDetail, budgetYear: budget.budgetYear, fallback: budget.fallback });
}

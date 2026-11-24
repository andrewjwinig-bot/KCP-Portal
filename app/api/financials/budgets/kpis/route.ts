import { NextResponse } from "next/server";
import { listBudgets } from "@/lib/financials/budgets/storage";
import { pickBudgetYear, preferredWorkbooks } from "@/lib/financials/budgets/inForce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Lightweight per-property budget metrics for the global search "answer" box
// (e.g. "1100 budgeted NOI"). Returns each property's newest-year budget
// rollups (Total Revenues, NOI, Cash Flow, etc.) — names + annual totals only.
export async function GET(req: Request) {
  // `?year=` asks for that year's budget (else the latest before it) — the
  // payroll budget's Test a Raise reads the budget year's NOI this way.
  const asked = Number(new URL(req.url).searchParams.get("year"));
  // Each property's budget IN FORCE (this year's; else the latest before it)
  // — not simply the newest, which a published next-year budget would be.
  const workbooks = preferredWorkbooks(await listBudgets());
  const yearsOf = new Map<string, number[]>();
  for (const wb of workbooks) for (const p of wb.properties) yearsOf.set(p.propertyCode, [...(yearsOf.get(p.propertyCode) ?? []), wb.year]);
  const byProp = new Map<string, { code: string; name: string; year: number; rollups: { name: string; total: number }[] }>();
  for (const wb of workbooks) {
    for (const p of wb.properties) {
      if (wb.year !== pickBudgetYear(yearsOf.get(p.propertyCode) ?? [], Number.isFinite(asked) && asked > 1900 ? asked : undefined)) continue;
      if (p.propertyCode === "CONSOLIDATED" || byProp.has(p.propertyCode)) continue;
      byProp.set(p.propertyCode, {
        code: p.propertyCode,
        name: p.propertyName,
        year: wb.year,
        rollups: p.rollups.map((r) => ({ name: r.name, total: r.total })),
      });
    }
  }
  return NextResponse.json({ properties: [...byProp.values()] });
}

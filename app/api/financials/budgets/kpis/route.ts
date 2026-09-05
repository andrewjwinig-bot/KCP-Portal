import { NextResponse } from "next/server";
import { listBudgets } from "@/lib/financials/budgets/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Lightweight per-property budget metrics for the global search "answer" box
// (e.g. "1100 budgeted NOI"). Returns each property's newest-year budget
// rollups (Total Revenues, NOI, Cash Flow, etc.) — names + annual totals only.
export async function GET() {
  const workbooks = await listBudgets(); // newest year first
  const byProp = new Map<string, { code: string; name: string; year: number; rollups: { name: string; total: number }[] }>();
  for (const wb of workbooks) {
    for (const p of wb.properties) {
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

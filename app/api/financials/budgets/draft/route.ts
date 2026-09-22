import { NextResponse } from "next/server";
import { buildBudgetDraft } from "@/lib/financials/budgets/draft";
import { availableStatements } from "@/lib/financials/operating-statements/mappingStore";
import { budgetUser } from "@/lib/financials/budgets/currentUser";
import { canEditLines } from "@/lib/financials/budgets/contributors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/financials/budgets/draft
//   (no key)                 → the list of buildings/funds a draft can be built for
//   ?key=<key>&year=&growth= → the auto-seeded draft for that property/fund
export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  const now = new Date();

  if (!key) {
    const list = await availableStatements();
    return NextResponse.json({ properties: list });
  }

  const year = Number(url.searchParams.get("year")) || now.getFullYear() + 1;
  const growth = Number(url.searchParams.get("growth"));
  const growthPct = Number.isFinite(growth) ? growth : 3;

  const draft = await buildBudgetDraft(key, year, growthPct);
  if (!draft) {
    return NextResponse.json({ missingBasis: true, key, year, basisYear: year - 1, growthPct }, { status: 200 });
  }
  // Whether this viewer may type months into the grid — the save route checks
  // it again; this only decides whether the cells open for typing.
  return NextResponse.json({ ...draft, canEditLines: canEditLines(await budgetUser()) });
}

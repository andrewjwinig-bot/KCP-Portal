import { NextResponse } from "next/server";
import { budgetOpexSummary } from "@/lib/financials/budgets/opexSummary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    return NextResponse.json(await budgetOpexSummary());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load budget summary" },
      { status: 500 },
    );
  }
}

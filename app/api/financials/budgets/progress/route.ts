import { NextResponse } from "next/server";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import { getInPlaceRevenue } from "@/lib/financials/budgets/inPlaceStore";
import { getFilled, setFilled } from "@/lib/financials/budgets/contributionStore";
import { deriveContributions, type BudgetProperty, type FilledMap } from "@/lib/financials/budgets/deriveContributions";
import { getExpenseInputs } from "@/lib/financials/budgets/expenseInputStore";
import { EXPENSE_INPUT_KINDS } from "@/lib/financials/budgets/expenseInputs";
import { contributionId } from "@/lib/financials/budgets/contributors";

/** Expense figures already keyed — each one completes its contribution. */
async function enteredFor(year: number, props: BudgetProperty[]): Promise<FilledMap> {
  const out: FilledMap = {};
  await Promise.all(props.map(async (p) => {
    const doc = await getExpenseInputs(year, p.code).catch(() => ({}));
    for (const k of EXPENSE_INPUT_KINDS) {
      const v = (doc as Record<string, { at?: string; by?: string } | undefined>)[k];
      if (v) out[contributionId(year, k, p.code)] = { filledAt: v.at ?? new Date(0).toISOString(), filledBy: v.by ?? "Unknown" };
    }
  }));
  return out;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function groupProperties(category: string): BudgetProperty[] {
  const group = /shopping/i.test(category) ? "SC" : /office/i.test(category) ? "BP" : null;
  if (!group) return [];
  return PROPERTY_DEFS
    .filter((p) => p.allocGroup === group)
    .map((p) => ({ code: p.id, name: p.name, allocGroup: p.allocGroup }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

// GET ?year=&category= — every outstanding part of this budget, derived.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const year = Number(url.searchParams.get("year"));
  const category = url.searchParams.get("category") ?? "Shopping Centers";
  if (!year) return NextResponse.json({ error: "year required" }, { status: 400 });

  const props = groupProperties(category);
  const [inPlace, filled, entered] = await Promise.all([
    getInPlaceRevenue(year, category).catch(() => null),
    getFilled(year, category).catch(() => ({})),
    enteredFor(year, props),
  ]);
  return NextResponse.json({
    contributions: deriveContributions(year, props, inPlace, filled, entered),
    hasSchedule: !!inPlace,
  });
}

// POST { year, category, id, filledBy, done } — tick or untick one part.
export async function POST(req: Request) {
  try {
    const b = await req.json();
    const year = Number(b?.year);
    const category = String(b?.category ?? "Shopping Centers");
    const id = String(b?.id ?? "").trim();
    if (!year || !id) return NextResponse.json({ error: "year and id required" }, { status: 400 });
    const filled = await setFilled(year, category, id, String(b?.filledBy ?? "Unknown"), b?.done !== false);
    const inPlace = await getInPlaceRevenue(year, category).catch(() => null);
    const props = groupProperties(category);
    return NextResponse.json({
      ok: true,
      contributions: deriveContributions(year, props, inPlace, filled, await enteredFor(year, props)),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

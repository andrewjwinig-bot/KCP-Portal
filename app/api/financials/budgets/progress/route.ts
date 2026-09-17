import { NextResponse } from "next/server";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import { getInPlaceRevenue } from "@/lib/financials/budgets/inPlaceStore";
import { getFilled, setFilled } from "@/lib/financials/budgets/contributionStore";
import { deriveContributions, type BudgetProperty } from "@/lib/financials/budgets/deriveContributions";

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

  const [inPlace, filled] = await Promise.all([
    getInPlaceRevenue(year, category).catch(() => null),
    getFilled(year, category).catch(() => ({})),
  ]);
  return NextResponse.json({
    contributions: deriveContributions(year, groupProperties(category), inPlace, filled),
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
    return NextResponse.json({
      ok: true,
      contributions: deriveContributions(year, groupProperties(category), inPlace, filled),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

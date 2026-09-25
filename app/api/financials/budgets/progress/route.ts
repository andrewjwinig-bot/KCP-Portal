import { NextResponse } from "next/server";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import { getInPlaceRevenue, type InPlaceRevenueRecord } from "@/lib/financials/budgets/inPlaceStore";
import { getFilled, setFilled } from "@/lib/financials/budgets/contributionStore";
import { deriveContributions, type BudgetProperty, type FilledMap } from "@/lib/financials/budgets/deriveContributions";
import { getExpenseInputs } from "@/lib/financials/budgets/expenseInputStore";
import { EXPENSE_INPUT_KINDS } from "@/lib/financials/budgets/expenseInputs";
import { contributionId } from "@/lib/financials/budgets/contributors";
import { getLeasingAssumptions } from "@/lib/financials/budgets/leasingAssumptions";
import { projectLeaseRevenue } from "@/lib/financials/budgets/leaseRevenue";

/** The leasing card's OWN list per property — the same projection the card
 *  renders (off the rent schedule once it is imported, the rent roll before) —
 *  so the rail counts exactly the rows Harry and Nancy are deciding. */
async function rollLeasing(year: number, props: BudgetProperty[], schedule: InPlaceRevenueRecord | null) {
  const out: Record<string, { unitRef: string; tenant?: string; vacant: boolean }[]> = {};
  await Promise.all(props.map(async (p) => {
    const lease = await projectLeaseRevenue([p.code], year, {}, schedule?.charges ?? null).catch(() => null);
    if (!lease?.hasData) return;
    out[p.code] = [
      ...lease.expiring.map((e) => ({ unitRef: e.unitRef, tenant: e.tenant, vacant: false })),
      ...lease.vacant.map((v) => ({ unitRef: v.unitRef, vacant: true })),
    ];
  }));
  return out;
}

/** Expense figures already keyed — each one completes its contribution. */
async function enteredFor(year: number, props: BudgetProperty[]): Promise<FilledMap> {
  const out: FilledMap = {};
  await Promise.all(props.map(async (p) => {
    const doc = await getExpenseInputs(year, p.code).catch(() => ({}));
    for (const k of EXPENSE_INPUT_KINDS) {
      const v = (doc as Record<string, { at?: string; by?: string } | undefined>)[k];
      if (v) out[contributionId(year, k, p.code)] = { filledAt: v.at ?? new Date(0).toISOString(), filledBy: v.by ?? "Unknown" };
    }
    // A leasing decision — hold, renew, vacate, lease up, leave vacant — IS the
    // vacancy / renewal contribution for that suite, stamped by whoever made it.
    const leasing = await getLeasingAssumptions(year, [p.code]).catch(() => ({}));
    for (const a of Object.values(leasing)) {
      const mark = { filledAt: a.updatedAt ?? new Date(0).toISOString(), filledBy: a.updatedBy ?? "Unknown" };
      const refs = new Set([a.unitRef, a.unitRef.toUpperCase().replace(/-CU$/, "")]);
      for (const ref of refs) {
        out[contributionId(year, "vacancy", p.code, ref)] = mark;
        out[contributionId(year, "renewal", p.code, ref)] = mark;
      }
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
  const leasing = await rollLeasing(year, props, inPlace);
  return NextResponse.json({
    contributions: deriveContributions(year, props, null, filled, entered, leasing),
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
      contributions: deriveContributions(year, props, null, filled, await enteredFor(year, props), await rollLeasing(year, props, inPlace)),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

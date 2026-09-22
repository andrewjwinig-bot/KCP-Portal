import { NextResponse } from "next/server";
import { setLeasingAssumption, getLeasingAssumptions, type LeaseAssumptionKind } from "@/lib/financials/budgets/leasingAssumptions";
import { budgetUser as currentUser } from "@/lib/financials/budgets/currentUser";
import { USERS } from "@/lib/users";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import { canEdit } from "@/lib/financials/budgets/contributors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET ?year=&code=  → saved assumptions for a property, keyed by unitRef
export async function GET(req: Request) {
  const url = new URL(req.url);
  const year = Number(url.searchParams.get("year"));
  const code = url.searchParams.get("code");
  if (!year || !code) return NextResponse.json({ error: "year and code required" }, { status: 400 });
  return NextResponse.json({ assumptions: await getLeasingAssumptions(year, [code]) });
}

// POST { year, propertyCode, unitRef, kind, monthlyRent?, startMonth?, termYears?, notes? }
//   kind null → clear the unit's assumption.
export async function POST(req: Request) {
  try {
    const b = await req.json();
    const year = Number(b?.year);
    const propertyCode = String(b?.propertyCode ?? "").trim();
    const unitRef = String(b?.unitRef ?? "").trim();
    if (!year || !propertyCode || !unitRef) {
      return NextResponse.json({ error: "year, propertyCode, unitRef required" }, { status: 400 });
    }
    const kind = (b?.kind ?? null) as LeaseAssumptionKind | null;
    if (kind !== null && !["renew", "vacate", "leaseup", "hold"].includes(kind)) {
      return NextResponse.json({ error: "invalid kind" }, { status: 400 });
    }
    // The leasing call belongs to its owner — Harry for the shopping centres,
    // Nancy for the office parks — or Drew in the review. Checked here, not
    // only on the page, and recorded so the card can say who made it.
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    const def = PROPERTY_DEFS.find((d) => d.id.toUpperCase() === propertyCode.toUpperCase());
    if (!canEdit(user, kind === "leaseup" ? "vacancy" : "renewal", def?.allocGroup)) {
      return NextResponse.json({ error: "These assumptions belong to someone else." }, { status: 403 });
    }
    const startMonth = b?.startMonth != null ? Math.min(12, Math.max(1, Number(b.startMonth))) : undefined;
    const monthlyRent = b?.monthlyRent != null && b.monthlyRent !== "" ? Number(b.monthlyRent) : undefined;
    // A start month is an assumption only for a VACANT space; an existing
    // tenant's dates come from the lease (see leaseRevenue), so it is not kept.
    const keepStart = kind === "leaseup" ? startMonth : undefined;
    const termYears = b?.termYears != null && b.termYears !== "" && Number(b.termYears) > 0 ? Math.min(30, Number(b.termYears)) : undefined;
    await setLeasingAssumption(year, propertyCode, { unitRef, kind, monthlyRent, startMonth: keepStart, termYears, notes: b?.notes, updatedBy: USERS[user]?.label ?? user });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}

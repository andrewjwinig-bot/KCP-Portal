import { NextResponse } from "next/server";
import { setLeasingAssumption, getLeasingAssumptions, type LeaseAssumptionKind } from "@/lib/financials/budgets/leasingAssumptions";

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

// POST { year, propertyCode, unitRef, kind, monthlyRent?, startMonth?, notes? }
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
    if (kind !== null && !["renew", "vacate", "leaseup"].includes(kind)) {
      return NextResponse.json({ error: "invalid kind" }, { status: 400 });
    }
    const startMonth = b?.startMonth != null ? Math.min(12, Math.max(1, Number(b.startMonth))) : undefined;
    const monthlyRent = b?.monthlyRent != null && b.monthlyRent !== "" ? Number(b.monthlyRent) : undefined;
    await setLeasingAssumption(year, propertyCode, { unitRef, kind, monthlyRent, startMonth, notes: b?.notes });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}

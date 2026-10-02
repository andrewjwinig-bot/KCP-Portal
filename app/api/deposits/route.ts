import { NextRequest, NextResponse } from "next/server";
import { listDeposits, saveDeposit } from "@/lib/deposits/storage";
import { sanitizeDeposit } from "@/lib/deposits/deposits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const all = await listDeposits();
    // Optional filters so the move-out close-out can pull just the departing
    // tenant's deposit. Unit ref is exact and takes precedence; if it matches
    // nothing (deposit filed under the company, not the unit), fall back to a
    // tenant-name contains match.
    const unitRef = req.nextUrl.searchParams.get("unitRef")?.trim().toLowerCase();
    const tenant = req.nextUrl.searchParams.get("tenant")?.trim().toLowerCase();
    let deposits = all;
    if (unitRef || tenant) {
      deposits = unitRef ? all.filter((d) => d.unitRef.toLowerCase() === unitRef) : [];
      if (!deposits.length && tenant) deposits = all.filter((d) => d.tenantCompany.toLowerCase().includes(tenant));
    }
    return NextResponse.json({ deposits });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load deposits" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const deposit = sanitizeDeposit(body);
  if (!deposit.unitRef) {
    return NextResponse.json({ error: "A unit is required" }, { status: 400 });
  }
  try {
    await saveDeposit(deposit);
    return NextResponse.json({ deposit }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to save deposit" },
      { status: 500 },
    );
  }
}

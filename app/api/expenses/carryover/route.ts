import { NextRequest, NextResponse } from "next/server";
import { getLedger, saveLedger } from "@/lib/expenses/carryoverStore";
import { finalizeMonth, type MonthProperty } from "@/lib/expenses/carryover";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ledger = await getLedger();
    return NextResponse.json({ ledger });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load carryover ledger" },
      { status: 500 },
    );
  }
}

// Finalize a statement month: update the carryover ledger exactly once. This is
// the ONLY mutation point — downloads stay side-effect-free so re-downloading a
// month never double-counts.
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const statementMonth = String(body?.statementMonth ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(statementMonth)) {
    return NextResponse.json({ error: "A valid statement month (YYYY-MM) is required" }, { status: 400 });
  }
  const properties = Array.isArray(body?.properties) ? (body.properties as MonthProperty[]) : [];

  try {
    const ledger = await getLedger();
    if (ledger.committedPeriods.includes(statementMonth)) {
      return NextResponse.json(
        { error: `Statement month ${statementMonth} has already been finalized.`, ledger },
        { status: 409 },
      );
    }
    const { ledger: next, decisions } = finalizeMonth(
      ledger,
      statementMonth,
      properties,
      new Date().toISOString(),
    );
    await saveLedger(next);
    return NextResponse.json({ ledger: next, decisions });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to finalize month" },
      { status: 500 },
    );
  }
}

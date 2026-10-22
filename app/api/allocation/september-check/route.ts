import { NextResponse } from "next/server";
import { septemberCheck } from "@/lib/allocated-invoicer/septemberCheck";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

// GET — what September 2026's invoices billed: September's own charges vs
// balances carried in, and how much of the carry came from 2025. Read-only.
export async function GET() {
  try {
    return NextResponse.json(await septemberCheck());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Check failed" }, { status: 500 });
  }
}

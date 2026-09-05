import { NextResponse } from "next/server";
import { listAvidSends } from "@/lib/invoicing/avidSendLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET [?limit=] — the AP outbox: recent batches released to AvidXchange across
// all three flows (Allocated, Credit Card, Payroll), newest first.
export async function GET(req: Request) {
  const limit = Number(new URL(req.url).searchParams.get("limit")) || 40;
  return NextResponse.json({ sends: await listAvidSends(limit) });
}

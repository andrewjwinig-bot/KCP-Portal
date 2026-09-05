import { NextResponse } from "next/server";
import { listAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET — recent audit events. Admin-gated by middleware (ADMIN_PATH_PREFIXES).
export async function GET() {
  return NextResponse.json({ events: await listAudit(1000) });
}

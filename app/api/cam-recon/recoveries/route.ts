// GET /api/cam-recon/recoveries?key=&year= — what each recoverable expense
// line recovered from tenants, by building and by tenant, for a building, a
// fund, a centre or a book (lib/cam/recoveryLoad.ts). Answers to the CAM
// recon AND Operating Statements, whose Full Year view shows it.

import { NextRequest, NextResponse } from "next/server";
import { loadRecoveries, recoveryYears, RECOVERY_SCOPES } from "@/lib/cam/recoveryLoad";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key") ?? "";
  const years = recoveryYears(key);
  const asked = Number(req.nextUrl.searchParams.get("year"));
  if (!years.length) return NextResponse.json({ key, years, year: null, asked: asked || null, group: null, scopes: RECOVERY_SCOPES });
  // A year not reconciled yet (the current year) shows the latest that is.
  const year = years.includes(asked) ? asked : years[0];
  const group = await loadRecoveries(key, year);
  return NextResponse.json({ key, years, year, asked: asked || null, group, scopes: RECOVERY_SCOPES });
}

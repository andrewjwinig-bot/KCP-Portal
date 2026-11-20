import { NextResponse } from "next/server";
import { listJSON } from "@/lib/storage";
import { snapshotMonthKey } from "@/lib/rentroll/snapshot";
import { confirmedMoveouts, sameTenant } from "@/lib/leasing/confirmedMoveouts";
import type { RentRollData } from "@/lib/rentroll/parseRentRollExcel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET — tenants CONFIRMED gone in the last ~60 days (`confirmedMoveouts`: on an
// earlier roll of their property, absent from the newest roll covering it),
// each with the suite row as the last roll that showed them carried it. The
// dashboard's "recently vacated" rows read this rather than diffing two rolls
// themselves — that diff called a renamed tenant or one who moved suites gone.
export async function GET() {
  const history = ((await listJSON("rentroll-history").catch(() => [])) as RentRollData[]) ?? [];
  const rows = confirmedMoveouts(history, new Date(), 60).map((v) => {
    const snap = history.find((h) => snapshotMonthKey(h) === v.lastSeen
      && (h.properties ?? []).some((p) => p.propertyCode.toUpperCase() === v.propertyCode));
    const unit = snap?.properties.find((p) => p.propertyCode.toUpperCase() === v.propertyCode)
      ?.units.find((u) => u.unitRef === v.unitRef && sameTenant(u.occupantName, v.occupantName)) ?? null;
    return { propertyCode: v.propertyCode, unitRef: v.unitRef, occupantName: v.occupantName, sqft: v.sqft, leaseTo: v.leaseTo, goneAsOf: v.goneAsOf, unit };
  });
  return NextResponse.json({ vacated: rows });
}

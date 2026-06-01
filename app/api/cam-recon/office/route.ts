import { NextRequest, NextResponse } from "next/server";
import { reconcileBuilding } from "@/lib/cam/office/compute";
import { nextYearEstimate } from "@/lib/cam/office/exports";
import { OFFICE_RECON_FIXTURES, availableOfficeRecons } from "@/lib/cam/office/registry";

export const runtime = "nodejs";

/** GET /api/cam-recon/office
 *    → { available: [{ propertyCode, name, years }] }
 *  GET /api/cam-recon/office?property=4070&year=2025
 *    → { result: BuildingReconResult, estimates: NextYearEstimate[] }
 *
 *  The reconciliation is computed server-side from the office recon
 *  fixtures (the 4070 workbook seed today; live Expenses & Occ + December
 *  rent roll feeds to follow). Pure compute, no persistence yet. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const property = searchParams.get("property");
  const year = Number(searchParams.get("year"));

  if (!property) {
    return NextResponse.json({ available: availableOfficeRecons() });
  }

  const fixture = OFFICE_RECON_FIXTURES[property];
  if (!fixture) {
    return NextResponse.json({ error: `No office recon for property ${property}` }, { status: 404 });
  }
  const tenants = fixture.tenantsByYear[year];
  if (!tenants) {
    return NextResponse.json({ error: `No ${year} recon for ${property}` }, { status: 404 });
  }

  const result = reconcileBuilding(fixture.pool, tenants, year);
  const estimates = result.tenants.map(nextYearEstimate);
  return NextResponse.json({ result, estimates });
}

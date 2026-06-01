import { NextRequest, NextResponse } from "next/server";
import { reconcileBuilding } from "@/lib/cam/office/compute";
import { nextYearEstimate } from "@/lib/cam/office/exports";
import { assembleTenantInputs, type OfficeLeaseConfig, type ResetInfo } from "@/lib/cam/office/assemble";
import { OFFICE_RECON_FIXTURES, availableOfficeRecons } from "@/lib/cam/office/registry";
import { getOverrides, mergeConfig, saveOverride } from "@/lib/cam/office/configStore";
import { getJSON } from "@/lib/storage";

/** Stored base-year resets keyed by unit ref. */
async function loadResets(): Promise<Record<string, ResetInfo>> {
  const s = (await getJSON("base-year-resets", "all")) as
    | { resets?: Record<string, { resetDate: string; originalBaseYear: number | null; newBaseYear: number }> }
    | null;
  return s?.resets ?? {};
}

export const runtime = "nodejs";

/** GET /api/cam-recon/office
 *    → { available: [{ propertyCode, name, years }] }
 *  GET /api/cam-recon/office?property=4070&year=2025
 *    → { result: BuildingReconResult, estimates: NextYearEstimate[] }
 *
 *  Assembles tenant inputs from the rent-roll roster + the lease config
 *  (seed merged with stored per-unit edits), reconciles server-side. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const property = searchParams.get("property");
  const year = Number(searchParams.get("year"));

  if (!property) {
    return NextResponse.json({ available: availableOfficeRecons() });
  }

  const fixture = OFFICE_RECON_FIXTURES[property];
  const reconYear = fixture?.byYear[year];
  if (!fixture || !reconYear) {
    return NextResponse.json({ error: `No ${year} recon for ${property}` }, { status: 404 });
  }

  const overrides = await getOverrides(property, year);
  const config = mergeConfig(reconYear.leaseConfig, overrides);
  const resets = await loadResets();
  const tenants = assembleTenantInputs(reconYear.roster, year, config, resets);

  const result = reconcileBuilding(fixture.pool, tenants, year);
  const estimates = result.tenants.map(nextYearEstimate);
  return NextResponse.json({ result, estimates });
}

const EDITABLE_FIELDS = new Set<keyof OfficeLeaseConfig>([
  "baseYear", "grossUp", "proRataPct", "opexEscrow", "retEscrow",
]);

/** POST /api/cam-recon/office
 *  Body: { property, year, unitRef, field, value }
 *  Saves a single per-unit lease-config override. value null clears it
 *  (revert to the seed / computed default). */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const property = String(body?.property ?? "");
    const year = Number(body?.year);
    const unitRef = String(body?.unitRef ?? "");
    const field = String(body?.field ?? "") as keyof OfficeLeaseConfig;

    if (!OFFICE_RECON_FIXTURES[property]?.byYear[year]) {
      return NextResponse.json({ error: "Unknown property/year" }, { status: 400 });
    }
    if (!unitRef || !EDITABLE_FIELDS.has(field)) {
      return NextResponse.json({ error: "Invalid field" }, { status: 400 });
    }

    // Coerce per field type; null clears the override.
    let value: number | boolean | null;
    if (body?.value === null || body?.value === "") {
      value = null;
    } else if (field === "grossUp") {
      value = body.value === true || body.value === "true";
    } else {
      const n = Number(body.value);
      if (!Number.isFinite(n)) {
        return NextResponse.json({ error: "Invalid value" }, { status: 400 });
      }
      value = field === "baseYear" ? Math.round(n) : n;
    }

    await saveOverride(property, year, unitRef, { [field]: value });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}

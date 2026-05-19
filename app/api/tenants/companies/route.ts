import { NextRequest, NextResponse } from "next/server";
import { companiesForProperty } from "@/lib/tenants/companies";

// Public — used by the tenant submission form to populate the Company
// dropdown once a building is selected.
//
// Returns the distinct list of occupants currently on the rent roll for a
// given property, plus the unit assignments so the form can also offer
// suite-number autofill once a company is chosen.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export type { CompanyMatch } from "@/lib/tenants/companies";

export async function GET(req: NextRequest) {
  const code = (req.nextUrl.searchParams.get("propertyCode") ?? "").trim();
  if (!code) {
    return NextResponse.json({ error: "propertyCode required" }, { status: 400 });
  }
  const companies = await companiesForProperty(code);
  return NextResponse.json({ companies });
}

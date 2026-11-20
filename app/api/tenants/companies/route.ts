import { NextRequest, NextResponse } from "next/server";
import { companiesForProperty } from "@/lib/tenants/companies";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

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
  // Public + returns live occupant names, so throttle to blunt scraping of the
  // tenant directory. Generous vs. real form use (a user picks 1–3 properties).
  if (!checkRateLimit(`tenants-companies:${getClientIp(req)}`, 60)) {
    return NextResponse.json({ error: "Too many requests. Please slow down." }, { status: 429 });
  }
  const code = (req.nextUrl.searchParams.get("propertyCode") ?? "").trim();
  if (!code) {
    return NextResponse.json({ error: "propertyCode required" }, { status: 400 });
  }
  const companies = await companiesForProperty(code);
  return NextResponse.json({ companies });
}

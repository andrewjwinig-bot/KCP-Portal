import { NextRequest, NextResponse } from "next/server";
import { listPastTenancies, getPastTenancy } from "@/lib/tenants/pastTenants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET                       → { tenancies: PastTenancy[] }  (the archive list)
// GET ?unitRef=&name=       → { detail: PastTenancyDetail } (one tenant's profile)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const unitRef = searchParams.get("unitRef");
  const name = searchParams.get("name");

  if (unitRef && name) {
    const detail = await getPastTenancy(unitRef, name);
    if (!detail) return NextResponse.json({ error: "No past tenancy found for that unit + tenant." }, { status: 404 });
    return NextResponse.json({ detail });
  }
  return NextResponse.json({ tenancies: await listPastTenancies() });
}

import { NextResponse } from "next/server";
import { currentLeaseMovement } from "@/lib/reports/monthly";
import { PROPERTY_DEFS } from "@/lib/properties/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET ?scope=office|retail|all — the Vacating & Expiring list for the leasing
// dashboards (owner: "important for Nancy to see the office tenants on her
// dashboard and harry to see all tenants"). Tenants, suites, SF and lease
// dates only — what the rent roll already shows them; no financials.
export async function GET(req: Request) {
  const scope = new URL(req.url).searchParams.get("scope") ?? "all";
  const typeOf = (code: string) => PROPERTY_DEFS.find((p) => p.id.toUpperCase() === code.toUpperCase())?.type;
  const keep = (code: string) =>
    scope === "office" ? typeOf(code) === "Office" : scope === "retail" ? typeOf(code) === "Retail" : true;
  try {
    const m = await currentLeaseMovement(new Date());
    return NextResponse.json({
      ...m,
      vacated: m.vacated.filter((v) => keep(v.propertyCode)),
      expirations: m.expirations.filter((e) => keep(e.propertyCode)),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't read the rent roll" }, { status: 500 });
  }
}

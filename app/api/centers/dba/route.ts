import { NextResponse } from "next/server";
import { CENTER_PROFILES } from "@/lib/centers/registry";
import { getCenterOverride } from "@/lib/centers/store";

// Returns the public display-name (DBA) OVERRIDES for every shopping center,
// keyed by property code → normName(tenant) → DBA. Only explicit overrides are
// included (registry defaults are not), so the rent roll only relabels tenants
// that have been deliberately given a public name. Site-auth (middleware) gates
// /api/*, so this stays internal.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const out: Record<string, Record<string, string>> = {};
    await Promise.all(
      CENTER_PROFILES.map(async (p) => {
        const ov = await getCenterOverride(p.code);
        if (ov.dba && Object.keys(ov.dba).length) out[p.code.toUpperCase()] = ov.dba;
      }),
    );
    return NextResponse.json({ dbaByCode: out });
  } catch {
    return NextResponse.json({ dbaByCode: {} });
  }
}

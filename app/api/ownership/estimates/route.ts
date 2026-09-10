import { NextRequest, NextResponse } from "next/server";
import { getEstimates, saveEstimates } from "@/lib/properties/estimateStore";
import { entityValue } from "@/lib/properties/entityValues";

// Current "today" estimated equity values for the Statement of Values. One
// estimate per entity + a shared as-of date. Admin-only surface (behind the
// app shell), no rate limit needed beyond the middleware auth.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await getEstimates());
}

export async function PUT(req: NextRequest) {
  let body: { asOf?: string; values?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  // Accept only known entities with finite numeric estimates.
  const values: Record<string, number> = {};
  for (const [k, v] of Object.entries(body.values ?? {})) {
    if (!entityValue(k)) continue;
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n)) values[k] = n;
  }
  const asOf = typeof body.asOf === "string" ? body.asOf.slice(0, 10) : "";
  const saved = await saveEstimates({ asOf, values });
  return NextResponse.json(saved);
}

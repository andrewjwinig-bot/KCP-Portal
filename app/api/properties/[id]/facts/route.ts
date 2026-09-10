import { NextRequest, NextResponse } from "next/server";
import { getFacts, saveFacts, PROPERTY_FACT_KEYS, type PropertyFacts } from "@/lib/properties/facts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const f = await getFacts(params.id);
    return NextResponse.json({ facts: f ?? {} });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to load" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const patch: Partial<PropertyFacts> = {};
    for (const k of PROPERTY_FACT_KEYS) {
      if (!(k in body)) continue;
      const v = body[k];
      if (k === "yearBuilt") {
        // Allow null to clear, empty string treated as null, otherwise number.
        if (v === null || v === "") patch.yearBuilt = null;
        else {
          const n = typeof v === "number" ? v : Number(v);
          if (Number.isFinite(n)) patch.yearBuilt = n;
        }
      } else {
        // Trim and coerce to string. Empty string clears the field.
        const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v);
        patch[k] = s;
      }
    }
    const f = await saveFacts(params.id, patch);
    return NextResponse.json({ facts: f });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to save" }, { status: 500 });
  }
}

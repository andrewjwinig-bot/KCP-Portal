import { NextRequest, NextResponse } from "next/server";
import { createMapStore } from "@/lib/collectionStore";

/** A tenant whose Snow Removal expense is excluded from their base year. From
 *  the effective month/year onward the snow line's base cost is treated as $0,
 *  so the tenant recovers its full pro-rata share of current-year snow (the
 *  effective year prorates by month). Every other base-year line is unchanged. */
export type SnowBaseExclusion = {
  unitRef: string;
  propertyCode: string | null;
  occupantName: string;
  /** The tenant's base year at the time this was set — display only. */
  baseYear: number | null;
  effectiveMonth: number; // 1–12
  effectiveYear: number;  // e.g. 2026 → applies to 2026 CAM recon and beyond
  notes?: string;
  updatedAt: string;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One blob per unitRef, same shape as base-year-resets-v2.
const store = createMapStore<SnowBaseExclusion>({ prefix: "snow-base-exclusions" });

export async function GET() {
  try {
    return NextResponse.json({ exclusions: await store.all() });
  } catch {
    return NextResponse.json({ exclusions: {} });
  }
}

/** POST upserts one exclusion, or with { unitRef, clear: true } removes it. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const unitRef = String(body?.unitRef ?? "").trim();
    if (!unitRef) return NextResponse.json({ error: "Missing unitRef" }, { status: 400 });

    if (body?.clear === true) {
      await store.remove(unitRef);
      return NextResponse.json({ ok: true, exclusions: await store.all() });
    }

    const effectiveMonth = Number(body?.effectiveMonth);
    if (!Number.isInteger(effectiveMonth) || effectiveMonth < 1 || effectiveMonth > 12) {
      return NextResponse.json({ error: "Invalid effectiveMonth (1–12)" }, { status: 400 });
    }
    const effectiveYear = Number(body?.effectiveYear);
    if (!Number.isFinite(effectiveYear) || effectiveYear < 1900 || effectiveYear > 2100) {
      return NextResponse.json({ error: "Invalid effectiveYear" }, { status: 400 });
    }
    const byRaw = body?.baseYear;
    const baseYear: number | null = byRaw == null || byRaw === "" ? null : Number(byRaw);

    const next: SnowBaseExclusion = {
      unitRef,
      propertyCode: body?.propertyCode != null ? String(body.propertyCode) : null,
      occupantName: String(body?.occupantName ?? ""),
      baseYear: Number.isFinite(baseYear as number) ? (baseYear as number) : null,
      effectiveMonth,
      effectiveYear,
      notes: typeof body?.notes === "string" ? body.notes.trim() : undefined,
      updatedAt: new Date().toISOString(),
    };
    await store.set(unitRef, next);
    return NextResponse.json({ ok: true, exclusions: await store.all() });
  } catch (err: any) {
    console.error("[POST /api/snow-base-exclusions]", err?.message ?? err);
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}

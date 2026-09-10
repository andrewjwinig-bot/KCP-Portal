import { NextRequest, NextResponse } from "next/server";
import { QUARTERLY_BILLINGS, QUARTERS, computeQuarterly, autoQuarterlyFromGl, mergeQuarterly, QUARTERLY_OVERRIDE_SEED, type Quarter } from "@/lib/cam/retail/quarterly";
import { getQuarterly, saveQuarterlyCell, type QuarterlyField } from "@/lib/cam/retail/quarterlyStore";
import { assembledGl } from "@/lib/financials/operating-statements/statementStore";

export const runtime = "nodejs";

/** GET /api/cam-recon/quarterly?key=9510-WAWA-Q&year=2025
 *    → { def, data, auto, effective, computed, gl }
 *  Quarterly CAM/RET billing for a quarter-billed tenant (e.g. Wawa @ 9510).
 *  Eligible expenses auto-populate from the parent property's GL (the "Working
 *  Trial Balance"); a manually-entered cell overrides the GL value. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key") ?? "";
  const year = Number(searchParams.get("year"));
  const def = QUARTERLY_BILLINGS[key];
  if (!def || !def.years.includes(year)) {
    return NextResponse.json({ error: `No quarterly billing for ${key} ${year}` }, { status: 404 });
  }
  const manual = await getQuarterly(key, year);
  const gl = await assembledGl(def.parentProperty, year);
  const maxPosted = gl?.maxPeriodInFile ?? 0;
  const glAuto = gl ? autoQuarterlyFromGl(def, gl.monthly, maxPosted) : { camCosts: {}, retCosts: {}, billed: {} };
  // GL raw < finalized override seed (backed-out items) < staff manual edit.
  const seed = QUARTERLY_OVERRIDE_SEED[`${key}-${year}`] ?? { camCosts: {}, retCosts: {}, billed: {} };
  const auto = mergeQuarterly(glAuto, seed);
  const effective = mergeQuarterly(auto, manual);
  const computed = computeQuarterly(def, effective);
  return NextResponse.json({
    def, data: manual, auto, effective, computed,
    gl: { hasGl: !!gl, maxPosted, uploadedAt: gl?.uploadedAt ?? null },
  });
}

const FIELDS = new Set<QuarterlyField>(["camCost", "retCost", "billed"]);

/** POST /api/cam-recon/quarterly
 *  Body: { key, year, field, label?, quarter, value }  — saves one cell;
 *  value null clears it. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const key = String(body?.key ?? "");
    const year = Number(body?.year);
    const field = String(body?.field ?? "") as QuarterlyField;
    const quarter = String(body?.quarter ?? "") as Quarter;
    const label = String(body?.label ?? "");

    const def = QUARTERLY_BILLINGS[key];
    if (!def || !def.years.includes(year)) {
      return NextResponse.json({ error: "Unknown billing/year" }, { status: 400 });
    }
    if (!FIELDS.has(field) || !QUARTERS.includes(quarter)) {
      return NextResponse.json({ error: "Invalid field/quarter" }, { status: 400 });
    }
    if (field === "camCost" && !def.camLines.includes(label)) {
      return NextResponse.json({ error: "Unknown CAM line" }, { status: 400 });
    }

    let value: number | null;
    if (body?.value === null || body?.value === "") value = null;
    else {
      const n = Number(body.value);
      if (!Number.isFinite(n)) return NextResponse.json({ error: "Invalid value" }, { status: 400 });
      value = Math.round(n * 100) / 100;
    }
    await saveQuarterlyCell(key, year, field, label, quarter, value);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}

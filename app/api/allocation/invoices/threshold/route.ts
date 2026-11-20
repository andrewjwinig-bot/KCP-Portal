import { NextResponse } from "next/server";
import { loadThresholdWhatIf } from "@/lib/allocated-invoicer/autoProcess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// GET ?t=100,250,500 — the hold threshold as a what-if: this year's imported
// 2000 G&A GL replayed from January at each threshold, the invoices each month
// would send. Read-only. Under /api/allocation/invoices, so gated to the
// Allocated Invoicer like the rest of that path.
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("t") || "100,250,500";
  const thresholds = [...new Set(raw.split(",").map(Number).filter((n) => Number.isFinite(n) && n >= 0 && n <= 5000))].sort((a, b) => a - b).slice(0, 5);
  if (!thresholds.length) return NextResponse.json({ error: "Give one or more thresholds." }, { status: 400 });
  try {
    const r = await loadThresholdWhatIf(thresholds);
    if ("error" in r) return NextResponse.json(r, { status: 404 });
    return NextResponse.json(r);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "What-if failed" }, { status: 500 });
  }
}

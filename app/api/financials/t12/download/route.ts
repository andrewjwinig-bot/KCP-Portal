import { NextResponse } from "next/server";
import { loadT12 } from "@/lib/financials/t12/load";
import { buildT12Xlsx } from "@/lib/financials/reprojections/reprojExport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/financials/t12/download?key&end=YYYY-MM → the T-12 as .xlsx, on the
// Reprojections sheet (same ladder, live-formula totals).
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    const mm = /^(\d{4})-(\d{1,2})$/.exec(url.searchParams.get("end") ?? "");
    if (!key || !mm) return NextResponse.json({ error: "key and end=YYYY-MM are required" }, { status: 400 });
    const t = await loadT12(key, Number(mm[1]), Number(mm[2]));
    if (!t) return NextResponse.json({ error: "No mapping for that property" }, { status: 404 });
    const buf = await buildT12Xlsx(t.reprojection, {
      propertyCode: t.propertyCode, propertyName: t.propertyName, year: t.end.year, budgetYear: null,
      t12: { labels: t.labels, span: t.span },
    });
    const endLabel = t.labels[11].replace(" ", "-");
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="T-12 ${endLabel} - ${t.propertyCode} ${t.propertyName}.xlsx"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to generate Excel" }, { status: 500 });
  }
}

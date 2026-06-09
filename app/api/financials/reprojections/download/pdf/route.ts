import { NextResponse } from "next/server";
import { loadReprojection } from "@/lib/financials/reprojections/load";
import { buildReprojPdf } from "@/lib/financials/reprojections/reprojExport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/financials/reprojections/download/pdf?key&year → presentation PDF.
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    const year = Number(url.searchParams.get("year"));
    if (!key || !year) return NextResponse.json({ error: "key and year are required" }, { status: 400 });
    const loaded = await loadReprojection(key, year);
    if (!loaded) return NextResponse.json({ error: "No mapping for that property" }, { status: 404 });
    const buf = await buildReprojPdf(loaded.reprojection, loaded.meta);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${year} Reprojection - ${loaded.meta.propertyCode} ${loaded.meta.propertyName}.pdf"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to generate PDF" }, { status: 500 });
  }
}

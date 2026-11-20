import { NextResponse } from "next/server";
import { loadStatement } from "@/lib/financials/operating-statements/loadStatement";
import { buildStatementPdf, buildFullYearPdf } from "@/lib/financials/operating-statements/statementExport";
import { loadFullYearStatement } from "@/lib/financials/operating-statements/fullYear";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/financials/operating-statements/download/pdf?key&year[&period][&fullYear=1]
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    const year = Number(url.searchParams.get("year"));
    if (!key || !year) return NextResponse.json({ error: "key and year are required" }, { status: 400 });

    // Full-Year: landscape 12-month grid + Full-Year total, matching the screen.
    if (url.searchParams.get("fullYear") === "1") {
      const fy = await loadFullYearStatement(key, year);
      if (!fy) return NextResponse.json({ error: "No statement for that property/year" }, { status: 404 });
      const buf = await buildFullYearPdf(fy.payload, { propertyCode: fy.meta.propertyCode, propertyName: fy.meta.propertyName, year, label: fy.meta.label }, fy.notes);
      return new NextResponse(new Uint8Array(buf), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${year} Operating Statement (${fy.meta.label}) - ${fy.meta.propertyCode} ${fy.meta.propertyName}.pdf"`,
        },
      });
    }

    const period = Number(url.searchParams.get("period")) || undefined;
    const loaded = await loadStatement(key, year, period);
    if (!loaded) return NextResponse.json({ error: "No statement for that property/year" }, { status: 404 });
    const buf = await buildStatementPdf(loaded.statement, loaded.meta, loaded.notes);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${year} Operating Statement - ${loaded.meta.propertyCode} ${loaded.meta.propertyName}.pdf"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to generate PDF" }, { status: 500 });
  }
}

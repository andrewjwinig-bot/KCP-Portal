import { NextResponse } from "next/server";
import { loadStatement } from "@/lib/financials/operating-statements/loadStatement";
import { buildStatementXlsx, buildFullYearXlsx } from "@/lib/financials/operating-statements/statementExport";
import { loadFullYearStatement } from "@/lib/financials/operating-statements/fullYear";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// GET /api/financials/operating-statements/download?key&year[&period][&fullYear=1] → .xlsx
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    const year = Number(url.searchParams.get("year"));
    if (!key || !year) return NextResponse.json({ error: "key and year are required" }, { status: 400 });

    // Full-Year: the 12-month grid + a formula-driven Full-Year total, matching
    // the on-screen "Full Year" view (not just December).
    if (url.searchParams.get("fullYear") === "1") {
      const fy = await loadFullYearStatement(key, year);
      if (!fy) return NextResponse.json({ error: "No statement for that property/year" }, { status: 404 });
      const buf = await buildFullYearXlsx(fy.payload, { propertyCode: fy.meta.propertyCode, propertyName: fy.meta.propertyName, year, label: fy.meta.label }, fy.notes);
      return new NextResponse(new Uint8Array(buf), {
        status: 200,
        headers: {
          "Content-Type": XLSX,
          "Content-Disposition": `attachment; filename="${year} Operating Statement (${fy.meta.label}) - ${fy.meta.propertyCode} ${fy.meta.propertyName}.xlsx"`,
        },
      });
    }

    const period = Number(url.searchParams.get("period")) || undefined;
    const loaded = await loadStatement(key, year, period);
    if (!loaded) return NextResponse.json({ error: "No statement for that property/year" }, { status: 404 });
    const buf = await buildStatementXlsx(loaded.statement, loaded.meta, loaded.notes);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": XLSX,
        "Content-Disposition": `attachment; filename="${year} Operating Statement - ${loaded.meta.propertyCode} ${loaded.meta.propertyName}.xlsx"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to generate Excel" }, { status: 500 });
  }
}

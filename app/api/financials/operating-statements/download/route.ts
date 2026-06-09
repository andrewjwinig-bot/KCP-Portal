import { NextResponse } from "next/server";
import { loadStatement } from "@/lib/financials/operating-statements/loadStatement";
import { buildStatementXlsx } from "@/lib/financials/operating-statements/statementExport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/financials/operating-statements/download?key&year[&period] → .xlsx
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    const year = Number(url.searchParams.get("year"));
    const period = Number(url.searchParams.get("period")) || undefined;
    if (!key || !year) return NextResponse.json({ error: "key and year are required" }, { status: 400 });
    const loaded = await loadStatement(key, year, period);
    if (!loaded) return NextResponse.json({ error: "No statement for that property/year" }, { status: 404 });
    const buf = await buildStatementXlsx(loaded.statement, loaded.meta, loaded.notes);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${year} Operating Statement - ${loaded.meta.propertyCode} ${loaded.meta.propertyName}.xlsx"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to generate Excel" }, { status: 500 });
  }
}

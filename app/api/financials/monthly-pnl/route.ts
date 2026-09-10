import { NextRequest, NextResponse } from "next/server";
import { parseMonthlyPnlWorkbook, inferFromFilename } from "@/lib/financials/monthly-pnl/parse";
import { savePnlStatement, listPnlStatements, deletePnlStatement } from "@/lib/financials/monthly-pnl/store";
import type { PnlKind } from "@/lib/financials/monthly-pnl/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const statements = await listPnlStatements();
    return NextResponse.json({ statements });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to load statements" }, { status: 500 });
  }
}

// Import an "Actual by Month" / "Budget by Month" workbook: parse every building
// sheet and store one statement per (property, year, kind).
export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const fileBase64 = typeof body?.fileBase64 === "string" ? body.fileBase64 : "";
  const fileName = typeof body?.fileName === "string" ? body.fileName : "";
  const uploadedBy = typeof body?.uploadedBy === "string" && body.uploadedBy.trim() ? body.uploadedBy.trim() : null;
  if (!fileBase64) return NextResponse.json({ error: "Missing fileBase64" }, { status: 400 });

  try {
    const buf = Buffer.from(fileBase64, "base64");
    const info = inferFromFilename(fileName);
    // Allow explicit overrides from the client (year/fund) when the filename is ambiguous.
    const fallbackYear = Number(body?.year) || info.year;
    const fund = (typeof body?.fund === "string" && body.fund.trim()) || info.fund;
    const stmts = parseMonthlyPnlWorkbook(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), {
      fallbackYear, fund, sourceFile: fileName,
    });
    if (!stmts.length) {
      return NextResponse.json({ error: "No building sheets with a Jan–Dec income statement were found. Is this the right template?" }, { status: 422 });
    }
    const now = new Date().toISOString();
    const imported: { propertyCode: string; year: number; kind: PnlKind; noi: number }[] = [];
    for (const s of stmts) {
      s.uploadedAt = now; s.uploadedBy = uploadedBy;
      await savePnlStatement(s);
      imported.push({ propertyCode: s.propertyCode, year: s.year, kind: s.kind, noi: s.subtotals.netOperatingIncome?.total ?? 0 });
    }
    return NextResponse.json({ ok: true, count: imported.length, kind: stmts[0].kind, year: stmts[0].year, fund, imported });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to parse workbook" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const propertyCode = searchParams.get("propertyCode") ?? "";
  const year = Number(searchParams.get("year"));
  const kind = searchParams.get("kind") as PnlKind | null;
  if (!propertyCode || !year || (kind !== "actual" && kind !== "budget")) {
    return NextResponse.json({ error: "propertyCode, year and kind are required" }, { status: 400 });
  }
  try {
    const ok = await deletePnlStatement(propertyCode, year, kind);
    return NextResponse.json({ ok });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to delete" }, { status: 500 });
  }
}

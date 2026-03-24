import { NextRequest, NextResponse } from "next/server";
import { parseRentRollExcel } from "@/lib/rentroll/parseRentRollExcel";
import { storeJSON, getJSON } from "@/lib/storage";

const RENTROLL_PREFIX = "rentroll";
const RENTROLL_ID     = "current";

/**
 * GET /api/rentroll
 * Returns the most recently uploaded rent roll, or null if none exists.
 */
export async function GET() {
  try {
    const data = await getJSON(RENTROLL_PREFIX, RENTROLL_ID);
    return NextResponse.json({ rentroll: data ?? null });
  } catch {
    return NextResponse.json({ rentroll: null });
  }
}

/**
 * POST /api/rentroll
 * Body: { fileBase64: string }
 * Parses the Excel rent roll and persists it (overwrites any previous upload).
 */
export async function POST(req: NextRequest) {
  try {
    const body       = await req.json();
    const fileBase64 = body?.fileBase64 as string | undefined;

    if (!fileBase64) {
      return NextResponse.json({ error: "Missing fileBase64" }, { status: 400 });
    }

    const buf    = Buffer.from(fileBase64, "base64");
    const parsed = parseRentRollExcel(buf);

    const id          = RENTROLL_ID;
    const uploadedAt  = new Date().toISOString();
    const rentroll    = { id, uploadedAt, ...parsed };

    await storeJSON(RENTROLL_PREFIX, id, rentroll);

    const summary = {
      uploadedAt,
      reportFrom:     rentroll.reportFrom,
      reportTo:       rentroll.reportTo,
      propertyCount:  rentroll.properties.length,
      totalSqft:      rentroll.properties.reduce((s, p) => s + p.totalSqft, 0),
      occupiedSqft:   rentroll.properties.reduce((s, p) => s + p.occupiedSqft, 0),
      vacantSqft:     rentroll.properties.reduce((s, p) => s + p.vacantSqft, 0),
    };

    return NextResponse.json({ ok: true, summary, rentroll });
  } catch (err: any) {
    console.error("[POST /api/rentroll]", err?.message ?? err);
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}

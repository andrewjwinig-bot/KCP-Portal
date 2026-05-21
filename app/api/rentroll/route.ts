import { NextRequest, NextResponse } from "next/server";
import { parseRentRollExcel, stripStoreNumber } from "@/lib/rentroll/parseRentRollExcel";
import { snapshotMonthKey } from "@/lib/rentroll/snapshot";
import { storeJSON, getJSON } from "@/lib/storage";

const RENTROLL_PREFIX = "rentroll";
const RENTROLL_ID     = "current";
const HISTORY_PREFIX  = "rentroll-history";

// Strip "#1234" / "Store #234" / "Branch #5" tail off every occupant
// name at read time so old uploads benefit without a re-upload.
// (New uploads also get stripped at parse time — see parseRentRollExcel.)
function normalizeOccupantNames(data: any): any {
  if (!data?.properties) return data;
  for (const prop of data.properties) {
    if (!Array.isArray(prop.units)) continue;
    for (const unit of prop.units) {
      if (unit?.isVacant) continue;
      if (unit?.amenity) continue;
      if (typeof unit?.occupantName !== "string") continue;
      unit.occupantName = stripStoreNumber(unit.occupantName);
    }
  }
  return data;
}

/**
 * GET /api/rentroll
 * Returns the most recently uploaded rent roll, or null if none exists.
 */
export async function GET() {
  try {
    const data = await getJSON(RENTROLL_PREFIX, RENTROLL_ID);
    return NextResponse.json({ rentroll: data ? normalizeOccupantNames(data) : null });
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

    // Snapshot keyed by report month so the trend page can chart history.
    // Re-uploading the same month overwrites that snapshot.
    const monthKey = snapshotMonthKey(rentroll);
    await storeJSON(HISTORY_PREFIX, monthKey, rentroll);

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

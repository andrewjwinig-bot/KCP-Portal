import { NextRequest, NextResponse } from "next/server";
import { listJSON, getJSON, storeJSON } from "@/lib/storage";
import { parseRentRollExcel, type RentRollData } from "@/lib/rentroll/parseRentRollExcel";
import { snapshotMonthKey, summarizeSnapshot } from "@/lib/rentroll/snapshot";

const RENTROLL_PREFIX = "rentroll";
const RENTROLL_ID     = "current";
const HISTORY_PREFIX  = "rentroll-history";

export const runtime = "nodejs";
// Always read fresh so a new import shows up in the month dropdown immediately.
export const dynamic = "force-dynamic";

/**
 * GET /api/rentroll/history
 * Returns sorted-asc array of snapshot summaries (one per month).
 * On first read with no history, backfill from the current rent roll if present.
 */
export async function GET() {
  try {
    let snapshots = await listJSON(HISTORY_PREFIX) as RentRollData[];
    if (snapshots.length === 0) {
      const current = await getJSON(RENTROLL_PREFIX, RENTROLL_ID) as RentRollData | null;
      if (current) {
        const key = snapshotMonthKey(current);
        await storeJSON(HISTORY_PREFIX, key, current);
        snapshots = [current];
      }
    }
    const summaries = snapshots.map(summarizeSnapshot).sort((a, b) => a.month.localeCompare(b.month));
    return NextResponse.json({ snapshots: summaries });
  } catch (err: any) {
    console.error("[GET /api/rentroll/history]", err?.message ?? err);
    return NextResponse.json({ snapshots: [] });
  }
}

/**
 * POST /api/rentroll/history
 * Body: { fileBase64: string, monthOverride?: string }
 * Parses the uploaded rent roll Excel and writes ONLY a history snapshot
 * (keyed by report month, or by monthOverride if provided as YYYY-MM).
 * Does NOT touch the current rent roll. Used for backfilling past months.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const fileBase64 = body?.fileBase64 as string | undefined;
    const monthOverride = (body?.monthOverride as string | undefined)?.trim();

    if (!fileBase64) {
      return NextResponse.json({ error: "Missing fileBase64" }, { status: 400 });
    }

    const buf = Buffer.from(fileBase64, "base64");
    const parsed = parseRentRollExcel(buf);
    const uploadedAt = new Date().toISOString();
    const rentroll = { id: "history", uploadedAt, ...parsed } as RentRollData;

    let key = snapshotMonthKey(rentroll);
    if (monthOverride && /^\d{4}-\d{2}$/.test(monthOverride)) key = monthOverride;

    await storeJSON(HISTORY_PREFIX, key, rentroll);

    return NextResponse.json({ ok: true, month: key, summary: summarizeSnapshot(rentroll) });
  } catch (err: any) {
    console.error("[POST /api/rentroll/history]", err?.message ?? err);
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}

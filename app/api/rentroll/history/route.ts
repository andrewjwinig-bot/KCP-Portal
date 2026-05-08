import { NextResponse } from "next/server";
import { listJSON, getJSON, storeJSON } from "@/lib/storage";
import type { RentRollData } from "@/lib/rentroll/parseRentRollExcel";
import { snapshotMonthKey, summarizeSnapshot } from "@/lib/rentroll/snapshot";

const RENTROLL_PREFIX = "rentroll";
const RENTROLL_ID     = "current";
const HISTORY_PREFIX  = "rentroll-history";

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

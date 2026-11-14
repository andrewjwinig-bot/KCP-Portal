import { NextResponse } from "next/server";
import { listJSON, getJSON } from "@/lib/storage";
import type { RentRollData } from "@/lib/rentroll/parseRentRollExcel";
import { summarizeSnapshot } from "@/lib/rentroll/snapshot";
import { buildRentRollTrendXlsx } from "@/lib/rentroll/buildTrendXlsx";

const RENTROLL_PREFIX = "rentroll";
const RENTROLL_ID     = "current";
const HISTORY_PREFIX  = "rentroll-history";

export const runtime = "nodejs";
// Read fresh — this export reads the live rent-roll history, not a static file.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  let snapshots = await listJSON(HISTORY_PREFIX) as RentRollData[];
  if (snapshots.length === 0) {
    const current = await getJSON(RENTROLL_PREFIX, RENTROLL_ID) as RentRollData | null;
    if (current) snapshots = [current];
  }
  if (snapshots.length === 0) {
    return NextResponse.json({ error: "No rent roll history yet" }, { status: 404 });
  }
  const summaries = snapshots.map(summarizeSnapshot);
  const buf = buildRentRollTrendXlsx(summaries);
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="rent-roll-trend.xlsx"`,
    },
  });
}

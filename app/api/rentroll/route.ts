import { NextRequest, NextResponse } from "next/server";
import { parseRentRollExcel, stripStoreNumber } from "@/lib/rentroll/parseRentRollExcel";
import { snapshotMonthKey } from "@/lib/rentroll/snapshot";
import { storeJSON, getJSON, listJSON } from "@/lib/storage";

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
 * Resolve the current rent roll as the snapshot with the LATEST report
 * month across all history, not whatever happened to be uploaded last.
 * If the stored "current" pointer has drifted off the latest month (e.g.
 * an older roll was imported under the pre-fix behavior), repair it here
 * so the direct readers of rentroll/current — budgets, status report,
 * tenant lookups — also see the latest month.
 */
async function resolveCurrentRentroll(): Promise<any | null> {
  const snapshots = (await listJSON(HISTORY_PREFIX)) as any[];
  if (!snapshots.length) {
    return await getJSON(RENTROLL_PREFIX, RENTROLL_ID);
  }
  let latest = snapshots[0];
  let latestMonth = snapshotMonthKey(latest);
  for (const snap of snapshots) {
    const m = snapshotMonthKey(snap);
    if (m.localeCompare(latestMonth) > 0) {
      latest = snap;
      latestMonth = m;
    }
  }
  const stored = await getJSON(RENTROLL_PREFIX, RENTROLL_ID);
  if (!stored || snapshotMonthKey(stored) !== latestMonth) {
    await storeJSON(RENTROLL_PREFIX, RENTROLL_ID, { ...latest, id: RENTROLL_ID });
  }
  return latest;
}

/**
 * GET /api/rentroll
 * Returns the rent roll for the most recent report month, or null if none
 * exists. Importing an older roll never changes this.
 */
export async function GET() {
  try {
    const data = await resolveCurrentRentroll();
    return NextResponse.json({ rentroll: data ? normalizeOccupantNames(data) : null });
  } catch {
    return NextResponse.json({ rentroll: null });
  }
}

/**
 * POST /api/rentroll
 * Body: { fileBase64: string }
 *
 * Parses the Excel rent roll, saves a snapshot keyed by the roll's own
 * report month, and points "current" at whichever month is the most
 * recent across all snapshots — NOT simply at whatever was uploaded last.
 *
 * That means you can import past rent rolls in any order to backfill
 * history: each is filed under its report month, and the newest month
 * stays "current". Re-importing a month overwrites just that snapshot.
 */
export async function POST(req: NextRequest) {
  try {
    const body       = await req.json();
    const fileBase64 = body?.fileBase64 as string | undefined;
    const uploadedBy = typeof body?.uploadedBy === "string" && body.uploadedBy.trim()
      ? body.uploadedBy.trim()
      : null;

    if (!fileBase64) {
      return NextResponse.json({ error: "Missing fileBase64" }, { status: 400 });
    }

    const buf    = Buffer.from(fileBase64, "base64");
    const parsed = parseRentRollExcel(buf);

    const uploadedAt  = new Date().toISOString();
    const imported    = { uploadedAt, uploadedBy, ...parsed };

    // File this upload under its report month. Re-importing a month
    // overwrites that snapshot.
    const importedMonth = snapshotMonthKey(imported);
    await storeJSON(HISTORY_PREFIX, importedMonth, imported);

    // "Current" = the latest month across every snapshot, so backfilling an
    // older roll never dethrones a newer current.
    const all = (await listJSON(HISTORY_PREFIX)) as any[];
    let latest = imported;
    let latestMonth = importedMonth;
    for (const snap of all) {
      const m = snapshotMonthKey(snap);
      if (m.localeCompare(latestMonth) > 0) {
        latest = snap;
        latestMonth = m;
      }
    }
    const current = { ...latest, id: RENTROLL_ID };
    await storeJSON(RENTROLL_PREFIX, RENTROLL_ID, current);

    const becameCurrent = latestMonth === importedMonth;

    const summary = {
      uploadedAt,
      reportFrom:     imported.reportFrom,
      reportTo:       imported.reportTo,
      propertyCount:  imported.properties.length,
      totalSqft:      imported.properties.reduce((s, p) => s + p.totalSqft, 0),
      occupiedSqft:   imported.properties.reduce((s, p) => s + p.occupiedSqft, 0),
      vacantSqft:     imported.properties.reduce((s, p) => s + p.vacantSqft, 0),
    };

    // Always hand back the *current* (latest-month) roll for display, plus
    // what was imported and whether it became current.
    return NextResponse.json({
      ok: true,
      summary,
      rentroll: normalizeOccupantNames(current),
      imported: { month: importedMonth, becameCurrent },
      currentMonth: latestMonth,
    });
  } catch (err: any) {
    console.error("[POST /api/rentroll]", err?.message ?? err);
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getBudget, deleteBudget, saveBudget } from "@/lib/financials/budgets/storage";
import { enrichWithRentRollDates } from "@/lib/financials/budgets/enrich";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const wb = await getBudget(params.id);
    if (!wb) return NextResponse.json({ error: "Not found" }, { status: 404 });
    // Layer in lease windows from the portal's stored rent roll for
    // any rent-roster tenant whose dates the workbook didn't already
    // carry (typically in-place leases — the workbook only ships
    // dates for leases on the Renew & Vac tab).
    await enrichWithRentRollDates(wb);
    return NextResponse.json({ workbook: wb });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load budget" },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/financials/budgets/:id
 *
 * Body: { reforecasting: boolean, discard?: boolean, user?: string }
 *
 * Flip the workbook-wide editable flag. While `reforecasting` is true
 * the property pages render their monthly cells + notes as inline
 * inputs and PATCH /api/financials/budgets/:id/line accepts edits.
 *
 *   { reforecasting: true }                — start. Snapshots the
 *                                            current properties +
 *                                            rollup so a Discard can
 *                                            roll back.
 *   { reforecasting: false }               — save / commit. Drops the
 *                                            snapshot; whatever was
 *                                            edited stays in place.
 *   { reforecasting: false, discard: true} — discard. Restores from
 *                                            the snapshot and drops
 *                                            it, leaving the budget
 *                                            exactly as it was
 *                                            before the reforecast
 *                                            started.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const wb = await getBudget(params.id);
    if (!wb) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (typeof body?.reforecasting === "boolean") {
      const turningOn  = body.reforecasting === true;
      const turningOff = body.reforecasting === false;
      const discard    = turningOff && body?.discard === true;

      if (turningOn && !wb.reforecasting) {
        // Snapshot the current state so Discard can roll back. Deep
        // clone via JSON so subsequent line edits don't bleed into
        // the snapshot.
        wb.reforecastSnapshot = {
          properties: JSON.parse(JSON.stringify(wb.properties)),
          rollup: wb.rollup ? JSON.parse(JSON.stringify(wb.rollup)) : undefined,
        };
      } else if (turningOff && discard && wb.reforecastSnapshot) {
        // Restore from the snapshot — exits reforecast mode with the
        // budget unchanged from when the user clicked Reforecast.
        wb.properties = wb.reforecastSnapshot.properties;
        if (wb.reforecastSnapshot.rollup) wb.rollup = wb.reforecastSnapshot.rollup;
        delete wb.reforecastSnapshot;
      } else if (turningOff) {
        // Save / commit. Drop the snapshot, keep the edits.
        delete wb.reforecastSnapshot;
      }

      wb.reforecasting = body.reforecasting;
      if (body?.user) wb.reforecastBy = String(body.user);
      wb.reforecastAt = new Date().toISOString();
      await saveBudget(wb);
    }
    return NextResponse.json({ workbook: wb });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to toggle reforecast" },
      { status: 500 },
    );
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ok = await deleteBudget(params.id);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to delete" },
      { status: 500 },
    );
  }
}

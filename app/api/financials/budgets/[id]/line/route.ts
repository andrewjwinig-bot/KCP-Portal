import { NextResponse } from "next/server";
import { getBudget, saveBudget } from "@/lib/financials/budgets/storage";
import { findLineByPath, recomputeProperty } from "@/lib/financials/budgets/recompute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/financials/budgets/:id/line
 *
 * Body: {
 *   propertyCode, sectionName, parentLineLabel?, lineLabel,
 *   patch: { monthIdx?, value?, notes? },
 *   user,            // display label like "DREW"
 * }
 *
 * Edits are accepted only while the workbook is in `reforecasting: true`
 * mode — toggle via PATCH /api/financials/budgets/[id]. Outside of a
 * reforecast the imported workbooks stay read-only so the page still
 * ties out to the source xlsx.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const propertyCode    = String(body?.propertyCode ?? "").toUpperCase();
    const sectionName     = String(body?.sectionName ?? "");
    const parentLineLabel = body?.parentLineLabel ? String(body.parentLineLabel) : null;
    const lineLabel       = String(body?.lineLabel ?? "");
    const editor          = body?.user ? String(body.user) : null;
    const patch           = body?.patch ?? {};

    if (!propertyCode || !sectionName || !lineLabel) {
      return NextResponse.json({ error: "Missing target" }, { status: 400 });
    }

    const wb = await getBudget(params.id);
    if (!wb) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!wb.reforecasting) {
      return NextResponse.json({ error: "Budget is locked — start a reforecast to edit" }, { status: 403 });
    }

    const property = wb.properties.find((p) => p.propertyCode.toUpperCase() === propertyCode);
    if (!property) return NextResponse.json({ error: "Property not found" }, { status: 404 });

    const line = findLineByPath(property, sectionName, parentLineLabel, lineLabel);
    if (!line) return NextResponse.json({ error: "Line not found" }, { status: 404 });

    if (patch.monthIdx != null) {
      const idx = Number(patch.monthIdx);
      const val = Number(patch.value ?? 0);
      if (!Number.isInteger(idx) || idx < 0 || idx > 11 || !Number.isFinite(val)) {
        return NextResponse.json({ error: "Bad month edit" }, { status: 400 });
      }
      if (line.subLines && line.subLines.length > 0) {
        // Parent lines roll up from sub-lines; edit the leaves
        // instead so the workbook stays internally consistent.
        return NextResponse.json({ error: "Edit the sub-lines on this row instead" }, { status: 400 });
      }
      line.months[idx] = Math.round(val);
    }
    if (typeof patch.notes === "string") {
      line.notes = patch.notes.trim() || null;
    }

    if (editor) {
      line.lastEditedBy = editor;
      line.lastEditedAt = new Date().toISOString();
    }

    recomputeProperty(property);
    await saveBudget(wb);

    return NextResponse.json({ workbook: wb });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to edit line" },
      { status: 500 },
    );
  }
}

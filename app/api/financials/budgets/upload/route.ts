import { NextResponse } from "next/server";
import { parseBudgetWorkbook } from "@/lib/financials/budgets/parser";
import { saveBudget } from "@/lib/financials/budgets/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// POST /api/financials/budgets/upload — multipart form upload of the
// budget .xlsx. Returns the parsed workbook (sans `properties` to keep
// the payload small; the page fetches /[id] to render).
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }
    const labelRaw = form.get("label");
    const label =
      typeof labelRaw === "string" && labelRaw.trim()
        ? labelRaw.trim()
        : file.name.replace(/\.[^.]+$/, "");

    const buf = Buffer.from(await file.arrayBuffer());
    const wb = parseBudgetWorkbook(buf, label);
    if (wb.properties.length === 0) {
      return NextResponse.json(
        { error: "No property sheets found in the workbook" },
        { status: 400 },
      );
    }

    await saveBudget(wb);
    return NextResponse.json({
      ok: true,
      id: wb.id,
      label: wb.label,
      year: wb.year,
      category: wb.category,
      propertyCount: wb.properties.length,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to parse workbook" },
      { status: 500 },
    );
  }
}

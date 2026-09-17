import { NextResponse } from "next/server";
import { parseInPlaceRevenue, missingProperties } from "@/lib/financials/budgets/inPlaceRevenue";
import { saveInPlaceRevenue, getInPlaceRevenue, deleteInPlaceRevenue } from "@/lib/financials/budgets/inPlaceStore";
import { PROPERTY_DEFS } from "@/lib/properties/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

/** The properties a budget group covers — what the import is checked against. */
function groupProperties(category: string): string[] {
  if (/shopping/i.test(category)) {
    return PROPERTY_DEFS.filter((p) => p.allocGroup === "SC").map((p) => p.id).sort();
  }
  if (/office/i.test(category)) {
    return PROPERTY_DEFS.filter((p) => p.allocGroup === "BP").map((p) => p.id).sort();
  }
  return [];
}

// GET ?year=&category= — the imported schedule for a budget group.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const year = Number(url.searchParams.get("year"));
  const category = url.searchParams.get("category") ?? "Shopping Centers";
  if (!year) return NextResponse.json({ error: "year required" }, { status: 400 });
  return NextResponse.json({ record: await getInPlaceRevenue(year, category), expected: groupProperties(category) });
}

// POST multipart { file, year, category } — import the Budget Rent Increase
// Calculation export. Replaces the year: it is a forward schedule, so the
// newest export is the truth.
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const year = Number(form.get("year"));
    const category = String(form.get("category") ?? "Shopping Centers");
    if (!(file instanceof File)) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    if (!year) return NextResponse.json({ error: "year required" }, { status: 400 });

    const parsed = parseInPlaceRevenue(Buffer.from(await file.arrayBuffer()));
    if (!parsed.charges.length) {
      return NextResponse.json({
        error: "No charge rows were readable in that file. Check it is the Budget Rent Increase Calculation export, with its header row intact.",
        skipped: parsed.skipped.slice(0, 10),
      }, { status: 400 });
    }

    const expected = groupProperties(category);
    // The uploader comes from the form, the way the GL upload does it — the
    // page knows who is signed in and the route does not need its own lookup.
    const importedByRaw = form.get("importedBy");
    const rec = {
      year, category,
      charges: parsed.charges,
      properties: parsed.properties,
      // A property with no rows is NOT a property with no rent. Reported, never
      // assumed — the 2026 workbook carried "Missing 1100 and 1500" as a note
      // somebody typed after spotting it by eye.
      missing: missingProperties(parsed.properties, expected),
      skipped: parsed.skipped,
      chargeCodes: parsed.chargeCodes,
      importedAt: new Date().toISOString(),
      importedBy: typeof importedByRaw === "string" && importedByRaw.trim() ? importedByRaw.trim() : "Unknown",
      fileName: file.name,
    };
    await saveInPlaceRevenue(rec);
    return NextResponse.json({ ok: true, record: rec, expected });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Import failed" }, { status: 500 });
  }
}

// DELETE ?year=&category= — drop the import so it can be redone cleanly.
export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const year = Number(url.searchParams.get("year"));
  const category = url.searchParams.get("category") ?? "Shopping Centers";
  if (!year) return NextResponse.json({ error: "year required" }, { status: 400 });
  return NextResponse.json({ ok: await deleteInPlaceRevenue(year, category) });
}

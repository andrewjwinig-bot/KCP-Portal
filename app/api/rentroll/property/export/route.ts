import { NextResponse } from "next/server";
import { getJSON } from "@/lib/storage";
import type { RentRollData } from "@/lib/rentroll/parseRentRollExcel";
import { buildPropertyRollXlsx } from "@/lib/rentroll/buildPropertyRollXlsx";
import { PROPERTY_DEFS } from "@/lib/properties/data";

export const runtime = "nodejs";
// Reads the live rent roll, not a build-time snapshot.
export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET ?code=<property> — one property's rent roll as a workbook, for the
// lender / broker / appraiser who asks for exactly that and nothing else.
export async function GET(req: Request) {
  const code = (new URL(req.url).searchParams.get("code") ?? "").trim();
  if (!code) return NextResponse.json({ error: "code is required" }, { status: 400 });

  const rentroll = (await getJSON("rentroll", "current")) as RentRollData | null;
  if (!rentroll) return NextResponse.json({ error: "No rent roll has been imported yet." }, { status: 404 });

  const prop = rentroll.properties.find((p) => p.propertyCode.toUpperCase() === code.toUpperCase());
  if (!prop) return NextResponse.json({ error: `No rent roll for ${code}.` }, { status: 404 });

  // The portal's name for the building, falling back to the one the roll
  // reported — the report's own label is sometimes an abbreviation.
  const name = PROPERTY_DEFS.find((p) => p.id.toUpperCase() === code.toUpperCase())?.name
    ?? prop.reportedPropertyName
    ?? code;
  // The roll's own reporting date, which is what a recipient needs to read —
  // not when it happened to be uploaded. Falls back to the upload stamp for
  // rolls imported before the report dates were captured.
  const asOf = rentroll.reportTo || (rentroll.uploadedAt ?? "").slice(0, 10) || null;

  const buf = await buildPropertyRollXlsx(prop, name, asOf || null);
  // Filename leads with the code so a folder of these sorts the way the
  // portfolio does.
  const file = `${code} ${name} Rent Roll.xlsx`.replace(/[\\/:*?"<>|]/g, "-");
  return new NextResponse(buf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "no-store",
    },
  });
}

import { NextResponse } from "next/server";
import { getAllSuiteInformation } from "@/lib/suites/informationStorage";

// Lightweight floorplan index for the Unit Info page: a single read that
// returns just the floorplan (url/name/type) per unit ref that has one, so
// the index can show a Floorplan column without 200+ per-unit requests.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const all = await getAllSuiteInformation();
  const floorplans: Record<string, { url: string; name: string; contentType: string }> = {};
  for (const s of all) {
    if (s.floorplan?.url) {
      floorplans[s.unitRef] = {
        url: s.floorplan.url,
        name: s.floorplan.name,
        contentType: s.floorplan.contentType,
      };
    }
  }
  return NextResponse.json({ floorplans });
}

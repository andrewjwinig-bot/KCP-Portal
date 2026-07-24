import { NextResponse } from "next/server";
import { getAllSuiteInformation } from "@/lib/suites/informationStorage";

// Physical-specs summary for the Unit Info page: a single read that returns
// the at-a-glance physical attributes (floorplan, restrooms, kitchen, paint,
// flooring, HVAC, attachment count) per unit ref that has any suite data —
// so the index avoids 200+ per-unit requests.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export type SuiteSummary = {
  floorplan: { url: string; name: string; contentType: string } | null;
  restrooms: string;
  kitchen: string;
  paint: string;
  hvac: string;
  flooring: string[];
  attachments: number;
};

export async function GET() {
  const all = await getAllSuiteInformation();
  const suites: Record<string, SuiteSummary> = {};
  for (const s of all) {
    suites[s.unitRef] = {
      floorplan: s.floorplan?.url
        ? { url: s.floorplan.url, name: s.floorplan.name, contentType: s.floorplan.contentType }
        : null,
      restrooms: s.restrooms,
      kitchen: s.kitchen,
      paint: s.paint,
      hvac: s.hvac,
      flooring: s.flooring,
      attachments: s.attachments.length,
    };
  }
  return NextResponse.json({ suites });
}

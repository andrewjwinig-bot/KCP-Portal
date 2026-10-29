import { type NextRequest } from "next/server";
import { get } from "@vercel/blob";
import { resolveCurrentRentroll } from "@/lib/rentroll/current";
import { getSuiteInformation } from "@/lib/suites/informationStorage";
import { spacesFromRoll } from "@/lib/interplex/spaces";

// PUBLIC floor plan for a suite listed on the Neshaminy Interplex Business
// Center website. The plan is the one uploaded on the unit page (Unit Info →
// Floorplan), stored in the PRIVATE blob store, so the website reaches it only
// through here — public by the middleware's api/website/ exemption. Scoped
// tightly: the caller names a UNIT, never a blob URL; the unit must be a
// vacancy the page currently lists (the live rent roll); and only that suite's
// floorplan is ever served — never its other attachments.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const unit = (req.nextUrl.searchParams.get("unit") ?? "").trim();
  if (!unit) return new Response("unit required", { status: 400 });
  if (!process.env.BLOB_READ_WRITE_TOKEN) return new Response("Blob storage is not configured.", { status: 503 });
  try {
    const roll = await resolveCurrentRentroll();
    const listed = spacesFromRoll(roll?.properties ?? []).some((s) => s.unit.toUpperCase() === unit.toUpperCase());
    if (!listed) return new Response("Not found", { status: 404 });
    const fp = (await getSuiteInformation(unit))?.floorplan;
    if (!fp?.url) return new Response("Not found", { status: 404 });
    const result = await get(fp.url, { access: "private" });
    if (!result) return new Response("Not found", { status: 404 });
    const headers = new Headers();
    headers.set("content-type", result.blob.contentType || fp.contentType || "application/octet-stream");
    headers.set("content-disposition", `inline; filename="${(fp.name || "floorplan").replace(/["\r\n]/g, "")}"`);
    headers.set("cache-control", "public, max-age=300, s-maxage=600");
    return new Response(result.stream, { headers });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

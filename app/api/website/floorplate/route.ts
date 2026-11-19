import { type NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { resolveCurrentRentroll } from "@/lib/rentroll/current";
import { spacesFromRoll } from "@/lib/interplex/spaces";
import { floorplateFor, floorplateSvg } from "@/lib/site/floorplate";

// PUBLIC quick floorplate for a suite the website lists (lib/site/floorplate.ts).
// The floor images live in public/buildings, which middleware keeps behind
// sign-in, so the website reaches one only through here — and only for a
// vacancy the Interplex listings carry today (WEBSITE_HIDDEN_UNITS respected).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const unit = (req.nextUrl.searchParams.get("unit") ?? "").trim();
  const hit = unit ? floorplateFor(unit) : null;
  if (!hit) return new Response("Not found", { status: 404 });
  try {
    const roll = await resolveCurrentRentroll();
    const space = spacesFromRoll(roll?.properties ?? []).find((s) => s.unit.toUpperCase() === unit.toUpperCase());
    if (!space) return new Response("Not found", { status: 404 });
    const file = path.join(process.cwd(), "public", hit.floor.src.replace(/^\//, ""));
    const img = await readFile(file);
    const type = file.endsWith(".png") ? "image/png" : "image/webp";
    const svg = floorplateSvg(hit.floor, hit.suite, `data:${type};base64,${img.toString("base64")}`, space.suite);
    return new Response(svg, { headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=300, s-maxage=600" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

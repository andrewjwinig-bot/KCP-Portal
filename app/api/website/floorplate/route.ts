import { type NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { resolveCurrentRentroll } from "@/lib/rentroll/current";
import { spacesFromRoll } from "@/lib/interplex/spaces";
import { DESIGNED, liveDesignedSuites } from "@/lib/centers/designed/render";
import { OFFICE_WORKS_CODE, planFromRoll } from "@/lib/officeWorks/offices";
import { floorplateFor, floorplateSvg, highlightSvg, parseViewBox, rectRing, suiteShape } from "@/lib/site/floorplate";

// PUBLIC quick floorplate for a space the website lists (lib/site/floorplate.ts):
// the plan with that one space highlighted and the rest greyed.
//   ?unit=<ref>                  an Interplex suite on its floor (public/buildings,
//                                behind sign-in otherwise — reached only through here)
//   ?center=<slug>&suite=<id>    a designed centre's suite on its site plan
//   ?office=<id>                 an office at The Office Works on its floor plan
// Each answers ONLY for a space listed as available right now.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OFFICE_WORKS_PLAN = { src: "/office-works/assets/plan-ow.webp", w: 2180, h: 2320 };

async function dataUri(publicPath: string): Promise<string> {
  const file = path.join(process.cwd(), "public", publicPath.replace(/^\//, ""));
  const type = file.endsWith(".png") ? "image/png" : file.endsWith(".jpg") ? "image/jpeg" : "image/webp";
  return `data:${type};base64,${(await readFile(file)).toString("base64")}`;
}

const svg = (body: string) =>
  new Response(body, { headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=300, s-maxage=600" } });
const notFound = () => new Response("Not found", { status: 404 });

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  try {
    const center = q.get("center");
    if (center) {
      const d = DESIGNED[center];
      const id = q.get("suite") ?? "";
      if (!d || !id) return notFound();
      const live = await liveDesignedSuites(center);
      const s = live?.suites.find((x) => x.id === id && x.status === "available");
      if (!s) return notFound();
      const { rings, at } = suiteShape(s);
      return svg(highlightSvg({ imageHref: await dataUri(d.plan.src), box: parseViewBox(d.plan.viewBox), rings, label: `Suite ${s.id}`, at }));
    }

    const office = q.get("office");
    if (office) {
      const roll = await resolveCurrentRentroll();
      const units = roll?.properties.find((p) => p.propertyCode.toUpperCase() === OFFICE_WORKS_CODE)?.units ?? null;
      const o = units ? planFromRoll(units).find((x) => x.id === office && x.av) : null;
      if (!o) return notFound();
      return svg(highlightSvg({
        imageHref: await dataUri(OFFICE_WORKS_PLAN.src),
        box: { x: 0, y: 0, w: OFFICE_WORKS_PLAN.w, h: OFFICE_WORKS_PLAN.h },
        rings: rectRing(o.x, o.y, o.w, o.h),
        label: o.id,
        at: { x: o.x + o.w / 2, y: o.y + o.h / 2 },
      }));
    }

    const unit = (q.get("unit") ?? "").trim();
    const hit = unit ? floorplateFor(unit) : null;
    if (!hit) return notFound();
    const roll = await resolveCurrentRentroll();
    const space = spacesFromRoll(roll?.properties ?? []).find((s) => s.unit.toUpperCase() === unit.toUpperCase());
    if (!space) return notFound();
    return svg(floorplateSvg(hit.floor, hit.suite, await dataUri(hit.floor.src), space.suite));
  } catch {
    return notFound();
  }
}

// A QUICK FLOORPLATE for a website listing (owner, 11/2026: "show it on the
// floorplate with the rest of the area just greyed out … as like a quick
// floorplan since we have that from the portal"). The suite's floor from the
// portal's mapped floor plans (lib/buildings/plans — the same geometry the
// property page colours), the floor greyed out and the suite drawn in navy
// with its number. Pure: the route hands in the floor image as a data URI,
// since an SVG shown as an <img> loads nothing from outside itself.

import { buildingPlanFor, type MappedFloor, type MappedSuite } from "@/lib/buildings/plans";

export function floorplateFor(unit: string): { floor: MappedFloor; suite: MappedSuite } | null {
  const code = unit.split("-")[0];
  const plan = buildingPlanFor(code);
  if (!plan) return null;
  for (const floor of plan.floors) {
    const suite = floor.suites.find((s) => s.unit.toUpperCase() === unit.toUpperCase());
    if (suite) return { floor, suite };
  }
  return null;
}

/** The website's own path for a mapped suite's floorplate, else null. */
export const floorplateUrl = (unit: string) => (floorplateFor(unit) ? `/api/website/floorplate?unit=${encodeURIComponent(unit)}` : null);

/** A designed centre's suite on its site plan (owner: "should it not
 *  highlight which space it is? … for all properties"). */
export const centerPlateUrl = (designedSlug: string, suiteId: string) =>
  `/api/website/floorplate?center=${encodeURIComponent(designedSlug)}&suite=${encodeURIComponent(suiteId)}`;
/** An office at The Office Works on its floor plan ("and office works too"). */
export const officePlateUrl = (officeId: string) => `/api/website/floorplate?office=${encodeURIComponent(officeId)}`;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

/** Path rings for a rectangle or a "x,y x,y …" polygon. */
export const rectRing = (x: number, y: number, w: number, h: number) => `M${x} ${y} H${x + w} V${y + h} H${x} Z`;
export const polyRing = (pts: string) => `M${pts.trim().replace(/\s+/g, " L")} Z`;

/** The highlight drawing: the plan image laid over `box` (the coordinates the
 *  shapes are in), everything outside the shapes greyed, the shapes in navy
 *  with the label at `at`. */
export function highlightSvg(o: {
  imageHref: string;
  box: { x: number; y: number; w: number; h: number };
  rings: string;
  label: string;
  at: { x: number; y: number };
}): string {
  const { x, y, w, h } = o.box;
  const pad = Math.round(Math.max(w, h) * 0.03);
  const fs = Math.round(Math.max(w, h) * 0.035);
  const vb = `${x - pad} ${y - pad} ${w + 2 * pad} ${h + 2 * pad}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${w + 2 * pad}" height="${h + 2 * pad}">
<rect x="${x - pad}" y="${y - pad}" width="${w + 2 * pad}" height="${h + 2 * pad}" fill="#ffffff"/>
<image href="${esc(o.imageHref)}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="none"/>
<path d="${rectRing(x, y, w, h)} ${o.rings}" fill="#e4e7ec" fill-opacity="0.72" fill-rule="evenodd"/>
<path d="${o.rings}" fill="#0b4a7d" fill-opacity="0.22" stroke="#0b4a7d" stroke-width="${Math.round(fs / 4)}" stroke-linejoin="round"/>
<g font-family="Inter, Helvetica, Arial, sans-serif" font-weight="700" text-anchor="middle">
<text x="${o.at.x}" y="${o.at.y}" font-size="${fs}" dominant-baseline="middle" fill="#ffffff" stroke="#ffffff" stroke-width="${Math.round(fs / 4)}" stroke-linejoin="round">${esc(o.label)}</text>
<text x="${o.at.x}" y="${o.at.y}" font-size="${fs}" dominant-baseline="middle" fill="#0b4a7d">${esc(o.label)}</text>
</g>
</svg>`;
}

export function floorplateSvg(floor: MappedFloor, suite: MappedSuite, imageHref: string, label: string): string {
  return highlightSvg({
    imageHref,
    box: { x: 0, y: 0, w: floor.width, h: floor.height },
    rings: suite.pts.map(polyRing).join(" "),
    label,
    at: { x: suite.cx, y: suite.cy },
  });
}

/** A designed suite's shapes and label spot, in the site plan's coordinates. */
export function suiteShape(s: { x: number; y: number; w: number; h: number; rects?: [number, number, number, number][]; pts?: string | string[]; cx?: number; cy?: number }) {
  const polys = s.pts ? (Array.isArray(s.pts) ? s.pts : [s.pts]) : [];
  const rings = polys.length
    ? polys.map(polyRing).join(" ")
    : (s.rects?.length ? s.rects : [[s.x, s.y, s.w, s.h] as [number, number, number, number]]).map((r) => rectRing(...r)).join(" ");
  return { rings, at: { x: s.cx ?? s.x + s.w / 2, y: s.cy ?? s.y + s.h / 2 } };
}

/** "0 600 3300 1670" → the box. */
export function parseViewBox(vb: string) {
  const [x, y, w, h] = vb.trim().split(/[\s,]+/).map(Number);
  return { x, y, w, h };
}

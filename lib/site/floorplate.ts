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

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

export function floorplateSvg(floor: MappedFloor, suite: MappedSuite, imageHref: string, label: string): string {
  const { width: w, height: h } = floor;
  const pad = Math.round(Math.max(w, h) * 0.03);
  const rings = suite.pts.map((p) => `M${p.trim().replace(/\s+/g, " L")} Z`).join(" ");
  const fs = Math.round(Math.max(w, h) * 0.035);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${w + 2 * pad} ${h + 2 * pad}" width="${w + 2 * pad}" height="${h + 2 * pad}">
<rect x="${-pad}" y="${-pad}" width="${w + 2 * pad}" height="${h + 2 * pad}" fill="#ffffff"/>
<image href="${esc(imageHref)}" x="0" y="0" width="${w}" height="${h}"/>
<path d="M0 0 H${w} V${h} H0 Z ${rings}" fill="#e4e7ec" fill-opacity="0.72" fill-rule="evenodd"/>
<path d="${rings}" fill="#0b4a7d" fill-opacity="0.22" stroke="#0b4a7d" stroke-width="${Math.round(fs / 4)}" stroke-linejoin="round"/>
<g font-family="Inter, Helvetica, Arial, sans-serif" font-weight="700" text-anchor="middle">
<text x="${suite.cx}" y="${suite.cy}" font-size="${fs}" dominant-baseline="middle" fill="#ffffff" stroke="#ffffff" stroke-width="${Math.round(fs / 4)}" stroke-linejoin="round">${esc(label)}</text>
<text x="${suite.cx}" y="${suite.cy}" font-size="${fs}" dominant-baseline="middle" fill="#0b4a7d">${esc(label)}</text>
</g>
</svg>`;
}

import "server-only";
import { readFile } from "fs/promises";
import path from "path";
import { rgb, type PDFDocument, type PDFFont } from "pdf-lib";
import { EXPIRY_COLOR, EXPIRY_LABEL, EXPIRY_ORDER, expiryBucket, isoDate, type ExpiryBucket } from "@/lib/centers/designed/staffPlanMath";
import { buildingPlanFor, floorLabel } from "./plans";

// The status report's FLOOR PLAN pages for an office building (owner: "in the
// status report instead of having the generic floorplans actually show the
// leased vs occupied space color coded and filled in"): one landscape page per
// MAPPED floor, right after the building's rent roll, each suite filled by the
// report's OWN roll (the month being reported, not today's) in the property
// page's lease-expiry colours, so the two read alike.

const W = 792;
const H = 612;
const M = 36;

type Unit = { unitRef: string; isVacant?: boolean; occupantName?: string | null; leaseTo?: string | null; sqft?: number; amenity?: unknown };

const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);

const fit = (s: string, font: PDFFont, size: number, max: number) => {
  if (font.widthOfTextAtSize(s, size) <= max) return s;
  let t = s;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}…`, size) > max) t = t.slice(0, -1);
  return `${t}…`;
};

export async function drawFloorPlanPages(
  pdf: PDFDocument,
  fonts: { font: PDFFont; bold: PDFFont },
  prop: { propertyCode: string; units: Unit[] },
  opts: { name: string; reportTitle: string; asOf: Date },
): Promise<number> {
  const bp = buildingPlanFor(prop.propertyCode);
  if (!bp) return 0;
  const { font, bold } = fonts;
  const byRef = new Map<string, Unit[]>();
  for (const u of prop.units ?? []) {
    if (u.amenity) continue;
    const k = String(u.unitRef).toUpperCase();
    byRef.set(k, [...(byRef.get(k) ?? []), u]);
  }
  let pages = 0;
  for (const f of bp.floors) {
    if (!f.suites.length) continue;
    let png;
    try {
      png = await pdf.embedPng(await readFile(path.join(process.cwd(), "public", f.src)));
    } catch {
      continue; // image not deployed with the function — skip the page rather than fail the report
    }
    const page = pdf.addPage([W, H]);
    pages++;
    page.drawLine({ start: { x: M, y: H - M }, end: { x: W - M, y: H - M }, thickness: 2, color: hex("#0b4a7d") });
    page.drawText(`${opts.name} · ${floorLabel(f.floor)}`, { x: M, y: H - M - 17, size: 13, font: bold, color: hex("#0f172a") });
    const rt = opts.reportTitle;
    page.drawText(rt, { x: W - M - font.widthOfTextAtSize(rt, 8), y: H - M - 14, size: 8, font, color: hex("#6b7280") });

    // The plan, as large as the page allows under the title and over the legend.
    const top = M + 30, bottom = M + 34;
    const boxW = W - 2 * M, boxH = H - top - bottom;
    const s = Math.min(boxW / f.width, boxH / f.height);
    const iw = f.width * s, ih = f.height * s;
    const ix = M + (boxW - iw) / 2, iyTop = top + (boxH - ih) / 2;
    page.drawImage(png, { x: ix, y: H - iyTop - ih, width: iw, height: ih });

    const seen = new Map<ExpiryBucket, { count: number; sf: number }>();
    for (const m of f.suites) {
      const rows = byRef.get(m.unit.toUpperCase()) ?? [];
      if (!rows.length) continue; // not on this month's roll — leave it uncoloured
      const occ = rows.filter((u) => !u.isVacant && u.occupantName);
      const b = expiryBucket({ status: occ.length ? "leased" : "available", leaseTo: isoDate(occ[0]?.leaseTo) }, opts.asOf);
      const sf = rows.reduce((t, u) => t + (u.sqft || 0), 0);
      const t = seen.get(b) ?? { count: 0, sf: 0 };
      seen.set(b, { count: t.count + 1, sf: t.sf + sf });
      const color = hex(EXPIRY_COLOR[b]);
      for (const poly of m.pts) {
        const d = "M " + poly.split(" ").join(" L ") + " Z";
        page.drawSvgPath(d.replace(/,/g, " "), {
          x: ix, y: H - iyTop, scale: s,
          color, opacity: 0.55, borderColor: hex("#0f172a"), borderOpacity: 0.6, borderWidth: 0.8,
        });
      }
      // Suite number, and who is in it (or "Vacant").
      const lx = ix + m.cx * s, ly = H - (iyTop + m.cy * s);
      const num = m.unit.split("-").slice(1).join("-");
      const who = occ.length ? String(occ[0].occupantName) : "Vacant";
      const nw = bold.widthOfTextAtSize(num, 10);
      const w2 = fit(who, font, 7.5, 120);
      const bw = Math.max(nw, font.widthOfTextAtSize(w2, 7.5)) + 8;
      page.drawRectangle({ x: lx - bw / 2, y: ly - 12, width: bw, height: 25, color: rgb(1, 1, 1), opacity: 0.8 });
      page.drawText(num, { x: lx - nw / 2, y: ly + 1, size: 10, font: bold, color: hex("#0f172a") });
      page.drawText(w2, { x: lx - font.widthOfTextAtSize(w2, 7.5) / 2, y: ly - 9, size: 7.5, font, color: hex("#0f172a") });
    }

    // Legend.
    let lx = M;
    const ly = M + 12;
    for (const b of EXPIRY_ORDER) {
      const v = seen.get(b);
      if (!v) continue;
      const label = `${EXPIRY_LABEL[b]} · ${v.count} · ${Math.round(v.sf).toLocaleString("en-US")} SF`;
      page.drawRectangle({ x: lx, y: ly - 1, width: 9, height: 9, color: hex(EXPIRY_COLOR[b]), opacity: 0.8 });
      page.drawText(label, { x: lx + 13, y: ly, size: 8, font, color: hex("#0f172a") });
      lx += 13 + font.widthOfTextAtSize(label, 8) + 16;
    }
    const unmappedNote = "Suites not shaded are common area or not yet mapped.";
    page.drawText(unmappedNote, { x: W - M - font.widthOfTextAtSize(unmappedNote, 7.5), y: ly, size: 7.5, font, color: hex("#6b7280") });
  }
  return pages;
}

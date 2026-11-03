"use client";

// The site plan card's downloads: the drawing as a PNG — plain, or coloured
// exactly as the card shows it (view + legend filter) with its legend — and
// the rent roll as shown, as a workbook on the shared Excel theme.

import { FMT, COLOR, FONT_NAME, PRINT_WIDE, freezeAbove, headerBand, liveSum, newWorkbook, repeatHeader, titleBlock, totalEmphasis, footNote } from "@/lib/excel/theme";
import { monthsLeft, type ExpiryBucket, type StaffSuite } from "@/lib/centers/designed/staffPlanMath";

export type RollRow = { s: StaffSuite; color: string; bucket: ExpiryBucket };

const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error(`Could not load ${src}`));
  img.src = src;
});

const save = (blob: Blob, name: string) => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};
const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "-").trim();

/** The plan as a PNG. With `svg`, the card's own overlay (colours, labels,
 *  the legend filter's dimming) is drawn over the drawing, under a title band,
 *  with the legend beneath. */
export async function downloadPlanPng(o: {
  src: string; width: number; height: number; svg: SVGSVGElement | null;
  title: string; subtitle?: string; legend?: { color: string; label: string }[]; file: string;
}) {
  const base = await loadImage(o.src);
  const W = base.naturalWidth || o.width, H = base.naturalHeight || o.height;
  const k = W / 1600;
  const head = o.svg ? Math.round(110 * k) : 0;
  const legendRows = o.svg && o.legend?.length ? Math.ceil(o.legend.length / 3) : 0;
  const foot = legendRows ? Math.round((30 + legendRows * 40) * k) : 0;
  const c = document.createElement("canvas");
  c.width = W; c.height = H + head + foot;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
  if (head) {
    g.fillStyle = "#0b4a7d"; g.fillRect(0, 0, W, head);
    g.fillStyle = "#fff";
    g.font = `800 ${Math.round(40 * k)}px Arial, Helvetica, sans-serif`;
    g.fillText(o.title, 30 * k, 52 * k);
    if (o.subtitle) {
      g.font = `500 ${Math.round(24 * k)}px Arial, Helvetica, sans-serif`;
      g.fillText(o.subtitle, 30 * k, 90 * k);
    }
    g.font = `900 ${Math.round(30 * k)}px 'Arial Black', Arial, sans-serif`;
    g.textAlign = "right"; g.fillText("KORMAN", W - 30 * k, 52 * k);
    g.font = `500 ${Math.round(14 * k)}px Arial, sans-serif`; g.fillText("COMMERCIAL PROPERTIES", W - 30 * k, 78 * k);
    g.textAlign = "left";
  }
  g.drawImage(base, 0, head, W, H);
  if (o.svg) {
    const clone = o.svg.cloneNode(true) as SVGSVGElement;
    // The hover's interior image cannot load inside an SVG drawn as an image.
    clone.querySelectorAll("image, clipPath, defs").forEach((n) => n.remove());
    clone.querySelectorAll("rect[clip-path]").forEach((n) => n.remove());
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", String(W));
    clone.setAttribute("height", String(H));
    clone.removeAttribute("style");
    const xml = new XMLSerializer().serializeToString(clone);
    const url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml" }));
    try { g.drawImage(await loadImage(url), 0, head, W, H); } finally { URL.revokeObjectURL(url); }
  }
  if (legendRows && o.legend) {
    const colW = (W - 60 * k) / 3;
    g.font = `600 ${Math.round(22 * k)}px Arial, Helvetica, sans-serif`;
    o.legend.forEach((l, i) => {
      const x = 30 * k + (i % 3) * colW, y = H + head + 30 * k + Math.floor(i / 3) * 40 * k;
      g.fillStyle = l.color; g.fillRect(x, y, 22 * k, 22 * k);
      g.fillStyle = "#0f172a"; g.fillText(l.label, x + 32 * k, y + 19 * k);
    });
  }
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/png"));
  if (blob) save(blob, `${safe(o.file)}.png`);
}

const isoToDate = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00`) : null);

/** The rent roll AS SHOWN — the rows, filter and order on the card. */
export async function downloadRollXlsx(o: {
  name: string; code: string; rows: RollRow[]; money: boolean; ar: boolean; floors: boolean; filter: string | null; today: Date;
}) {
  const wb = newWorkbook();
  const ws = wb.addWorksheet("Rent Roll", { pageSetup: PRINT_WIDE });
  const cols: { h: string; w: number; fmt?: string }[] = [
    { h: "Tenant", w: 34 }, { h: "Suite", w: 14 }, { h: "SF", w: 10, fmt: FMT.sqft },
    { h: "Lease From", w: 12, fmt: FMT.date }, { h: "Lease To", w: 12, fmt: FMT.date }, { h: "Term Left (mo)", w: 12 },
    ...(o.money ? [{ h: "Base Rent / mo", w: 14, fmt: FMT.money }, { h: "Rent $/SF / yr", w: 13, fmt: FMT.moneyCents }, { h: "Gross / mo", w: 14, fmt: FMT.money }] : []),
    ...(o.ar ? [{ h: "Open A/R", w: 13, fmt: FMT.money }, { h: "Past Due", w: 13, fmt: FMT.money }] : []),
  ];
  let r = titleBlock(ws, {
    entity: o.name, document: "Rent Roll", subtitle: o.filter ? `Filtered: ${o.filter}` : null,
    asOf: `As of ${o.today.toLocaleDateString("en-US")}`, meta: [`Property ${o.code}`], width: cols.length,
  });
  cols.forEach((c, i) => { ws.getColumn(i + 1).width = c.w; });
  headerBand(ws, r, cols.map((c) => c.h));
  const headRow = r;
  r++;
  const first = r;
  for (const { s } of o.rows) {
    const vacant = s.status === "available";
    const vals: (string | number | Date | null)[] = [
      vacant ? "Vacant" : s.tenant, s.unitRefs.join(" + ") || s.id, s.sf || null,
      vacant ? null : isoToDate(s.leaseFrom), vacant ? null : isoToDate(s.leaseTo),
      vacant ? null : monthsLeft(s.leaseTo, o.today),
      ...(o.money ? [s.money?.baseRent ?? null, s.money?.rentPsf ?? null, s.money?.gross ?? null] : []),
      ...(o.ar ? [s.ar?.totalDue ?? null, s.ar?.pastDue ?? null] : []),
    ];
    vals.forEach((v, i) => {
      const cell = ws.getCell(r, i + 1);
      cell.value = v as never;
      cell.font = { name: FONT_NAME, size: 10, italic: vacant && i === 0, color: { argb: vacant && i === 0 ? COLOR.muted : COLOR.text } };
      if (cols[i].fmt) cell.numFmt = cols[i].fmt!;
    });
    r++;
  }
  const last = r - 1;
  if (o.rows.length) {
    ws.getCell(r, 1).value = `Total · ${o.rows.length} suites`;
    totalEmphasis(ws.getCell(r, 1));
    const sumCol = (idx: number, f: (s: StaffSuite) => number) => {
      const L = ws.getColumn(idx).letter;
      const src = o.rows.map((x) => f(x.s) || 0);
      const cell = ws.getCell(r, idx);
      cell.value = liveSum(`${L}${first}:${L}${last}`, src.reduce((a, b) => a + b, 0), src);
      cell.numFmt = cols[idx - 1].fmt ?? "";
      totalEmphasis(cell);
    };
    sumCol(3, (s) => s.sf);
    if (o.money) { sumCol(7, (s) => s.money?.baseRent ?? 0); sumCol(9, (s) => s.money?.gross ?? 0); }
    if (o.ar) { const a = o.money ? 10 : 7; sumCol(a, (s) => s.ar?.totalDue ?? 0); sumCol(a + 1, (s) => s.ar?.pastDue ?? 0); }
    r += 2;
  }
  footNote(ws, r, "From the current rent roll; open A/R from each tenant's newest monthly statement (open charges only). Rent $/SF is annual base rent ÷ the suite's SF.", cols.length);
  freezeAbove(ws, headRow);
  repeatHeader(ws, headRow);
  const buf = await wb.xlsx.writeBuffer();
  save(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `${safe(`${o.code} rent roll${o.filter ? ` - ${o.filter}` : ""}`)}.xlsx`);
}

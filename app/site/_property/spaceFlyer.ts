"use client";

// A LEASING FLYER FOR ANY SPACE (owner, 11/2026: "prompt a download flyer for
// each space"). One landscape page built in the browser from the listing the
// visitor is looking at: the space and its property, the facts, the details,
// the highlighted plan (the floorplate / site plan the listing leads with) and
// a photo, and the leasing contact with the space's own page. jsPDF from our
// own bundle (never a CDN). Every image is drawn through a canvas first, since
// a PDF takes JPEG / PNG and the website's images are WebP and SVG.

import type { SiteImage } from "@/lib/site/content";
import { sizeText, type SpaceListing } from "@/lib/site/spaces";

const NAVY: [number, number, number] = [11, 74, 125];
const INK: [number, number, number] = [16, 24, 40];
const MUTED: [number, number, number] = [71, 84, 103];
const HAIR: [number, number, number] = [228, 231, 236];

type Img = { data: string; w: number; h: number };

/** Load an image (same origin) and re-encode it as a JPEG on white. */
function toJpeg(url: string, maxPx = 1800): Promise<Img | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const w0 = img.naturalWidth || 1600, h0 = img.naturalHeight || 1000;
        const k = Math.min(1, maxPx / Math.max(w0, h0));
        const w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k));
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        const g = c.getContext("2d")!;
        g.fillStyle = "#ffffff"; g.fillRect(0, 0, w, h);
        g.drawImage(img, 0, 0, w, h);
        resolve({ data: c.toDataURL("image/jpeg", 0.88), w, h });
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Fit an image inside a box, centred (contain) or filling it (cover, clipped). */
function place(doc: any, im: Img, x: number, y: number, w: number, h: number, cover: boolean) {
  const r = Math.min(w / im.w, h / im.h);
  const R = Math.max(w / im.w, h / im.h);
  if (!cover) {
    const dw = im.w * r, dh = im.h * r;
    doc.addImage(im.data, "JPEG", x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    return;
  }
  const dw = im.w * R, dh = im.h * R;
  doc.saveGraphicsState();
  doc.rect(x, y, w, h, null);
  doc.clip();
  doc.discardPath();
  doc.addImage(im.data, "JPEG", x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  doc.restoreGraphicsState();
}

const isPlan = (url: string) => /floorplate|floorplan|floor-plan|plan-|site-?plan|campus-map|\.svg($|\?)/i.test(url);

export async function downloadSpaceFlyer(l: SpaceListing, pageUrl: string) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const W = 792, H = 612, M = 36;

  // Band
  doc.setFillColor(...NAVY); doc.rect(0, 0, W, 64, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.text("KORMAN", M, 40);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
  doc.text("COMMERCIAL", M + 96, 34); doc.text("PROPERTIES", M + 96, 44);
  doc.setFont("helvetica", "bold"); doc.setFontSize(13);
  doc.text(`${l.category === "retail" ? "RETAIL" : l.category === "office" ? "OFFICE" : ""} SPACE FOR LEASE`.trim(), W - M, 39, { align: "right" });

  // Title
  doc.setTextColor(...INK); doc.setFont("helvetica", "bold"); doc.setFontSize(24);
  doc.text(doc.splitTextToSize(l.space, 300)[0], M, 104);
  doc.setFont("helvetica", "normal"); doc.setFontSize(12.5); doc.setTextColor(...MUTED);
  doc.text(doc.splitTextToSize(`${l.propertyName}${l.city ? ` · ${l.city}` : ""}`, 300), M, 124);

  // Size, big
  doc.setTextColor(...NAVY); doc.setFont("helvetica", "bold"); doc.setFontSize(22);
  doc.text(sizeText(l), M, 166);

  // Facts
  const facts: [string, string | null | undefined][] = [
    ["Rental rate", l.rentalRate], ["Rent type", l.rentType], ["Term", l.term],
    ["Use", l.spaceUse], ["Condition", l.condition], ["Available", l.available],
  ];
  let y = 192;
  doc.setFontSize(10);
  for (const [k, v] of facts) {
    if (!v || !String(v).trim()) continue;
    doc.setDrawColor(...HAIR); doc.line(M, y + 6, M + 300, y + 6);
    doc.setFont("helvetica", "normal"); doc.setTextColor(...MUTED); doc.text(k.toUpperCase(), M, y);
    doc.setFont("helvetica", "bold"); doc.setTextColor(...INK); doc.text(doc.splitTextToSize(String(v), 190)[0], M + 300, y, { align: "right" });
    y += 22;
  }

  // Details
  const details = (l.details ?? []).map((d) => d.text).filter(Boolean);
  if (details.length) {
    y += 8;
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...NAVY); doc.text("DETAILS", M, y);
    y += 16;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(...INK);
    for (const t of details) {
      const lines = doc.splitTextToSize(t, 288);
      if (y + lines.length * 13 > 520) break;
      doc.text("•", M, y); doc.text(lines, M + 12, y);
      y += lines.length * 13 + 4;
    }
  }

  // Images: the plan large, a photo under it
  const imgs: SiteImage[] = l.images ?? [];
  const plan = imgs.find((i) => isPlan(i.url)) ?? imgs[0];
  const photo = imgs.find((i) => i !== plan && !isPlan(i.url));
  const X = 360, IW = W - M - X;
  const [a, b] = await Promise.all([plan ? toJpeg(plan.url) : null, photo ? toJpeg(photo.url, 1400) : null]);
  if (a) {
    const h = b ? 268 : 432;
    doc.setDrawColor(...HAIR); doc.rect(X, 84, IW, h);
    place(doc, a, X + 4, 88, IW - 8, h - 8, !isPlan(plan!.url));
  }
  if (b) place(doc, b, X, a ? 362 : 84, IW, a ? 154 : 432, true);

  // Contact band
  doc.setFillColor(244, 246, 249); doc.rect(0, 532, W, 80, "F");
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...MUTED);
  doc.text("LEASING CONTACT", M, 556);
  doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(...INK);
  doc.text(l.contactName || "Korman Commercial Properties", M, 575);
  doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(...NAVY);
  doc.text([l.contactPhone, l.requestMoreInfoEmail].filter(Boolean).join("   ·   "), M, 593);
  doc.setFontSize(9); doc.setTextColor(...MUTED);
  doc.text("See this space online", W - M, 566, { align: "right" });
  doc.setTextColor(...NAVY); doc.textWithLink(pageUrl.replace(/^https?:\/\//, ""), W - M, 580, { url: pageUrl, align: "right" });
  doc.setTextColor(...MUTED); doc.setFontSize(7.5);
  doc.text("Information is believed accurate but not guaranteed; subject to change or withdrawal without notice.", W - M, 598, { align: "right" });

  const name = `${l.propertyName} - ${l.space} - Leasing Flyer.pdf`.replace(/[\\/:*?"<>|]+/g, " ");
  doc.save(name);
}

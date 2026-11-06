// Shared branding for the financial PDF/Excel exports.
//
// public/korman-logo.svg is pure text (no rasterizer is bundled), so the PDF
// logo is reproduced with pdf-lib text: the "KORMAN" wordmark, a divider, then
// "COMMERCIAL / PROPERTIES" stacked — matching the SVG lockup. Excel uses the
// flat KORMAN_TEXT wordmark (cell images would need a raster asset).

import "server-only";
import { type PDFPage, type PDFFont, type RGB } from "pdf-lib";

export const KORMAN_TEXT = "KORMAN  COMMERCIAL PROPERTIES";

/** Draw the Korman lockup, right-aligned so it ends at `xRight`, vertically
 *  centered at `centerTop` (distance from the page top). Returns its width. */
export function drawKormanLogo(
  page: PDFPage,
  bold: PDFFont,
  font: PDFFont,
  opts: { xRight: number; centerTop: number; color: RGB; scale?: number },
): number {
  const s = opts.scale ?? 1;
  const H = page.getHeight();
  const kSize = 18 * s;
  const capSize = 6.5 * s;
  const gap = 5 * s;
  const kW = bold.widthOfTextAtSize("KORMAN", kSize);
  const capW = Math.max(font.widthOfTextAtSize("COMMERCIAL", capSize), font.widthOfTextAtSize("PROPERTIES", capSize));
  const total = kW + gap + 1.5 + gap + capW;
  const x = opts.xRight - total;
  const cy = opts.centerTop;
  // KORMAN — baseline below the center so the cap-height straddles it.
  page.drawText("KORMAN", { x, y: H - (cy + kSize * 0.36), size: kSize, font: bold, color: opts.color });
  const divX = x + kW + gap;
  page.drawLine({ start: { x: divX, y: H - (cy + 9 * s) }, end: { x: divX, y: H - (cy - 9 * s) }, thickness: 1.2 * s, color: opts.color });
  const capX = divX + 1.5 + gap;
  page.drawText("COMMERCIAL", { x: capX, y: H - (cy - 0.5 * s), size: capSize, font, color: opts.color });
  page.drawText("PROPERTIES", { x: capX, y: H - (cy + capSize + 2.5 * s), size: capSize, font, color: opts.color });
  return total;
}

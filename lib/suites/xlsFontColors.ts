// The FONT COLOUR of each text cell in a BIFF8 .xls (Excel 97-2003) — the one
// thing SheetJS reads and then drops. Skyline's occupant Email List says which
// address is which ONLY by colour (black = the General tab's main address,
// blue = Correspondence, green = Other Billing), so the import reads the
// workbook's own records: FONT (colour index), XF (→ font) and the cells of
// the first worksheet (row, column → XF).
//
// Pure: bytes in, "row:col" → palette colour index out (empty when the file
// is not a BIFF8 workbook). Rows and columns are 0-based, as SheetJS counts.

import * as XLSX from "xlsx";

const BOF = 0x0809, FONT = 0x0031, XF = 0x00e0;
const LABELSST = 0x00fd, LABEL = 0x0204, RSTRING = 0x00d6;

function workbookStream(buf: Uint8Array): Uint8Array | null {
  try {
    const cfb = XLSX.CFB.read(buf, { type: "buffer" });
    const e = XLSX.CFB.find(cfb, "Workbook") ?? XLSX.CFB.find(cfb, "Book");
    const c = e?.content as unknown;
    if (!c) return null;
    return c instanceof Uint8Array ? c : Uint8Array.from(c as number[]);
  } catch {
    return null;
  }
}

export function xlsFontColors(bytes: ArrayBuffer | Uint8Array): Map<string, number> {
  const out = new Map<string, number>();
  const s = workbookStream(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  if (!s) return out;
  const u16 = (o: number) => s[o] | (s[o + 1] << 8);
  const fonts: number[] = [];
  const xfFont: number[] = [];
  let bofs = 0;
  let o = 0;
  while (o + 4 <= s.length) {
    const id = u16(o), len = u16(o + 2), d = o + 4;
    if (d + len > s.length) break;
    if (id === BOF) {
      bofs++;
      if (bofs > 2) break; // globals, then the first sheet only
    } else if (bofs === 1 && id === FONT && len >= 6) {
      fonts.push(u16(d + 4));
    } else if (bofs === 1 && id === XF && len >= 2) {
      xfFont.push(u16(d));
    } else if (bofs === 2 && (id === LABELSST || id === LABEL || id === RSTRING) && len >= 6) {
      const row = u16(d), col = u16(d + 2), ixfe = u16(d + 4);
      const f = xfFont[ixfe];
      if (f == null) { o = d + len; continue; }
      // BIFF has no font 4: index 5 and up are one place earlier in the list.
      const font = fonts[f >= 4 ? f - 1 : f];
      if (font != null) out.set(`${row}:${col}`, font);
    }
    o = d + len;
  }
  return out;
}

import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { xlsFontColors } from "./xlsFontColors";

// A minimal BIFF8 workbook built record by record — synthetic, never a real
// Skyline export. Fonts: 0..3 black, (no font 4), 5 blue, 6 green.
const CFB = (XLSX as any).CFB ?? (XLSX as any).default.CFB;
const rec = (id: number, body: number[]) => [id & 255, id >> 8, body.length & 255, body.length >> 8, ...body];
const u16 = (n: number) => [n & 255, n >> 8];
const font = (color: number) => [...u16(200), 0, 0, ...u16(color), ...u16(400), 0, 0, 0, 0, 0, 0];
const xf = (fontIx: number) => [...u16(fontIx), ...new Array(18).fill(0)];
const cell = (row: number, col: number, ixfe: number) => rec(0x00fd, [...u16(row), ...u16(col), ...u16(ixfe), 0, 0, 0, 0]);

function workbook(): Uint8Array {
  const globals = [
    ...rec(0x0809, [...u16(0x600), ...u16(5), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    ...rec(0x0031, font(8)), ...rec(0x0031, font(8)), ...rec(0x0031, font(8)), ...rec(0x0031, font(8)),
    ...rec(0x0031, font(12)), ...rec(0x0031, font(17)),
    ...rec(0x00e0, xf(0)), ...rec(0x00e0, xf(5)), ...rec(0x00e0, xf(6)),
    ...rec(0x000a, []),
  ];
  const sheet = [
    ...rec(0x0809, [...u16(0x600), ...u16(0x10), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    ...cell(8, 3, 0), ...cell(10, 3, 1), ...cell(11, 3, 2),
    ...rec(0x000a, []),
  ];
  const cfb = CFB.utils.cfb_new();
  CFB.utils.cfb_add(cfb, "Workbook", Uint8Array.from([...globals, ...sheet]));
  return CFB.write(cfb, { type: "buffer" }) as Uint8Array;
}

describe("xlsFontColors", () => {
  it("reads each text cell's font colour, skipping BIFF's missing font 4", () => {
    const c = xlsFontColors(workbook());
    expect(c.get("8:3")).toBe(8);
    expect(c.get("10:3")).toBe(12);
    expect(c.get("11:3")).toBe(17);
  });
  it("is empty, not an error, for a file that is not BIFF", () => {
    expect(xlsFontColors(new Uint8Array([1, 2, 3])).size).toBe(0);
  });
});

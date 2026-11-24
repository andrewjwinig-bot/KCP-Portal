import {
  newWorkbook, titleBlock, headerBand, footNote, freezeAbove, repeatHeader,
  liveSum, totalEmphasis, COLOR, FMT, FONT_NAME, PRINT_WIDE,
} from "@/lib/excel/theme";
import type { RentRollProperty, RentRollUnit } from "./parseRentRollExcel";
import { amenityFor } from "./amenities";

/**
 * One property's rent roll, as the workbook a lender or a broker asks for.
 *
 * The columns are the ones the Rent Roll page shows, in the same order — a
 * download that reorders or renames them makes the screen and the file two
 * things to reconcile. "INS" is `otherMonth`, matching the page.
 *
 * Built on the shared workbook theme, so it opens looking like the balance
 * sheet and the operating statement that go in the same lender package — it
 * used to be a bare grid, because SheetJS community edition cannot style a
 * cell at all. Per the Excel rule the TOTAL row is live `=SUM()` over the
 * exact rows above it, so deleting a tenant or editing a figure reflows the
 * total instead of leaving a stale number that no longer ties.
 */

/** Columns, in page order. `sum` marks a column the total row adds up; `fmt`
 *  is its Excel number format. */
type RollColumn = { header: string; width: number; sum?: boolean; fmt?: string };

const COLUMNS: RollColumn[] = [
  { header: "Tenant", width: 34 },
  { header: "Unit", width: 14 },
  { header: "Sq Ft", width: 10, sum: true, fmt: FMT.number },
  { header: "Lease From", width: 12 },
  { header: "Lease To", width: 12 },
  { header: "Ann. $/SF", width: 11, fmt: FMT.numberCents },
  { header: "Base Rent", width: 13, sum: true, fmt: FMT.moneyCents },
  { header: "CAM", width: 12, sum: true, fmt: FMT.moneyCents },
  { header: "INS", width: 12, sum: true, fmt: FMT.moneyCents },
  { header: "RET", width: 12, sum: true, fmt: FMT.moneyCents },
  { header: "Gross", width: 13, sum: true, fmt: FMT.moneyCents },
];

const round2 = (n: number) => Math.round(n * 100) / 100;

function rowFor(u: RentRollUnit): (string | number)[] {
  // Amenity space (training room, conference centre) counts as occupied for SF
  // but is not a tenant — labelled as itself rather than left looking vacant.
  const amenity = u.amenity ?? amenityFor(u.unitRef);
  const tenant = amenity ? amenity.label : (u.isVacant ? "VACANT" : u.occupantName);
  return [
    tenant,
    u.unitRef,
    u.sqft || 0,
    u.leaseFrom ?? "",
    u.leaseTo ?? "",
    round2(u.annualRentPerSqft || 0),
    round2(u.baseRent || 0),
    round2(u.opexMonth || 0),
    round2(u.otherMonth || 0),
    round2(u.reTaxMonth || 0),
    round2(u.grossRentTotal || 0),
  ];
}

export async function buildPropertyRollXlsx(
  prop: RentRollProperty,
  propertyName: string,
  asOf: string | null,
): Promise<Buffer> {
  const wb = newWorkbook();
  // Excel forbids \ / ? * [ ] : in a sheet name and caps it at 31 characters.
  const safe = `${prop.propertyCode} Rent Roll`.replace(/[\\/?*[\]:]/g, "-").slice(0, 31);
  const ws = wb.addWorksheet(safe, { pageSetup: { ...PRINT_WIDE } });
  ws.columns = COLUMNS.map((c) => ({ width: c.width }));

  const headerRow = titleBlock(ws, {
    entity: `${prop.propertyCode} — ${propertyName}`,
    document: "Rent Roll",
    // No date is claimed when none is known — a rent roll with a confident
    // wrong as-of is worse than one that admits it doesn't say.
    asOf: asOf ? `As of ${asOf}` : null,
    width: COLUMNS.length,
  });
  headerBand(ws, headerRow, COLUMNS.map((c) => c.header));

  const body = prop.units.map(rowFor);
  const firstBody = headerRow + 1;
  body.forEach((values, i) => {
    const row = ws.getRow(firstBody + i);
    values.forEach((v, c) => {
      const cell = row.getCell(c + 1);
      cell.value = v === "" ? null : v;
      cell.font = { name: FONT_NAME, size: 10, color: { argb: COLOR.text } };
      const fmt = COLUMNS[c].fmt;
      if (fmt && typeof v === "number") { cell.numFmt = fmt; cell.alignment = { horizontal: "right" }; }
    });
    // A quiet band every other row, so the eye doesn't slip a line across
    // eleven columns.
    if (i % 2 === 1) for (let c = 1; c <= COLUMNS.length; c++) {
      row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.zebra } };
    }
  });

  const lastBody = firstBody + body.length - 1;
  if (body.length > 0) {
    const totalRow = ws.getRow(lastBody + 1);
    const label = totalRow.getCell(1);
    label.value = `Total · ${body.length} unit${body.length === 1 ? "" : "s"}`;
    totalEmphasis(label);
    for (let c = 0; c < COLUMNS.length; c++) {
      const col = COLUMNS[c];
      const cell = totalRow.getCell(c + 1);
      if (c > 0) totalEmphasis(cell);
      // A rate column is deliberately NOT totalled: adding two $/SF figures
      // produces a number that means nothing.
      if (!col.sum) continue;
      const L = ws.getColumn(c + 1).letter;
      const sources = body.map((r) => (typeof r[c] === "number" ? (r[c] as number) : 0));
      cell.value = liveSum(`${L}${firstBody}:${L}${lastBody}`, round2(sources.reduce((s, v) => s + v, 0)), sources);
      cell.numFmt = col.fmt;
      cell.alignment = { horizontal: "right" };
    }
  }

  // The header stays put while a long roll scrolls, and repeats on every
  // printed page — a rent roll runs to several.
  freezeAbove(ws, headerRow);
  repeatHeader(ws, headerRow);

  footNote(
    ws,
    lastBody + (body.length > 0 ? 3 : 2),
    "Rent roll as carried in Skyline. Monthly figures; Ann. $/SF is annualised base rent per square foot. " +
    "CAM, INS and RET are the escrows currently billed, not reconciled amounts. Unaudited.",
    COLUMNS.length,
    30,
  );

  return Buffer.from(await wb.xlsx.writeBuffer());
}

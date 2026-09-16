import * as XLSX from "xlsx";
import type { RentRollProperty, RentRollUnit } from "./parseRentRollExcel";
import { amenityFor } from "./amenities";

/**
 * One property's rent roll, as the workbook a lender or a broker asks for.
 *
 * The columns are the ones the Rent Roll page shows, in the same order — a
 * download that reorders or renames them makes the screen and the file two
 * things to reconcile. "INS" is `otherMonth`, matching the page.
 *
 * Per the Excel rule the TOTAL row is live `=SUM()` over the exact rows above
 * it, so deleting a tenant or editing a figure reflows the total instead of
 * leaving a stale number that no longer ties.
 */

/** Columns, in page order. `sum` marks a column the total row adds up; `fmt`
 *  is its Excel number format. */
type RollColumn = { header: string; width: number; sum?: boolean; fmt?: string };

const COLUMNS: RollColumn[] = [
  { header: "Tenant", width: 34 },
  { header: "Unit", width: 14 },
  { header: "Sq Ft", width: 10, sum: true, fmt: "#,##0" },
  { header: "Lease From", width: 12 },
  { header: "Lease To", width: 12 },
  { header: "Ann. $/SF", width: 11, fmt: "#,##0.00" },
  { header: "Base Rent", width: 13, sum: true, fmt: "#,##0.00" },
  { header: "CAM", width: 12, sum: true, fmt: "#,##0.00" },
  { header: "INS", width: 12, sum: true, fmt: "#,##0.00" },
  { header: "RET", width: 12, sum: true, fmt: "#,##0.00" },
  { header: "Gross", width: 13, sum: true, fmt: "#,##0.00" },
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

export function buildPropertyRollXlsx(
  prop: RentRollProperty,
  propertyName: string,
  asOf: string | null,
): Buffer {
  const units = prop.units;
  const title = [`${prop.propertyCode} — ${propertyName}`];
  const stamp = [asOf ? `Rent roll as of ${asOf}` : "Rent roll"];
  const blank: string[] = [];
  const header = COLUMNS.map((c) => c.header);
  const body = units.map(rowFor);

  const aoa: (string | number)[][] = [title, stamp, blank, header, ...body];
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // 0-indexed sheet rows. Body starts right after the header row.
  const headerRow = 3;
  const firstBody = headerRow + 1;
  const lastBody = firstBody + body.length - 1;
  const totalRow = lastBody + 1;

  for (let c = 0; c < COLUMNS.length; c++) {
    const col = COLUMNS[c];
    if (col.fmt) {
      for (let r = firstBody; r <= lastBody; r++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (cell && cell.t === "n") cell.z = col.fmt;
      }
    }
  }

  if (body.length > 0) {
    const label = XLSX.utils.encode_cell({ r: totalRow, c: 0 });
    ws[label] = { t: "s", v: `Total · ${body.length} unit${body.length === 1 ? "" : "s"}` };
    for (let c = 0; c < COLUMNS.length; c++) {
      const col = COLUMNS[c];
      if (!col.sum) continue;
      const colLetter = XLSX.utils.encode_col(c);
      // The cached value is what shows before Excel recalculates, so it has to
      // be the JS total rather than left blank.
      const cached = round2(body.reduce((s, r) => s + (typeof r[c] === "number" ? (r[c] as number) : 0), 0));
      ws[XLSX.utils.encode_cell({ r: totalRow, c })] = {
        t: "n",
        f: `SUM(${colLetter}${firstBody + 1}:${colLetter}${lastBody + 1})`,
        v: cached,
        z: col.fmt,
      };
    }
    ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: totalRow, c: COLUMNS.length - 1 } });
  }

  ws["!cols"] = COLUMNS.map((c) => ({ wch: c.width }));
  // The header row stays put while a long roll scrolls.
  ws["!freeze"] = { xSplit: "0", ySplit: String(firstBody), topLeftCell: `A${firstBody + 1}`, activePane: "bottomLeft", state: "frozen" };

  const wb = XLSX.utils.book_new();
  // Excel forbids \ / ? * [ ] : in a sheet name and caps it at 31 characters.
  const safe = `${prop.propertyCode} Rent Roll`.replace(/[\\/?*[\]:]/g, "-").slice(0, 31);
  XLSX.utils.book_append_sheet(wb, ws, safe);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

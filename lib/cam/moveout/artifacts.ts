// Server-side move-out artifacts: the final statement PDF and the single-tenant
// GL entry (Skyline charge rows). Built from a shared computed statement so the
// approval email, the finalize step, and the on-screen worksheet all render the
// same numbers. jsPDF runs fine in Node (same as the public statement routes).

import "server-only";
import { jsPDF } from "jspdf";
import { drawRetailStatement } from "@/lib/cam/retail/statementPdf";
import { drawTenantStatement } from "@/lib/cam/office/statementPdf";
import { chargeRowsToCSV, type SkylineChargeRow } from "@/lib/cam/office/exports";
import type { MoveoutOk } from "./compute";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
type Ok = MoveoutOk;
const safe = (s: string) => s.replace(/[^\w]+/g, "_");
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Filename stem, e.g. "3610_2026_Suite203_Acme_Interim_CAM_RET". */
export function moveoutFileBase(c: Ok): string {
  const { meta, result } = c;
  const cats = c.kind === "retail" ? "CAM_INS_RET" : "CAM_RET";
  return `${meta.property}_${meta.year}_Suite${safe(result.suite)}_${safe(result.name)}_Final_${cats}`;
}

/** The final move-out statement as a branded PDF (Buffer). Same drawing routine
 *  and footnotes as the interim worksheet's "Download PDF". */
export function buildMoveoutPdf(c: Ok): Buffer {
  const { meta } = c;
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const propLabel = `${meta.property} — ${meta.propertyName}`;
  const asOf = `${MONTHS[c.result.asOfMonth - 1]} ${meta.year}`;
  const occ = c.result.occupiedMonths;
  const unpostedNote = c.result.unpostedMonths > 0
    ? [`${c.result.unpostedMonths} occupied month(s) are not yet posted to the GL — figures are through the latest posted month.`]
    : [];

  if (c.kind === "retail") {
    drawRetailStatement(doc, c.result, meta.year, propLabel, undefined, {
      subtitle: `Final Move-Out Statement · as of ${asOf}`,
      footerRight: `Move-Out CAM / INS / RET · Suite ${c.result.suite}`,
      footnotes: [
        `Final reconciliation for the ${occ} occupied month${occ > 1 ? "s" : ""} of ${meta.year}: CAM is live YTD GL actuals; INS & RET prorate the property pool to the occupied months.`,
        ...unpostedNote,
      ],
    });
  } else {
    drawTenantStatement(doc, c.result, meta.year, propLabel, undefined, {
      subtitle: `Final Move-Out Statement · as of ${asOf}`,
      baseColLabel: `B/Y ${c.result.noBaseStop ? "—" : c.result.baseYear} ×${occ}/12`,
      actualColLabel: `${MONTHS[c.result.asOfMonth - 1].slice(0, 3)} YTD`,
      footerRight: `Move-Out CAM / RET · Suite ${c.result.suite}`,
      footnotes: [
        `Final reconciliation for the ${occ} occupied month${occ > 1 ? "s" : ""} of ${meta.year}; the base year is prorated to the same period.`,
        ...unpostedNote,
      ],
    });
  }
  return Buffer.from(doc.output("arraybuffer"));
}

/** Skyline charge rows for a single departing tenant's true-up: YEC/YEI/YER
 *  (retail) or YEC/YER (office). Same codes/format as the year-end adjustments
 *  upload so staff post it the same way, just for one unit. */
export function moveoutGlRows(c: Ok, effectiveDateISO: string): SkylineChargeRow[] {
  const { meta } = c;
  const unit = `${meta.unitRef}-CU`;
  const mk = (seq: number, code: string, label: string, amount: number): SkylineChargeRow => ({
    unit, seq, chargeCode: code, chargeDescription: `${meta.year} ${label}`, freq: "O",
    effectiveDate: effectiveDateISO, endDate: "", amount: round2(amount),
  });
  if (c.kind === "retail") {
    return [
      mk(2, "YEC", "Move-Out CAM Adjustment", c.result.camBalance),
      mk(3, "YEI", "Move-Out INS Adjustment", c.result.insBalance),
      mk(4, "YER", "Move-Out RET Adjustment", c.result.retBalance),
    ];
  }
  return [
    mk(2, "YEC", "Move-Out CAM Adjustment", c.result.opexBalance),
    mk(3, "YER", "Move-Out RET Adjustment", c.result.retBalance),
  ];
}

/** The GL entry as a Skyline import CSV (no header, $0 rows dropped) — the
 *  internal reference staff load to post the adjustment. */
export function buildMoveoutGlCsv(c: Ok, effectiveDateISO: string): string {
  return chargeRowsToCSV(moveoutGlRows(c, effectiveDateISO), true);
}

/** Effective posting date for the true-up: the move-out date when known, else
 *  the last day of the as-of month. */
export function moveoutEffectiveDate(c: Ok): string {
  const m = c.meta.leaseTo?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  const mm = c.meta.asOfMonth;
  const lastDay = new Date(c.meta.year, mm, 0).getDate();
  return `${c.meta.year}-${String(mm).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

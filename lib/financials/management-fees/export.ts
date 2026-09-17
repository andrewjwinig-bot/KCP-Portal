// Management Fees Excel export — the building × month grid + the Actual-vs-Budget
// summary, built client-side from the data already on the page. Per the workbook
// convention, every total (per-building YTD column sums, per-month portfolio row
// sums, the grand total, and the summary variance) is a live formula so an edited
// figure flows through; the JS-computed value is cached so it shows before Excel
// recalcs.

import * as XLSX from "xlsx";
import type { MgmtFeeData } from "./compute";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const cell = (c: number, r: number) => XLSX.utils.encode_cell({ c, r });

export function exportManagementFeesXlsx(data: MgmtFeeData): void {
  const { buildings, portfolio, year, completeThrough } = data;
  const hasLik = !!portfolio.likPlanMonthly;
  const nB = buildings.length;

  // ── Grid: label | building codes… | Total ────────────────────────────────
  const aoa: (string | number | "")[][] = [];
  aoa.push([`Management Fees — ${year}`]);
  aoa.push([`Account 6610 · pulled from the posted GL${completeThrough ? ` · posted through ${MONTHS[completeThrough - 1]}` : ""}`]);
  aoa.push([]);
  const headerRow = ["", ...buildings.map((b) => b.code), "Total"];
  aoa.push(headerRow);

  const gridFirstRow = aoa.length; // 0-based row index of the first month row
  for (let m = 0; m < 12; m++) {
    const row: (string | number | "")[] = [MONTHS[m]];
    for (const b of buildings) row.push(m + 1 <= b.maxPosted ? b.feeMonthly[m] : "");
    row.push(portfolio.actualMonthly[m] || ""); // filled by a formula below
    aoa.push(row);
  }
  const ytdRowIdx = aoa.length;
  aoa.push(["YTD Totals", ...buildings.map((b) => b.ytdActual), portfolio.ytdActual]);

  // ── Summary: Month | Actual | Budget (bottom-up) | LIK plan | Variance % ──
  aoa.push([]);
  const sumTitleRow = aoa.length;
  aoa.push(["Actual vs Budget"]);
  const sumHeader = ["Month", "Actual", "Budget (bottom-up)", ...(hasLik ? ["LIK 2010 Plan"] : []), "Variance %"];
  aoa.push(sumHeader);
  const sumFirstRow = aoa.length;
  for (let m = 0; m < 12; m++) {
    const actual = completeThrough && m + 1 <= completeThrough ? portfolio.actualMonthly[m] : "";
    const bud = portfolio.budgetBottomUpMonthly[m];
    const row: (string | number | "")[] = [MONTHS[m], actual, bud];
    if (hasLik) row.push(portfolio.likPlanMonthly![m]);
    row.push(""); // variance — formula below
    aoa.push(row);
  }
  const sumTotalRow = aoa.length;
  aoa.push(["Total", portfolio.ytdActual, portfolio.annualBudgetBottomUp, ...(hasLik ? [portfolio.likPlanAnnual ?? 0] : []), ""]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Grid formulas: per-month portfolio total (row sum across building cols) and
  // per-building YTD (column sum of the 12 months) + grand total.
  const totalCol = nB + 1;
  for (let m = 0; m < 12; m++) {
    const r = gridFirstRow + m;
    ws[cell(totalCol, r)] = { t: "n", f: `SUM(${cell(1, r)}:${cell(nB, r)})`, v: portfolio.actualMonthly[m] };
  }
  buildings.forEach((b, i) => {
    const c = i + 1;
    ws[cell(c, ytdRowIdx)] = { t: "n", f: `SUM(${cell(c, gridFirstRow)}:${cell(c, gridFirstRow + 11)})`, v: b.ytdActual };
  });
  ws[cell(totalCol, ytdRowIdx)] = { t: "n", f: `SUM(${cell(1, ytdRowIdx)}:${cell(nB, ytdRowIdx)})`, v: portfolio.ytdActual };

  // Summary variance % = Actual/Budget − 1 (guarded against a blank/zero budget).
  const budCol = 2;
  const varCol = hasLik ? 4 : 3;
  for (let m = 0; m < 12; m++) {
    const r = sumFirstRow + m;
    const actual = portfolio.actualMonthly[m];
    const bud = portfolio.budgetBottomUpMonthly[m];
    const complete = completeThrough && m + 1 <= completeThrough;
    if (complete && bud) {
      ws[cell(varCol, r)] = { t: "n", f: `IF(${cell(budCol, r)}=0,"",${cell(1, r)}/${cell(budCol, r)}-1)`, v: actual / bud - 1, z: "0.0%" };
    }
  }
  // Summary totals: sum the month columns; variance from the totals.
  ws[cell(1, sumTotalRow)] = { t: "n", f: `SUM(${cell(1, sumFirstRow)}:${cell(1, sumFirstRow + 11)})`, v: portfolio.ytdActual };
  ws[cell(budCol, sumTotalRow)] = { t: "n", f: `SUM(${cell(budCol, sumFirstRow)}:${cell(budCol, sumFirstRow + 11)})`, v: portfolio.annualBudgetBottomUp };
  if (portfolio.annualBudgetBottomUp) {
    ws[cell(varCol, sumTotalRow)] = { t: "n", f: `IF(${cell(budCol, sumTotalRow)}=0,"",${cell(1, sumTotalRow)}/${cell(budCol, sumTotalRow)}-1)`, v: portfolio.ytdActual / portfolio.annualBudgetBottomUp - 1, z: "0.0%" };
  }

  // Column widths.
  ws["!cols"] = [{ wch: 14 }, ...buildings.map(() => ({ wch: 9 })), { wch: 12 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Management Fees");
  XLSX.writeFile(wb, `Management_Fees_${year}.xlsx`);
}

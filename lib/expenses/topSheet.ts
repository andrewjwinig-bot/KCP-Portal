import ExcelJS from "exceljs";

export type TopSheetTx = {
  date: string;
  cardMember: string;
  description: string;
  codedDescription: string;
  amount: number;
  originalAmount?: number;
  category: string;
  propertyId: string;
  propertyName: string;
  suite: string;
};

export type BuildTopSheetArgs = {
  statementPeriodText: string;
  statementMonth: string;
  periodCompact?: string;      // MM/DD/YY-MM/DD/YY
  processedBy?: string;        // user who ran the batch
  processedAt?: string;        // display date; defaults to today
  tx: TopSheetTx[];
  propertyOrder: { id: string; name: string }[];
  categoryOrder: string[]; // preferred column order for the Summary sheet
  // When set, adds a note to the Summary sheet flagging the reimbursement
  // invoice included in the batch (Harry fronts the whole statement).
  reimbursement?: { vendorCode: string; payeeName: string; total: number };
};

const TEAL = "FF0A4655";
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: TEAL } };
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" } };
const MONEY_FMT = '$#,##0.00';

/** 1-indexed column number → letter (1→A, 27→AA). */
function colLetter(n: number): string {
  let s = "";
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function formatStatementMonth(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  if (!y || !m) return yyyymm;
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
}

// Presentation-ready TOP SHEET: a Charges detail sheet + a formula-driven
// Summary. The Summary's per-cell figures are SUMIFS back into the Charges
// sheet (so the two always reconcile), row/column totals are SUM formulas, and
// a reference header records the period, who processed it, and when.
export async function buildTopSheetXlsx(args: BuildTopSheetArgs): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "KCP Portal";

  // ── Sheet 1: Charges ──────────────────────────────────────────────────────
  const sortedTx = [...args.tx].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : a.propertyId.localeCompare(b.propertyId)
  );
  const ch = wb.addWorksheet("Charges", { views: [{ state: "frozen", ySplit: 1 }] });
  const chHeaders = ["Date", "Card Member", "Description", "Invoice Description", "Category", "Property", "Property Name", "Suite", "Original Amount", "Amount"];
  ch.addRow(chHeaders);
  for (const t of sortedTx) {
    ch.addRow([
      t.date, t.cardMember, t.description, t.codedDescription, t.category,
      t.propertyId, t.propertyName, t.suite || "",
      t.originalAmount !== undefined ? t.originalAmount : t.amount, t.amount,
    ]);
  }
  ch.columns.forEach((c, i) => { c.width = [12, 18, 42, 42, 16, 10, 30, 8, 15, 12][i] ?? 14; });
  ch.getColumn(9).numFmt = MONEY_FMT;
  ch.getColumn(10).numFmt = MONEY_FMT;
  ch.getRow(1).eachCell((cell) => { cell.font = HEADER_FONT; cell.fill = HEADER_FILL; });

  const N = sortedTx.length;
  const N1 = N + 1;                      // last Charges data row
  const CH_SUM = `Charges!$J$2:$J$${N1}`; // Amount
  const CH_PROP = `Charges!$F$2:$F$${N1}`; // Property
  const CH_CAT = `Charges!$E$2:$E$${N1}`;  // Category

  // ── Sheet 2: Summary ──────────────────────────────────────────────────────
  const allCatSet = new Set(args.tx.map((t) => t.category).filter(Boolean));
  const orderedCats = [
    ...args.categoryOrder.filter((c) => allCatSet.has(c)),
    ...[...allCatSet].filter((c) => !args.categoryOrder.includes(c)),
  ];
  const totalsByProp = new Set(args.tx.filter((t) => t.propertyId && t.category).map((t) => t.propertyId));
  const activeProps = args.propertyOrder.filter((p) => totalsByProp.has(p.id));

  const catCount = orderedCats.length;
  const firstCatCol = 3;                       // A=Property, B=Property Name, C…=categories
  const lastCatCol = 2 + catCount;
  const totalCol = 3 + catCount;               // TOTAL column
  const totalColL = colLetter(totalCol);
  const lastColL = totalColL;

  const sm = wb.addWorksheet("Summary");

  // Reference header block (period + who/when processed).
  const processedAt = args.processedAt || new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  const periodStr = args.periodCompact || args.statementPeriodText || formatStatementMonth(args.statementMonth);
  const title = sm.addRow([`Credit Card Expenses — Period ${periodStr}`]);
  title.getCell(1).font = { bold: true, size: 14, color: { argb: TEAL } };
  const sub = sm.addRow([`Statement: ${formatStatementMonth(args.statementMonth)}`]);
  sub.getCell(1).font = { size: 10, color: { argb: "FF555555" } };
  const proc = sm.addRow([`Processed ${processedAt}${args.processedBy ? ` by ${args.processedBy}` : ""}`]);
  proc.getCell(1).font = { size: 10, italic: true, color: { argb: "FF555555" } };
  sm.mergeCells(1, 1, 1, totalCol);
  sm.mergeCells(2, 1, 2, totalCol);
  sm.mergeCells(3, 1, 3, totalCol);
  sm.addRow([]);

  const HEADER_ROW = 5;
  const headerRow = sm.addRow(["Property", "Property Name", ...orderedCats, "TOTAL"]);
  headerRow.eachCell((cell) => { cell.font = HEADER_FONT; cell.fill = HEADER_FILL; });

  const firstPropRow = HEADER_ROW + 1;
  activeProps.forEach((p, i) => {
    const r = firstPropRow + i;
    const cats = orderedCats.map((_, ci) => {
      const L = colLetter(firstCatCol + ci);
      return { formula: `SUMIFS(${CH_SUM},${CH_PROP},$A${r},${CH_CAT},${L}$${HEADER_ROW})` };
    });
    const rowTotal = { formula: `SUM(${colLetter(firstCatCol)}${r}:${colLetter(lastCatCol)}${r})` };
    sm.addRow([p.id, p.name, ...cats, rowTotal]);
  });

  const lastPropRow = firstPropRow + activeProps.length - 1;
  const totalRowIdx = firstPropRow + activeProps.length;
  const hasProps = activeProps.length > 0;
  const totalCells: (string | number | { formula: string })[] = ["TOTAL", ""];
  for (let ci = 0; ci < catCount; ci++) {
    const L = colLetter(firstCatCol + ci);
    totalCells.push(hasProps ? { formula: `SUM(${L}${firstPropRow}:${L}${lastPropRow})` } : 0);
  }
  totalCells.push(hasProps ? { formula: `SUM(${totalColL}${firstPropRow}:${totalColL}${lastPropRow})` } : 0);
  const totalRow = sm.addRow(totalCells);
  totalRow.eachCell((cell) => { cell.font = { bold: true }; cell.border = { top: { style: "medium", color: { argb: "FF000000" } } }; });

  // Currency formats on the numeric columns.
  for (let c = firstCatCol; c <= totalCol; c++) sm.getColumn(c).numFmt = MONEY_FMT;
  sm.getColumn(1).width = 12;
  sm.getColumn(2).width = 30;
  for (let c = firstCatCol; c <= totalCol; c++) sm.getColumn(c).width = 14;

  // Reimbursement invoice note (Harry fronts the whole statement).
  if (args.reimbursement) {
    sm.addRow([]);
    const noteRow = sm.addRow([`Reimbursement invoice payable to ${args.reimbursement.vendorCode} (${args.reimbursement.payeeName}) for the statement total`]);
    noteRow.getCell(1).font = { italic: true, color: { argb: "FF8A5A08" } };
    const amtCell = noteRow.getCell(totalCol);
    amtCell.value = args.reimbursement.total;
    amtCell.numFmt = MONEY_FMT;
    amtCell.font = { bold: true, color: { argb: "FF8A5A08" } };
    sm.mergeCells(noteRow.number, 1, noteRow.number, totalCol - 1);
  }

  sm.views = [{ state: "frozen", ySplit: HEADER_ROW }];

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

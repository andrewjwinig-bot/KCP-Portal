// The Shopping Centers (retail) commission memo — Harry's — one PDF for the
// quarter, every centre on it. The same memo the page downloads, Marie gets
// with the memo + GL import, and Alison gets for her records. Mirrors the
// office memo (memoPdf.ts): Property / Vendor / Account bold up top.

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { parseQuarterLabel, toDisplayDate, type CommissionEntry } from "@/lib/commissions";
import { addControlSheet } from "./controlSheet";

// The person these commissions are paid to — appears on the memo.
export const RETAIL_PAYEE = "Harry I. Feldman";
const PAYEE = RETAIL_PAYEE;

export async function buildRetailMemoPdf(opts: {
  entries: CommissionEntry[];
  parsed: NonNullable<ReturnType<typeof parseQuarterLabel>>;
}): Promise<Uint8Array> {
  const { parsed } = opts;
  const periodEnd = parsed.periodEnd;
  const periodEndStr = `${periodEnd.getMonth() + 1}/${periodEnd.getDate()}/${periodEnd.getFullYear()}`;
  const entries = [...opts.entries].sort((a, b) => {
    const bd = a.building.localeCompare(b.building);
    return bd !== 0 ? bd : a.suite.localeCompare(b.suite);
  });
  const total = entries.reduce((s, e) => s + (Number(e.incentiveAmount) || 0), 0);

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const navy  = rgb(11 / 255, 74 / 255, 125 / 255);
  const white = rgb(1, 1, 1);
  const ink   = rgb(0.10, 0.12, 0.15);
  const gray  = rgb(0.42, 0.46, 0.52);
  const shade = rgb(0.945, 0.955, 0.965);
  const rule  = rgb(0.80, 0.82, 0.86);

  const margin = 50;
  const pageW = 612;
  const right = pageW - margin;
  const contentW = pageW - margin * 2;
  let y = 736;

  const txt = (s: string, x: number, yy: number, o: { size?: number; b?: boolean; color?: ReturnType<typeof rgb> } = {}) =>
    page.drawText(s, { x, y: yy, font: o.b ? bold : font, size: o.size ?? 10, color: o.color ?? ink });
  const txtR = (s: string, xr: number, yy: number, o: { size?: number; b?: boolean; color?: ReturnType<typeof rgb> } = {}) => {
    const f = o.b ? bold : font, sz = o.size ?? 10;
    page.drawText(s, { x: xr - f.widthOfTextAtSize(s, sz), y: yy, font: f, size: sz, color: o.color ?? ink });
  };
  const txtC = (s: string, cx: number, yy: number, o: { size?: number; b?: boolean; color?: ReturnType<typeof rgb> } = {}) => {
    const f = o.b ? bold : font, sz = o.size ?? 10;
    page.drawText(s, { x: cx - f.widthOfTextAtSize(s, sz) / 2, y: yy, font: f, size: sz, color: o.color ?? ink });
  };
  const money = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fit = (s: string, w: number, sz: number) => {
    if (font.widthOfTextAtSize(s, sz) <= w) return s;
    let t = s;
    while (t.length > 1 && font.widthOfTextAtSize(t + "…", sz) > w) t = t.slice(0, -1);
    return t + "…";
  };

  // Letterhead
  txt("KORMAN", margin, y, { b: true, size: 26, color: navy });
  txt("C O M M E R C I A L   P R O P E R T I E S", margin + 1, y - 13, { b: true, size: 7, color: gray });
  txtR("LEASING COMMISSION", right, y + 4, { b: true, size: 17, color: navy });
  txtR("Request for Payment", right, y - 12, { size: 9, color: gray });
  y -= 27;
  page.drawRectangle({ x: margin, y, width: contentW, height: 2, color: navy });
  y -= 26;

  // Memo block
  // The shopping centres on this memo, by property code — each is its own
  // entity, so the memo names every one it charges (owner).
  const properties = [...new Set(entries.map((e) => (e.building || "").toUpperCase()).filter(Boolean))].sort();
  const memoRows: [string, string][] = [
    ["TO", "Payroll"],
    ["FROM", "Alison Korman"],
    ["DATE", periodEndStr],
    ["PERIOD", `Q${Math.floor(periodEnd.getMonth() / 3) + 1} ${periodEnd.getFullYear()}`],
    ["PROPERTY", properties.join(", ") || "—"],
    ["VENDOR", "LIKM4"],
    ["ACCOUNT", "1940-8501"],
    ["SUBJECT", `Leasing Commission — ${PAYEE}`],
  ];
  // What the bookkeeper codes from — bold and larger, up top (owner).
  const CODING = new Set(["PROPERTY", "VENDOR", "ACCOUNT"]);
  const memoH = memoRows.length * 16 + 12;
  page.drawRectangle({ x: margin, y: y - memoH + 12, width: contentW, height: memoH, color: shade });
  let my = y;
  for (const [k, v] of memoRows) {
    txt(k, margin + 12, my, { b: true, size: 8, color: navy });
    txt(v, margin + 92, my, CODING.has(k) ? { b: true, size: 11.5, color: navy } : { size: 10 });
    my -= 16;
  }
  y -= memoH + 14;

  txt(`Please pay ${PAYEE} $${money(total)} in leasing commission for the following retail leases:`, margin, y, { size: 10.5 });
  y -= 28;

  // Table
  // Commission, then Total * = × 1.2 — the figure on the AvidXchange invoice,
  // as the office memo shows it (owner: "add the 20% markup there as well").
  const cols = [
    { label: "Building",   x: 50,  w: 40, align: "l" as const },
    { label: "Suite",      x: 90,  w: 34, align: "l" as const },
    { label: "Tenant",     x: 124, w: 120, align: "l" as const },
    { label: "Lease From", x: 244, w: 56, align: "l" as const },
    { label: "Lease To",   x: 300, w: 56, align: "l" as const },
    { label: "Term",       x: 356, w: 30, align: "r" as const },
    { label: "Rate $/SF",  x: 386, w: 50, align: "r" as const },
    { label: "Commission", x: 436, w: 62, align: "r" as const },
    { label: "Total *",    x: 498, w: 64, align: "r" as const },
  ];

  // Section bar
  page.drawRectangle({ x: margin, y: y - 6, width: contentW, height: 18, color: navy });
  txt("SHOPPING CENTERS", margin + 8, y, { b: true, size: 10, color: white });
  y -= 24;
  // Header
  cols.forEach((c) => {
    if (c.align === "r") txtR(c.label, c.x + c.w, y, { b: true, size: 8, color: gray });
    else txt(c.label, c.x, y, { b: true, size: 8, color: gray });
  });
  y -= 5;
  page.drawLine({ start: { x: margin, y }, end: { x: right, y }, thickness: 0.75, color: rule });
  y -= 14;
  // Rows
  entries.forEach((e, idx) => {
    if (idx % 2 === 1) page.drawRectangle({ x: margin, y: y - 4, width: contentW, height: 15, color: shade });
    const vals = [
      e.building,
      e.suite,
      fit(e.tenant, cols[2].w - 4, 9),
      toDisplayDate(e.leaseFrom),
      toDisplayDate(e.leaseTo),
      String(e.termYears),
      `$${(e.rate ?? 0).toFixed(2)}`,
      money(Number(e.incentiveAmount) || 0),
      money((Number(e.incentiveAmount) || 0) * 1.2),
    ];
    cols.forEach((c, i) => {
      if (!vals[i]) return;
      if (c.align === "r") txtR(vals[i], c.x + c.w, y, { size: 9 });
      else txt(vals[i], c.x, y, { size: 9 });
    });
    y -= 16;
  });
  // Grand total
  page.drawRectangle({ x: margin, y: y - 7, width: contentW, height: 22, color: navy });
  txtR("TOTAL", cols[7].x - 12, y, { b: true, size: 11, color: white });
  txtR(money(total), cols[7].x + cols[7].w, y, { b: true, size: 11, color: white });
  txtR(money(total * 1.2), cols[8].x + cols[8].w, y, { b: true, size: 11, color: white });
  y -= 34;

  // Footnote
  txt("Commission is $1.00 per square foot leased (square feet × $1).", margin, y, { size: 8.5, color: gray });
  y -= 12;
  txt("*  Total reflects the commission grossed up 20% for property billing — the amount on each AvidXchange invoice.", margin, y, { size: 8.5, color: gray });
  y -= 14;

  // Footer
  y -= 16;
  const note = "Please charge commissions to 1940-8501 — Shopping Centers Division.";
  page.drawRectangle({ x: margin, y: y - 9, width: contentW, height: 24, color: shade });
  txtC(note, pageW / 2, y, { b: true, size: 9.5, color: navy });

  // Page 2: the control sheet — every invoice as Avid received it.
  addControlSheet(pdf, { font, bold }, { title: `Shopping Centers — Q${parsed.quarter} ${parsed.year}`, entries });

  return pdf.save();
}

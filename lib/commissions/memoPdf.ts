// Server- and client-usable builder for the quarterly Incentive Compensation
// memo (the "top sheet") — one PDF per fund (JV III, NI LLC). Uses pdf-lib, so
// it runs in a Node route as well as the browser. Extracted from the commissions
// page so the quarter-end cron can attach the same memo it downloads on-screen.

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import { toDisplayDate, parseQuarterLabel, type CommissionEntry } from "@/lib/commissions";

const COMMISSIONS_MARKUP = 1.2;

export async function buildCommissionMemoPdf(opts: {
  quarter: string;
  entries: CommissionEntry[];
  parsed: NonNullable<ReturnType<typeof parseQuarterLabel>>;
  /** Which fund to render. The PDF only contains rows for buildings
   *  belonging to this fund; the other fund's entries are ignored. */
  fund: "JV III" | "NI LLC";
}): Promise<Uint8Array | null> {
  const { entries, parsed, fund } = opts;
  const periodEnd = parsed.periodEnd;
  const periodEndStr = `${periodEnd.getMonth() + 1}/${periodEnd.getDate()}/${periodEnd.getFullYear()}`;

  // Filter entries to just this fund. Buildings whose code matches the
  // requested fund's PROPERTY_DEFS are included; entries that don't
  // resolve to a known fund are dropped from both PDFs.
  const fundSet = new Set(
    PROPERTY_DEFS.filter((p) => p.fundGroup === fund).map((p) => p.id.toUpperCase()),
  );
  const sorted = [...entries].sort((a, b) => {
    const bd = a.building.localeCompare(b.building);
    return bd !== 0 ? bd : a.suite.localeCompare(b.suite);
  });
  const fundEntries = sorted.filter((e) => fundSet.has((e.building || "").toUpperCase()));

  // No work to do for this fund this quarter — caller skips downloading.
  if (fundEntries.length === 0) return null;

  const subtotal = fundEntries.reduce((s, e) => s + (Number(e.incentiveAmount) || 0), 0);
  const total    = subtotal * COMMISSIONS_MARKUP;

  // ── pdf-lib setup ──
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]); // Letter portrait
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const navy  = rgb(11 / 255, 74 / 255, 125 / 255);
  const white = rgb(1, 1, 1);
  const ink   = rgb(0.10, 0.12, 0.15);
  const gray  = rgb(0.42, 0.46, 0.52);
  const shade = rgb(0.945, 0.955, 0.965);
  const rule  = rgb(0.80, 0.82, 0.86);

  const margin = 50;
  const pageW  = 612;
  const right  = pageW - margin; // 562
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

  // ── Letterhead — Korman Commercial logo (left) + document title (right) ──
  txt("KORMAN", margin, y, { b: true, size: 26, color: navy });
  txt("C O M M E R C I A L   P R O P E R T I E S", margin + 1, y - 13, { b: true, size: 7, color: gray });
  txtR("INCENTIVE COMPENSATION", right, y + 4, { b: true, size: 17, color: navy });
  txtR("Request for Payment", right, y - 12, { size: 9, color: gray });
  y -= 27;
  page.drawRectangle({ x: margin, y, width: contentW, height: 2, color: navy });
  y -= 26;

  // ── Memo block (To / From / Date / Subject) ──
  const memoRows: [string, string][] = [
    ["TO", "Payroll"],
    ["FROM", "Alison Korman"],
    ["DATE", periodEndStr],
    ["PERIOD", `Q${Math.floor(periodEnd.getMonth() / 3) + 1} ${periodEnd.getFullYear()}`],
    ["FUND", fund],
    ["SUBJECT", "Incentive Compensation — Nancy L. Fox"],
  ];
  const memoH = memoRows.length * 16 + 12;
  page.drawRectangle({ x: margin, y: y - memoH + 12, width: contentW, height: memoH, color: shade });
  let my = y;
  for (const [k, v] of memoRows) {
    txt(k, margin + 12, my, { b: true, size: 8, color: navy });
    txt(v, margin + 92, my, { size: 10 });
    my -= 16;
  }
  y -= memoH + 14;

  // ── Intro ──
  txt(`Please pay Nancy L. Fox $${money(subtotal)} in incentive compensation for the following leases:`, margin, y, { size: 10.5 });
  y -= 26;

  // ── Table ──
  const cols = [
    { key: "building", label: "Building",   x: 50,  w: 52, align: "l" as const },
    { key: "suite",    label: "Suite",      x: 102, w: 40, align: "l" as const },
    { key: "tenant",   label: "Tenant",     x: 142, w: 150, align: "l" as const },
    { key: "from",     label: "Lease From", x: 292, w: 64, align: "l" as const },
    { key: "to",       label: "Lease To",   x: 356, w: 64, align: "l" as const },
    { key: "term",     label: "Term",       x: 420, w: 36, align: "r" as const },
    { key: "sub",      label: "Subtotal",   x: 456, w: 50, align: "r" as const },
    { key: "tot",      label: "Total *",    x: 506, w: 56, align: "r" as const },
  ];
  const subColEnd = cols[6].x + cols[6].w;
  const totColEnd = cols[7].x + cols[7].w;

  function dataRow(vals: string[], fill?: ReturnType<typeof rgb>) {
    if (fill) page.drawRectangle({ x: margin, y: y - 4, width: contentW, height: 15, color: fill });
    cols.forEach((c, i) => {
      const v = vals[i] ?? "";
      if (!v) return;
      if (c.align === "r") txtR(v, c.x + c.w, y, { size: 9 });
      else txt(v, c.x, y, { size: 9 });
    });
  }

  function section(title: string, list: CommissionEntry[]) {
    if (!list.length) return;
    // Section bar
    page.drawRectangle({ x: margin, y: y - 6, width: contentW, height: 18, color: navy });
    txt(title, margin + 8, y, { b: true, size: 10, color: white });
    y -= 24;
    // Column headers
    cols.forEach((c) => {
      if (c.align === "r") txtR(c.label, c.x + c.w, y, { b: true, size: 8, color: gray });
      else txt(c.label, c.x, y, { b: true, size: 8, color: gray });
    });
    y -= 5;
    page.drawLine({ start: { x: margin, y }, end: { x: right, y }, thickness: 0.75, color: rule });
    y -= 14;
    // Data rows
    let sub = 0;
    list.forEach((e, idx) => {
      const s = Number(e.incentiveAmount) || 0;
      sub += s;
      dataRow([
        e.building,
        e.suite,
        fit(e.tenant, cols[2].w - 4, 9),
        toDisplayDate(e.leaseFrom),
        toDisplayDate(e.leaseTo),
        String(e.termYears),
        money(s),
        money(s * COMMISSIONS_MARKUP),
      ], idx % 2 === 1 ? shade : undefined);
      y -= 16;
    });
    // Section total
    page.drawLine({ start: { x: margin, y: y + 11 }, end: { x: right, y: y + 11 }, thickness: 0.75, color: rule });
    txtR(`${title} TOTAL`, subColEnd - cols[6].w - 12, y, { b: true, size: 9 });
    txtR(money(sub), subColEnd, y, { b: true, size: 9 });
    txtR(money(sub * COMMISSIONS_MARKUP), totColEnd, y, { b: true, size: 9 });
    y -= 26;
  }

  section(fund, fundEntries);

  // ── Grand total bar ──
  page.drawRectangle({ x: margin, y: y - 7, width: contentW, height: 22, color: navy });
  txtR("TOTAL", subColEnd - cols[6].w - 12, y, { b: true, size: 11, color: white });
  txtR(money(subtotal), subColEnd, y, { b: true, size: 11, color: white });
  txtR(money(total), totColEnd, y, { b: true, size: 11, color: white });
  y -= 34;

  // ── Footnote ──
  txt("*  Total reflects the incentive subtotal grossed up 20% for property billing.", margin, y, { size: 8.5, color: gray });
  y -= 30;

  // ── Charge instruction ──
  const note = "Please charge commissions to 1940-8501 and deposit into LIK Clearing x1622";
  page.drawRectangle({ x: margin, y: y - 9, width: contentW, height: 24, color: shade });
  txtC(note, pageW / 2, y, { b: true, size: 9.5, color: navy });

  return pdf.save();
}

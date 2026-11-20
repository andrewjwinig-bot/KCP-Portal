// THE NNN QUOTE AS A PDF FOR THE PROSPECT (owner, 11/2026: "add a print/PDF
// version of the quote for tenants"). One letter-size page in the same
// letterhead, tinted section bars and boxed total as the tenant statements
// (lib/statements/monthlyStatementPdf.ts), so a prospect gets a document that
// reads like the rest of what Korman sends. Pure drawing: the page passes the
// quote it already shows, so the PDF can never disagree with the screen.

import type { NnnQuote, NnnYear } from "./nnnQuote";

export type NnnQuotePdfInput = {
  centre: string;
  address?: string;
  suite: string;
  sqft: number;
  budgetYear: number;
  preparedFor?: string;
  quote: NnnQuote;
  /** Actual / reprojection / budget years, per SF — the talking point. */
  trend?: NnnYear[];
  /** "Mon D, YYYY". */
  dateLabel: string;
};

const PAGE_W = 612;
const L = 48, R = 564, W = R - L;
const NAVY: [number, number, number] = [11, 74, 125];
const TINT: [number, number, number] = [230, 238, 245];
const MUTED: [number, number, number] = [110, 110, 110];
const INK: [number, number, number] = [20, 20, 20];
const LINE: [number, number, number] = [205, 210, 216];

const cents = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dollars = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function drawNnnQuote(doc: any, d: NnnQuotePdfInput) {
  const fill = (c: number[]) => doc.setFillColor(c[0], c[1], c[2]);
  const ink = (c: number[]) => doc.setTextColor(c[0], c[1], c[2]);
  const stroke = (c: number[]) => doc.setDrawColor(c[0], c[1], c[2]);
  const font = (style: "bold" | "normal", size: number) => { doc.setFont("helvetica", style); doc.setFontSize(size); };

  // Letterhead.
  fill(NAVY); doc.rect(0, 0, PAGE_W, 84, "F");
  ink([255, 255, 255]); font("bold", 24); doc.text("KORMAN", L, 46);
  stroke([255, 255, 255]); doc.setLineWidth(0.7); doc.line(170, 26, 170, 50);
  font("normal", 7.5); doc.text("COMMERCIAL", 180, 34); doc.text("PROPERTIES", 180, 45);
  font("bold", 15); doc.text("Estimated Occupancy Costs", R, 38, { align: "right" });
  font("normal", 9.5); doc.text(d.dateLabel, R, 54, { align: "right" });

  // Who and where.
  let y = 116;
  ink(INK); font("bold", 16); doc.text(d.centre, L, y);
  y += 16; ink(MUTED); font("normal", 10);
  if (d.address) { doc.text(d.address, L, y); y += 14; }
  ink(INK); font("bold", 11);
  doc.text(`Suite ${d.suite}  ·  ${d.sqft.toLocaleString("en-US")} SF`, L, y);
  if (d.preparedFor) { font("normal", 10); ink(MUTED); doc.text("Prepared for", R, 116, { align: "right" }); ink(INK); font("bold", 11); doc.text(d.preparedFor, R, 130, { align: "right" }); }
  y += 24;

  // Three headline tiles.
  const tiles: [string, string, string][] = [
    ["Base rent", `${cents(d.quote.lines.find((l) => l.key === "base")?.psf ?? 0)} / SF`, "per year"],
    ["Est. NNN", `${cents(d.quote.nnnPsf)} / SF`, `${cents(d.quote.nnnMonthly)} a month`],
    ["All-in", `${cents(d.quote.allInPsf)} / SF`, `${cents(d.quote.allInMonthly)} a month`],
  ];
  const tw = (W - 2 * 12) / 3;
  tiles.forEach(([label, value, sub], i) => {
    const x = L + i * (tw + 12);
    stroke(i === 2 ? NAVY : LINE); doc.setLineWidth(i === 2 ? 1.2 : 0.8); doc.roundedRect(x, y, tw, 62, 6, 6, "S");
    ink(i === 2 ? NAVY : MUTED); font("bold", 8); doc.text(label.toUpperCase(), x + 12, y + 17);
    ink(INK); font("bold", 16); doc.text(value, x + 12, y + 38);
    ink(MUTED); font("normal", 8.5); doc.text(sub, x + 12, y + 52);
  });
  y += 84;

  // The charges.
  const cols = [L + 8, R - 230, R - 120, R - 8];
  const bar = (title: string) => {
    fill(TINT); doc.rect(L, y, W, 20, "F");
    ink(NAVY); font("bold", 9.5); doc.text(title, L + 8, y + 13.5); y += 20;
  };
  const head = (labels: string[]) => {
    ink(MUTED); font("bold", 8);
    labels.forEach((t, i) => doc.text(t.toUpperCase(), cols[i], y + 14, i === 0 ? undefined : { align: "right" }));
    y += 20; stroke(LINE); doc.setLineWidth(0.6); doc.line(L, y, R, y);
  };
  const row = (cells: string[], opts: { bold?: boolean; zebra?: boolean; rule?: boolean } = {}) => {
    if (opts.zebra) { fill([248, 250, 252]); doc.rect(L, y, W, 20, "F"); }
    if (opts.rule) { stroke(INK); doc.setLineWidth(1.4); doc.line(L, y, R, y); }
    ink(INK); font(opts.bold ? "bold" : "normal", 10);
    cells.forEach((t, i) => doc.text(t, cols[i], y + 14, i === 0 ? undefined : { align: "right" }));
    y += 20;
  };
  bar(`Estimated ${d.budgetYear} charges`);
  head(["Charge", "$ / SF / yr", "Monthly", "Annual"]);
  d.quote.lines.forEach((l, i) => row([l.key === "base" ? l.label : `${l.label} (est.)`, l.psf.toFixed(2), cents(l.monthly), dollars(l.annual)], { zebra: i % 2 === 1 }));
  row(["NNN total (est.)", d.quote.nnnPsf.toFixed(2), cents(d.quote.nnnMonthly), dollars(d.quote.nnnAnnual)], { bold: true });
  row(["All-in", d.quote.allInPsf.toFixed(2), cents(d.quote.allInMonthly), dollars(d.quote.allInAnnual)], { bold: true, rule: true });
  y += 18;

  // NNN over the years — complete years only.
  const years = (d.trend ?? []).filter((t) => !t.partial);
  if (years.length > 1) {
    bar("NNN per square foot over the years");
    const yc = [L + 8, R - 300, R - 200, R - 100, R - 8];
    ink(MUTED); font("bold", 8);
    ["Year", "CAM", "Insurance", "RE Taxes", "NNN / SF"].forEach((t, i) => doc.text(t.toUpperCase(), yc[i], y + 14, i === 0 ? undefined : { align: "right" }));
    y += 20; stroke(LINE); doc.setLineWidth(0.6); doc.line(L, y, R, y);
    years.forEach((t, i) => {
      if (i % 2 === 1) { fill([248, 250, 252]); doc.rect(L, y, W, 20, "F"); }
      ink(INK); font("normal", 10);
      const kind = t.kind === "budget" ? "budget" : t.kind === "reprojection" ? "projected" : "actual";
      doc.text(`${t.year}  ${kind}`, yc[0], y + 14);
      [t.cam, t.ins, t.ret].forEach((v, j) => doc.text(v.toFixed(2), yc[j + 1], y + 14, { align: "right" }));
      font("bold", 10); doc.text(t.total.toFixed(2), yc[4], y + 14, { align: "right" });
      y += 20;
    });
    y += 14;
  }

  // The basis.
  ink(MUTED); font("normal", 8.5);
  const note = `CAM, insurance and real estate taxes are estimates: this suite's ${d.quote.sharePct.toFixed(2)}% pro-rata share of the property's ${d.budgetYear} budgeted recoverable expenses${d.quote.lines.some((l) => l.key === "admin") ? ", with the CAM administrative fee" : ""}. They are billed monthly and reconciled to actual expenses each year. Prior years are shown per square foot of today's leasable area. This is an estimate for discussion only and not an offer to lease; terms are subject to a fully executed lease.`;
  doc.text(doc.splitTextToSize(note, W), L, y);

  // Footer.
  stroke(LINE); doc.setLineWidth(0.6); doc.line(L, 752, R, 752);
  ink(MUTED); font("normal", 8);
  doc.text("Korman Commercial Properties  ·  8 Neshaminy Interplex, Suite 400  ·  Trevose, PA 19053  ·  215.638.1050", L, 766);
  doc.text(`Suite ${d.suite}`, R, 766, { align: "right" });
}

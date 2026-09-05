// Branded office CAM/RET tenant statement, drawn onto a jsPDF page. Shared by
// the year-end reconciliation and the interim (as-of-month) move-out statement
// so the tenant always receives the same letterhead/layout — the differences
// (title, base/actual column labels, footnotes) come in through `opts`.

import type { TenantReconResult } from "./types";

function money0(n: number): string {
  const v = Math.round(n);
  return (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US");
}
function pct(n: number, dp = 2): string {
  return (n * 100).toFixed(dp) + "%";
}

export type StatementOpts = {
  /** Header right-hand subtitle, e.g. "2026 Year-End Statement" or
   *  "Interim Statement · as of June 2026". */
  subtitle: string;
  /** Base-year column header (e.g. "B/Y 2025" or "B/Y 2025 ×6/12"). */
  baseColLabel: string;
  /** Actual column header (e.g. "Actual 2026" or "Jun YTD"). */
  actualColLabel: string;
  /** Bottom-right footer text. */
  footerRight: string;
  /** Extra italic footnotes above the contact line. */
  footnotes?: string[];
};

/** Draw one tenant statement onto the current page of a jsPDF doc. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function drawTenantStatement(doc: any, t: TenantReconResult, year: number, propLabel: string, contact: { email: string; cc: string } | undefined, opts: StatementOpts) {
  const money = money0;
  const occLine = t.occPct < 0.9999; // only show the proration step when it prorates
  const resetRel = t.occPct > 0 ? t.recoveryPct / t.occPct : 0;
  const resetShort = t.baseYearResetISO
    ? new Date(t.baseYearResetISO + "T00:00:00").toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit" })
    : "";
  const PAGE_W = 612;
  const L = 48, R = 564, W = R - L;
  const cols = [372, 468, R]; // right edges: B/Y, Actual, Net Increase

  const NAVY: [number, number, number] = [11, 74, 125];
  const TINT: [number, number, number] = [230, 238, 245];
  const ZEBRA: [number, number, number] = [247, 249, 251];
  const MUTED: [number, number, number] = [110, 110, 110];
  const INK: [number, number, number] = [20, 20, 20];
  const LINE: [number, number, number] = [205, 210, 216];
  const GREEN: [number, number, number] = [21, 128, 61];
  const AMBER: [number, number, number] = [180, 83, 9];
  const fill = (c: number[]) => doc.setFillColor(c[0], c[1], c[2]);
  const ink = (c: number[]) => doc.setTextColor(c[0], c[1], c[2]);
  const stroke = (c: number[]) => doc.setDrawColor(c[0], c[1], c[2]);

  let y = 0;
  const at = (s: string, x: number, o?: { align?: "right" | "center" | "left" }) => doc.text(s, x, y, o);

  // ── Header band — Korman wordmark + statement title ──────────────────────
  fill(NAVY); doc.rect(0, 0, PAGE_W, 84, "F");
  ink([255, 255, 255]);
  doc.setFont("helvetica", "bold"); doc.setFontSize(24);
  doc.text("KORMAN", L, 46);
  stroke([255, 255, 255]); doc.setLineWidth(0.7); doc.line(170, 26, 170, 50);
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
  doc.text("COMMERCIAL", 180, 34); doc.text("PROPERTIES", 180, 45);
  doc.setFont("helvetica", "bold"); doc.setFontSize(15);
  doc.text("CAM / RET Reconciliation", R, 38, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5);
  doc.text(opts.subtitle, R, 54, { align: "right" });

  // ── Tenant block ─────────────────────────────────────────────────────────
  y = 112;
  ink(INK); doc.setFont("helvetica", "bold"); doc.setFontSize(15);
  at(t.name, L);
  y += 16; ink(MUTED); doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  at(`${propLabel}   ·   Suite ${t.suite}`, L);
  y += 14;
  at(`${t.noBaseStop ? "NNN — No Base Year" : `Base Year ${t.baseYear}`}   ·   ${t.grossUp ? "Grossed Up to 95%" : "Not Grossed Up"}   ·   ${pct(t.proRataPct / 100)} Share   ·   ${pct(t.occPct, 1)} Occupancy`, L);
  y += 28;

  const sectionBar = (title: string, withCols: boolean) => {
    fill(TINT); doc.rect(L, y - 11, W, 18, "F");
    ink(NAVY); doc.setFont("helvetica", "bold"); doc.setFontSize(9);
    at(title.toUpperCase(), L + 6);
    if (withCols) {
      doc.setFontSize(8);
      at(opts.baseColLabel, cols[0], { align: "right" });
      at(opts.actualColLabel, cols[1], { align: "right" });
      at("Net Increase", cols[2] - 6, { align: "right" });
    }
    y += 22; ink(INK); doc.setFontSize(10);
  };
  const lineRow = (i: number, label: string, b: number, a: number, n: number | null, bold = false, acct = "") => {
    if (!bold && i % 2 === 1) { fill(ZEBRA); doc.rect(L, y - 10, W, 15, "F"); }
    doc.setFont("helvetica", bold ? "bold" : "normal");
    // Hide the internal "-95" gross-up marker — it's not part of the GL account.
    if (acct) { ink(MUTED); at(acct.replace(/-95$/, ""), L + 6); }
    ink(bold ? NAVY : INK);
    at(label, L + 62);
    at(money(b), cols[0], { align: "right" });
    at(money(a), cols[1], { align: "right" });
    at(n == null ? "—" : money(n), cols[2] - 6, { align: "right" });
    y += 15; ink(INK);
  };
  const sumRow = (label: string, value: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(bold ? 10.5 : 10);
    ink(bold ? INK : MUTED); at(label, 300); ink(INK); at(value, R, { align: "right" });
    y += 15; doc.setFontSize(10);
  };

  // ── Operating expenses ───────────────────────────────────────────────────
  sectionBar("Schedule of Operating Expenses", true);
  t.opexLines.forEach((l, i) => lineRow(i, l.label, l.baseCost, l.actual, t.aggregateBaseYear ? null : l.netIncrease, false, l.glAccount));
  stroke(NAVY); doc.setLineWidth(0.8); doc.line(L, y - 11, R, y - 11);
  lineRow(0, "Total Operating Expenses", t.opexBaseTotal, t.opexActualTotal, t.opexNetIncrease, true);
  y += 6;
  sumRow("Net Increase Over Base Year", money(t.opexNetIncrease));
  sumRow("× Tenant Proportionate Share", pct(t.proRataPct / 100));
  if (occLine) sumRow("× Occupancy % For The Year", pct(t.occPct, 1));
  if (t.baseYearResetISO) sumRow(`× Base Year Reset Proration (${resetShort})`, pct(resetRel, 1));
  sumRow("Amount Due", money(t.opexAmountDue), true);
  sumRow("Less: Escrow Payments for the Year", money(-t.opexEscrow));
  sumRow("Balance, Op Ex Costs Due", money(t.opexBalance), true);
  y += 20;

  // ── Real estate taxes ────────────────────────────────────────────────────
  sectionBar("Real Estate Taxes", true);
  lineRow(0, t.retLine.label, t.retLine.baseCost, t.retLine.actual, t.retLine.netIncrease, false, t.retLine.glAccount);
  y += 6;
  sumRow("× Tenant Proportionate Share", pct(t.proRataPct / 100));
  if (occLine) sumRow("× Occupancy % For The Year", pct(t.occPct, 1));
  if (t.baseYearResetISO) sumRow(`× Base Year Reset Proration (${resetShort})`, pct(resetRel, 1));
  sumRow("Amount Due", money(t.retAmountDue), true);
  sumRow("Less: Escrow Payments for the Year", money(-t.retEscrow));
  sumRow("Balance, Real Estate Taxes Due", money(t.retBalance), true);
  y += 22;

  // ── Net true-up callout ──────────────────────────────────────────────────
  const net = t.opexBalance + t.retBalance;
  const credit = net < 0;
  const theme = credit ? GREEN : AMBER;
  const boxFill = credit ? [235, 247, 239] : [252, 245, 235];
  fill(boxFill); stroke(theme); doc.setLineWidth(1.2);
  doc.rect(L, y, W, 46, "FD");
  ink(theme); doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text((credit ? "NET CREDIT TO TENANT" : "NET BALANCE DUE FROM TENANT"), L + 16, y + 20);
  doc.setFontSize(8); ink(MUTED);
  doc.text(`CAM ${money(t.opexBalance)}   ·   RET ${money(t.retBalance)}`, L + 16, y + 34);
  ink(theme); doc.setFont("helvetica", "bold"); doc.setFontSize(22);
  doc.text(money(Math.abs(net)), R - 16, y + 30, { align: "right" });
  y += 64;

  // ── Footnotes / footer ───────────────────────────────────────────────────
  ink(MUTED); doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
  for (const f of opts.footnotes ?? []) {
    doc.setFont("helvetica", "italic"); at(f, L); y += 14; doc.setFont("helvetica", "normal");
  }
  if (t.baseYearResetISO) {
    doc.setFont("helvetica", "italic");
    at(`* Tenant's base year was reset on ${new Date(t.baseYearResetISO + "T00:00:00").toLocaleDateString("en-US")}; recovery is prorated through the reset date.`, L);
    y += 14; doc.setFont("helvetica", "normal");
  }
  if (t.snowBaseExcluded) {
    doc.setFont("helvetica", "italic");
    const eff = new Date(t.snowBaseExcluded.effectiveYear, t.snowBaseExcluded.effectiveMonth - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
    const pro = t.snowBaseExcluded.fraction < 1 ? ` (prorated to ${Math.round(t.snowBaseExcluded.fraction * 100)}% for ${year})` : "";
    at(`* Snow Removal is excluded from the base year effective ${eff}: snow recovers on a full pro-rata share of the year's snow expense with no base-year offset${pro}. All other lines keep their base year.`, L);
    y += 14; doc.setFont("helvetica", "normal");
  }
  if (t.aggregateBaseYear) {
    doc.setFont("helvetica", "italic");
    at(`* Base-year stop applied to the expense total (not line-by-line): net increase = total actual minus total base year.`, L);
    y += 14; doc.setFont("helvetica", "normal");
  }
  if (t.futureBaseYear) {
    at(`Base year ${t.baseYear} is after the ${year} reconciliation year, so no recovery is due.`, L); y += 14;
  }
  if (contact?.email) { at(`Statement to: ${contact.email}`, L); y += 14; }

  stroke(LINE); doc.setLineWidth(0.6); doc.line(L, 752, R, 752);
  ink(MUTED); doc.setFontSize(8);
  doc.text("Invoices available, upon request.", L, 766);
  doc.text(opts.footerRight, R, 766, { align: "right" });
}

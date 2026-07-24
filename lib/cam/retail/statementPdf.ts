// Branded retail CAM/INS/RET tenant statement, drawn onto a jsPDF page. Shared
// by the year-end reconciliation and the interim (as-of-month) move-out
// statement so the tenant always gets the same letterhead/layout — the
// differences (title, footer, footnotes) come in through `opts`.

import type { RetailTenantResult } from "./types";

function money0(n: number): string {
  const v = Math.round(n);
  return (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US");
}
function pct(n: number, dp = 2): string {
  return (n * 100).toFixed(dp) + "%";
}

export type RetailStatementOpts = {
  /** Header right-hand subtitle (e.g. "2025 Year-End Statement" or
   *  "Interim Statement · as of June 2026"). */
  subtitle: string;
  /** Bottom-right footer text. */
  footerRight: string;
  /** Extra italic footnotes above the contact line. */
  footnotes?: string[];
};

/** Draw one retail tenant statement onto the current page of a jsPDF doc. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function drawRetailStatement(doc: any, t: RetailTenantResult, year: number, propLabel: string, contact: { email: string; cc: string } | undefined, opts: RetailStatementOpts) {
  const money = money0;
  const PAGE_W = 612;
  const L = 48, R = 564, W = R - L;
  const NAVY: [number, number, number] = [11, 74, 125];
  const TINT: [number, number, number] = [230, 238, 245];
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

  fill(NAVY); doc.rect(0, 0, PAGE_W, 84, "F");
  ink([255, 255, 255]); doc.setFont("helvetica", "bold"); doc.setFontSize(24); doc.text("KORMAN", L, 46);
  stroke([255, 255, 255]); doc.setLineWidth(0.7); doc.line(170, 26, 170, 50);
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
  doc.text("COMMERCIAL", 180, 34); doc.text("PROPERTIES", 180, 45);
  doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.text("CAM / INS / RET Reconciliation", R, 38, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.text(opts.subtitle, R, 54, { align: "right" });

  y = 112; ink(INK); doc.setFont("helvetica", "bold"); doc.setFontSize(15); at(t.name, L);
  y += 16; ink(MUTED); doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  at(`${propLabel}   ·   Suite ${t.suite}`, L);
  y += 14;
  const bits = [`CAM ${pct(t.camPrs / 100)}`, `INS ${pct(t.insPrs / 100)}`, `RET ${pct(t.retPrs / 100)}`, t.adminFeePct ? `${t.adminFeePct}% Admin` : "No Admin", ...(t.capped ? ["CAM Capped"] : []), ...(t.retDiscountPct ? [`${t.retDiscountPct}% RET Disc`] : [])];
  at(bits.join("   ·   "), L);
  y += 28;

  const sumRow = (label: string, value: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(bold ? 10.5 : 10);
    ink(bold ? INK : MUTED); at(label, L + 6); ink(INK); at(value, R - 6, { align: "right" });
    y += 15; doc.setFontSize(10);
  };
  const bar = (title: string) => {
    fill(TINT); doc.rect(L, y - 11, W, 18, "F"); ink(NAVY); doc.setFont("helvetica", "bold"); doc.setFontSize(9);
    at(title.toUpperCase(), L + 6); y += 22; ink(INK); doc.setFontSize(10);
  };

  bar("Schedule of Operating Expenses");
  doc.setFontSize(9);
  t.camSchedule.forEach((l, i) => {
    if (i % 2 === 1) { fill([247, 249, 251]); doc.rect(L, y - 9, W, 13, "F"); }
    doc.setFont("helvetica", "normal");
    ink(MUTED); at(l.glAccount, L + 6);
    ink(l.billed ? INK : MUTED);
    at(l.label, L + 74);
    at(money(l.amount), R - 6, { align: "right" });
    if (!l.billed) { stroke(MUTED); doc.setLineWidth(0.6); doc.line(L + 6, y - 3, R - 6, y - 3); }
    y += 13; ink(INK);
  });
  const billedTotal = t.camSchedule.filter((l) => l.billed).reduce((a, l) => a + l.amount, 0);
  stroke(NAVY); doc.setLineWidth(0.8); doc.line(L, y - 9, R, y - 9);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9.5);
  at("Total Operating Expenses", L + 6); at(money(billedTotal), R - 6, { align: "right" }); y += 14;
  if (t.capped) { doc.setFont("helvetica", "normal"); doc.setFontSize(9); ink(AMBER); at(`Less: Controllable Expense Cap → Applicable CAM Pool ${money(t.camPoolEffective)}`, L + 6); y += 14; ink(INK); }
  if (t.portion) { doc.setFont("helvetica", "italic"); doc.setFontSize(8); ink(MUTED); at(`Expenses are allocated between the center's Retail (8502) and Office (8503) portions — this is the ${t.portion} portion.`, L + 6); y += 13; ink(INK); doc.setFont("helvetica", "normal"); }
  y += 8; doc.setFontSize(10);

  const occLine = t.occPct < 0.9999;
  const camFull = (t.camPrs / 100) * t.camPoolEffective;
  const insFull = (t.insPrs / 100) * t.insPool;
  const retFull = (t.retPrs / 100) * t.retPool * (1 - t.retDiscountPct / 100);
  const basis = (prs: number, denom: number) => prs > 0 && denom > 0 ? ` (${t.sqft.toLocaleString()} / ${denom.toLocaleString()} SF)` : "";

  bar("Common Area Maintenance");
  sumRow(`CAM Pool${t.capped ? " (capped)" : t.camPoolEffective < t.camPoolFull ? " (after exclusions)" : ""}`, money(t.camPoolEffective));
  sumRow(`× CAM Share${basis(t.camPrs, t.camDenom)} ${pct(t.camPrs / 100)}`, money(camFull));
  if (occLine) sumRow(`× Occupancy ${pct(t.occPct, 1)}`, money(t.camShare));
  if (t.adminFeePct > 0) sumRow(`+ Admin Fee ${t.adminFeePct}%`, money(t.camAdmin));
  sumRow("CAM Due", money(t.camDue), true);
  sumRow("Less: Escrow Billed", money(-t.camEscrow));
  sumRow("Balance, CAM Due", money(t.camBalance), true);
  y += 8;

  bar("Insurance");
  sumRow("Insurance Pool", money(t.insPool));
  sumRow(`× INS Share${basis(t.insPrs, t.insDenom)} ${pct(t.insPrs / 100)}`, money(insFull));
  if (occLine) sumRow(`× Occupancy ${pct(t.occPct, 1)}`, money(t.insDue));
  sumRow("INS Due", money(t.insDue), true);
  sumRow("Less: Escrow Billed", money(-t.insEscrow));
  sumRow("Balance, INS Due", money(t.insBalance), true);
  y += 8;

  bar("Real Estate Taxes");
  if (t.flatRet != null) {
    sumRow("Own-parcel RET (100%)", money(t.flatRet));
  } else {
    sumRow("Real Estate Tax Pool", money(t.retPool));
    sumRow(`× RET Share${basis(t.retPrs, t.retDenom)} ${pct(t.retPrs / 100)}${t.retDiscountPct ? ` (less ${t.retDiscountPct}%)` : ""}`, money(retFull));
    if (occLine) sumRow(`× Occupancy ${pct(t.occPct, 1)}`, money(t.retDue));
  }
  sumRow("RET Due", money(t.retDue), true);
  sumRow("Less: Escrow Billed", money(-t.retEscrow));
  sumRow("Balance, RET Due", money(t.retBalance), true);
  y += 22;

  const net = t.camBalance + t.insBalance + t.retBalance;
  const credit = net < 0; const theme = credit ? GREEN : AMBER;
  fill(credit ? [235, 247, 239] : [252, 245, 235]); stroke(theme); doc.setLineWidth(1.2); doc.rect(L, y, W, 46, "FD");
  ink(theme); doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text(credit ? "NET CREDIT TO TENANT" : "NET BALANCE DUE FROM TENANT", L + 16, y + 20);
  doc.setFontSize(8); ink(MUTED);
  doc.text(`CAM ${money(t.camBalance)}   ·   INS ${money(t.insBalance)}   ·   RET ${money(t.retBalance)}`, L + 16, y + 34);
  ink(theme); doc.setFont("helvetica", "bold"); doc.setFontSize(22);
  doc.text(money(Math.abs(net)), R - 16, y + 30, { align: "right" });
  y += 64;

  ink(MUTED); doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
  for (const f of opts.footnotes ?? []) { doc.setFont("helvetica", "italic"); at(f, L); y += 14; doc.setFont("helvetica", "normal"); }
  if (contact?.email) { at(`Statement to: ${contact.email}`, L); y += 14; }
  stroke(LINE); doc.setLineWidth(0.6); doc.line(L, 752, R, 752);
  ink(MUTED); doc.setFontSize(8);
  doc.text("Invoices available, upon request.", L, 766);
  doc.text(opts.footerRight, R, 766, { align: "right" });
}

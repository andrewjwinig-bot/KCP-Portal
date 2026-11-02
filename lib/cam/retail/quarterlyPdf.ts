// The quarter's CAM and tax statement for a quarter-billed tenant (Wawa @
// 9510), drawn with jsPDF in the CAM statement's own letterhead
// (`statementPdf.ts`: navy band, tinted section bars, zebra rows, boxed
// balance). Client-safe: the page downloads it and the server attaches the same
// bytes to the email, so what Wawa receives is what the page previews.

import { jsPDF } from "jspdf";
import { QUARTERS, quarterMonths, type Quarter, type QuarterlyBillingDef, type QuarterlyComputed, type QuarterlyData } from "./quarterly";

const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function money0(n: number): string {
  const v = Math.round(n);
  return (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US");
}

/** The quarter's figures, as the worksheet's Quarterly Statement computes them. */
export function quarterFigures(def: QuarterlyBillingDef, data: QuarterlyData, computed: QuarterlyComputed, q: Quarter) {
  const camCost = computed.camCostByQ[q];
  const mgmtFee = camCost * (def.mgmtFeePct / 100);
  const totalCost = camCost + mgmtFee;
  const camDue = computed.camDueByQ[q];
  const payments = data.billed[q] ?? 0;
  const camBalance = camDue - payments;
  const retCost = computed.retCostByQ[q];
  const retDue = computed.retDueByQ[q];
  return { camCost, mgmtFee, totalCost, camDue, payments, camBalance, retCost, retDue, total: camBalance + retDue };
}

export function buildQuarterlyPdf(def: QuarterlyBillingDef, data: QuarterlyData, computed: QuarterlyComputed, q: Quarter, year: number): Uint8Array {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const f = quarterFigures(def, data, computed, q);
  const PAGE_W = 612;
  const L = 48, R = 564, W = R - L;
  const NAVY: [number, number, number] = [11, 74, 125];
  const TINT: [number, number, number] = [230, 238, 245];
  const MUTED: [number, number, number] = [110, 110, 110];
  const INK: [number, number, number] = [20, 20, 20];
  const LINE: [number, number, number] = [205, 210, 216];
  const AMBER: [number, number, number] = [180, 83, 9];
  const GREEN: [number, number, number] = [21, 128, 61];
  const fill = (c: number[]) => doc.setFillColor(c[0], c[1], c[2]);
  const ink = (c: number[]) => doc.setTextColor(c[0], c[1], c[2]);
  const stroke = (c: number[]) => doc.setDrawColor(c[0], c[1], c[2]);
  let y = 0;
  const at = (s: string, x: number, o?: { align?: "right" | "center" | "left" }) => doc.text(s, x, y, o);
  const months = quarterMonths(q);
  const span = `${MONTH[months[0] - 1]} – ${MONTH[months[2] - 1]} ${year}`;

  fill(NAVY); doc.rect(0, 0, PAGE_W, 84, "F");
  ink([255, 255, 255]); doc.setFont("helvetica", "bold"); doc.setFontSize(24); doc.text("KORMAN", L, 46);
  stroke([255, 255, 255]); doc.setLineWidth(0.7); doc.line(170, 26, 170, 50);
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
  doc.text("COMMERCIAL", 180, 34); doc.text("PROPERTIES", 180, 45);
  doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.text("Quarterly CAM / RET Statement", R, 38, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.text(`${q} ${year} · ${span}`, R, 54, { align: "right" });

  y = 112; ink(INK); doc.setFont("helvetica", "bold"); doc.setFontSize(15); at(def.storeName, L);
  y += 16; ink(MUTED); doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  const center = def.label.split("—").map((s) => s.trim())[1] ?? def.parentProperty;
  at(`${center}, Lafayette Hill, PA   ·   Suite ${def.unitRef.split("-").slice(1).join("-")}`, L);
  y += 14;
  at(`Lease share ${def.sharePct}%${def.occPct < 1 ? `   ·   Occupancy ${Math.round(def.occPct * 100)}%` : ""}${def.mgmtFeePct ? `   ·   ${def.mgmtFeePct}% Management Fee` : ""}`, L);
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

  bar(`Eligible Operating Expenses · ${q} ${year}`);
  doc.setFontSize(9);
  def.camLines.forEach((label, i) => {
    if (i % 2 === 1) { fill([247, 249, 251]); doc.rect(L, y - 9, W, 13, "F"); }
    doc.setFont("helvetica", "normal");
    ink(MUTED); at(def.camAccounts[label] ?? "", L + 6);
    ink(INK); at(label, L + 74);
    at(money0(data.camCosts[label]?.[q] ?? 0), R - 6, { align: "right" });
    y += 13;
  });
  stroke(NAVY); doc.setLineWidth(0.8); doc.line(L, y - 9, R, y - 9);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9.5);
  at("Total Operating Expenses", L + 6); at(money0(f.camCost), R - 6, { align: "right" }); y += 22;

  bar("Common Area Maintenance");
  if (f.mgmtFee) sumRow(`+ Management Fee ${def.mgmtFeePct}%`, money0(f.mgmtFee));
  sumRow("Total Costs", money0(f.totalCost));
  sumRow(`× Lease Share ${def.sharePct}%${def.occPct < 1 ? ` · Occupancy ${Math.round(def.occPct * 100)}%` : ""}`, money0(f.camDue));
  if (f.payments) sumRow("Less: Payments", money0(-f.payments));
  sumRow("CAM Due", money0(f.camBalance), true);
  y += 8;

  bar("Real Estate Taxes");
  sumRow(`Real Estate Taxes${def.retAccount ? ` (${def.retAccount})` : ""}`, money0(f.retCost));
  sumRow(`× Lease Share ${def.sharePct}%`, money0(f.retDue));
  sumRow("Tax Due", money0(f.retDue), true);
  y += 22;

  const credit = f.total < 0; const theme = credit ? GREEN : AMBER;
  fill(credit ? [235, 247, 239] : [252, 245, 235]); stroke(theme); doc.setLineWidth(1.2); doc.rect(L, y, W, 46, "FD");
  ink(theme); doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text(credit ? `CREDIT TO TENANT — ${q} ${year}` : `TOTAL DUE — ${q} ${year}`, L + 16, y + 20);
  doc.setFontSize(8); ink(MUTED);
  doc.text(`CAM ${money0(f.camBalance)}   ·   Tax ${money0(f.retDue)}`, L + 16, y + 34);
  ink(theme); doc.setFont("helvetica", "bold"); doc.setFontSize(22);
  doc.text(money0(Math.abs(f.total)), R - 16, y + 30, { align: "right" });
  y += 64;

  // Year to date, so a quarter reads in the year's context.
  const posted = QUARTERS.filter((x) => QUARTERS.indexOf(x) <= QUARTERS.indexOf(q));
  ink(MUTED); doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
  if (posted.length > 1) at(`Year to date (${posted[0]}–${q} ${year}): CAM ${money0(posted.reduce((a, x) => a + computed.camDueByQ[x], 0))} · Tax ${money0(posted.reduce((a, x) => a + computed.retDueByQ[x], 0))}`, L);

  stroke(LINE); doc.setLineWidth(0.6); doc.line(L, 752, R, 752);
  ink(MUTED); doc.setFontSize(8);
  doc.text("Invoices available, upon request.", L, 766);
  doc.text(`Korman Commercial Properties · ${q} ${year} quarterly statement`, R, 766, { align: "right" });
  return new Uint8Array(doc.output("arraybuffer"));
}

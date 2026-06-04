"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Pill, StatPill, reconBalanceTone, TONE_NEUTRAL, TONE_AMBER, TONE_BLUE, TONE_PURPLE } from "@/app/components/Pill";
import { ImportInstructions } from "@/app/components/ImportInstructions";
import {
  yearEndAdjustmentRows,
  chargeRowsToCSV,
  type NextYearEstimate,
} from "@/lib/cam/office/exports";
import type { BuildingReconResult, TenantReconResult } from "@/lib/cam/office/types";
import type { RetailBuildingResult, RetailTenantResult } from "@/lib/cam/retail/types";
import type { PropertyAllocation } from "@/lib/cam/retail/allocation";
import { retailYearEndRows } from "@/lib/cam/retail/exports";

// ── formatting ───────────────────────────────────────────────────────────────

function money(n: number): string {
  const v = Math.round(n * 100) / 100;
  return (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
/** Whole-dollar format for the headline KPI pills. */
function money0(n: number): string {
  const v = Math.round(n);
  return (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US");
}
function pct(n: number, dp = 2): string {
  return (n * 100).toFixed(dp) + "%";
}
/** Rent commencement date "M/D/YYYY" → "MM/DD/YY". */
function fmtRCD(d?: string | null): string {
  if (!d) return "";
  const m = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[1].padStart(2, "0")}/${m[2].padStart(2, "0")}/${m[3].slice(2)}` : d;
}

const SECTION_LABEL: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)",
};
// Larger title for the main recon cards (Building Summary, Methodology, etc.).
const CARD_TITLE: React.CSSProperties = {
  fontSize: 15, fontWeight: 800, letterSpacing: "0.01em", color: "var(--text)",
};
// CAM / INS / RET column headers on the per-tenant statement — larger + centered
// (no year), consistent across office + retail.
const CAT_LABEL: React.CSSProperties = {
  fontSize: 14, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em",
  textAlign: "center", marginBottom: 10,
};
const arrowBtn: React.CSSProperties = {
  width: 26, height: 26, borderRadius: 999, border: "1px solid var(--border)",
  background: "var(--card)", color: "var(--text)", fontSize: 16, fontWeight: 700, lineHeight: 1,
  display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, padding: 0,
};
const th: React.CSSProperties = {
  textAlign: "right", padding: "6px 10px", fontSize: 11, fontWeight: 700,
  textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--muted)",
  borderBottom: "1px solid var(--border)", whiteSpace: "nowrap",
};
const td: React.CSSProperties = { textAlign: "right", padding: "7px 10px", fontSize: 14, whiteSpace: "nowrap" };

type Available = { propertyCode: string; name: string; years: number[]; kind?: "office" | "retail"; mixedOfficeCode?: string };

function downloadCSV(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Big-label dropdown matching the Budgets header (label + chevron with an
// invisible native <select> overlaid).
function HeaderSelect({
  value, onChange, displayLabel, ariaLabel, muted = false, children,
}: {
  value: string; onChange: (next: string) => void; displayLabel: string;
  ariaLabel: string; muted?: boolean; children: React.ReactNode;
}) {
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 6px", borderRadius: 8, cursor: "pointer", maxWidth: "100%", minWidth: 0 }}>
      <span style={{ fontSize: 22, fontWeight: 800, color: muted ? "var(--muted)" : "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
        {displayLabel}
      </span>
      <span aria-hidden style={{ fontSize: 11, lineHeight: 1, color: muted ? "var(--muted)" : "var(--text)", opacity: 0.6, flexShrink: 0 }}>▾</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer", border: 0, padding: 0, margin: 0, appearance: "auto", background: "transparent" }}
      >
        {children}
      </select>
    </span>
  );
}

// Draw one tenant statement onto the current page of a jsPDF doc.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drawTenantStatement(doc: any, t: TenantReconResult, year: number, propLabel: string, contact?: { email: string; cc: string }) {
  // Whole-dollar formatting throughout the PDF for a cleaner statement.
  const money = money0;
  const occLine = t.occPct < 0.9999; // only show the proration step when it prorates
  const resetRel = t.occPct > 0 ? t.recoveryPct / t.occPct : 0;
  const resetShort = t.baseYearResetISO
    ? new Date(t.baseYearResetISO + "T00:00:00").toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit" })
    : "";
  const PAGE_W = 612;
  const L = 48, R = 564, W = R - L;
  const cols = [372, 468, R]; // right edges: B/Y, Actual, Net Increase

  // Brand palette (same navy as the app / Excel exports).
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
  const at = (s: string, x: number, opts?: { align?: "right" | "center" | "left" }) => doc.text(s, x, y, opts);

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
  doc.text(`${year} Year-End Statement`, R, 54, { align: "right" });

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
      at(`B/Y ${t.noBaseStop ? "—" : t.baseYear}`, cols[0], { align: "right" });
      at(`Actual ${year}`, cols[1], { align: "right" });
      at("Net Increase", cols[2] - 6, { align: "right" });
    }
    y += 22; ink(INK); doc.setFontSize(10);
  };
  const lineRow = (i: number, label: string, b: number, a: number, n: number, bold = false, acct = "") => {
    if (!bold && i % 2 === 1) { fill(ZEBRA); doc.rect(L, y - 10, W, 15, "F"); }
    doc.setFont("helvetica", bold ? "bold" : "normal");
    if (acct) { ink(MUTED); at(acct, L + 6); }
    ink(bold ? NAVY : INK);
    at(label, L + 62);
    at(money(b), cols[0], { align: "right" });
    at(money(a), cols[1], { align: "right" });
    at(money(n), cols[2] - 6, { align: "right" });
    y += 15; ink(INK);
  };
  const sumRow = (label: string, value: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(bold ? 10.5 : 10);
    ink(bold ? INK : MUTED); at(label, 300); ink(INK); at(value, R, { align: "right" });
    y += 15; doc.setFontSize(10);
  };

  // ── Operating expenses ───────────────────────────────────────────────────
  sectionBar("Schedule of Operating Expenses", true);
  t.opexLines.forEach((l, i) => lineRow(i, l.label, l.baseCost, l.actual, l.netIncrease, false, l.glAccount));
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
  if (t.baseYearResetISO) {
    doc.setFont("helvetica", "italic");
    at(`* Tenant's base year was reset on ${new Date(t.baseYearResetISO + "T00:00:00").toLocaleDateString("en-US")}; recovery is prorated through the reset date.`, L);
    y += 14; doc.setFont("helvetica", "normal");
  }
  if (t.futureBaseYear) {
    at(`Base year ${t.baseYear} is after the ${year} reconciliation year, so no recovery is due.`, L); y += 14;
  }
  if (contact?.email) { at(`Statement to: ${contact.email}`, L); y += 14; }

  stroke(LINE); doc.setLineWidth(0.6); doc.line(L, 752, R, 752);
  ink(MUTED); doc.setFontSize(8);
  doc.text("Invoices available, upon request.", L, 766);
  doc.text(`${year} CAM / RET Reconciliation  ·  Suite ${t.suite}`, R, 766, { align: "right" });
}

// One tenant's statement as its own PDF.
async function downloadTenantPdf(t: TenantReconResult, year: number, propLabel: string, contact?: { email: string; cc: string }) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  drawTenantStatement(doc, t, year, propLabel, contact);
  const propCode = propLabel.split(" ")[0];
  doc.save(`${propCode}_${year}_Suite${t.suite}_${t.name.replace(/[^\w]+/g, "_")}_CAM_RET.pdf`);
}

// Every tenant in the building as one combined PDF (a page per tenant).
async function downloadAllTenantPdfs(
  tenants: TenantReconResult[], year: number, propLabel: string, contacts: Record<string, { email: string; cc: string }>,
) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  tenants.forEach((t, i) => {
    if (i > 0) doc.addPage();
    drawTenantStatement(doc, t, year, propLabel, contacts[t.unitRef]);
  });
  const propCode = propLabel.split(" ")[0];
  doc.save(`${propCode}_${year}_AllTenantStatements.pdf`);
}

function KormanWordmark() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
      <span style={{ fontFamily: "'Arial Black', 'Arial Bold', Arial, sans-serif", fontWeight: 900, fontSize: 30, letterSpacing: "-0.5px", lineHeight: 1 }}>KORMAN</span>
      <div style={{ width: 1, height: 36, background: "#000", flexShrink: 0 }} />
      <div style={{ fontSize: 11, letterSpacing: "0.22em", lineHeight: 1.7, fontFamily: "Arial, Helvetica, sans-serif" }}><div>COMMERCIAL</div><div>PROPERTIES</div></div>
    </div>
  );
}

export default function OfficeCamReconPage() {
  const [available, setAvailable] = useState<Available[]>([]);
  const [property, setProperty] = useState<string>("");
  const [year, setYear] = useState<number>(0);
  const [unit, setUnit] = useState<string>("ALL");
  const [result, setResult] = useState<BuildingReconResult | null>(null);
  const [retailResult, setRetailResult] = useState<RetailBuildingResult | null>(null);
  // Office part of a mixed center (e.g. 7010 office), shown as a sub-tab.
  const [retailOffice, setRetailOffice] = useState<RetailBuildingResult | null>(null);
  const [allocation, setAllocation] = useState<PropertyAllocation | null>(null);
  const [estimates, setEstimates] = useState<NextYearEstimate[]>([]);
  const [contacts, setContacts] = useState<Record<string, { email: string; cc: string }>>({});
  const [expenseSummary, setExpenseSummary] = useState<ExpRow[]>([]);
  const [expenseEditable, setExpenseEditable] = useState(false);
  const [warnings, setWarnings] = useState<{ unitRef: string; name: string; kind: string; message: string }[]>([]);
  const [loading, setLoading] = useState(false);
  // Year-end true-up always posts on 4/30 of the following year.
  const yeDate = year ? `${year + 1}-04-30` : "";

  useEffect(() => {
    Promise.all([
      fetch("/api/cam-recon/office").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/cam-recon/retail").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([oJ, rJ]) => {
      const office: Available[] = (oJ?.available ?? []).map((a: Available) => ({ ...a, kind: "office" as const }));
      const retail: Available[] = (rJ?.available ?? []).map((a: Available) => ({ ...a, kind: "retail" as const }));
      const list = [...office, ...retail];
      setAvailable(list);
      // Restore the building/year: URL param (arriving back from a unit page)
      // wins, then the last-viewed selection (localStorage), then the first
      // available. This keeps you on your property when you click out and back.
      const sp = new URLSearchParams(window.location.search);
      const stored = (() => {
        try { return { p: localStorage.getItem("camRecon:property"), y: Number(localStorage.getItem("camRecon:year")) }; }
        catch { return { p: null, y: 0 }; }
      })();
      const wantProp = sp.get("property") || stored.p || "";
      const wantYear = Number(sp.get("year")) || stored.y || 0;
      const match = wantProp ? list.find((a) => a.propertyCode === wantProp) : undefined;
      if (match) {
        setProperty(match.propertyCode);
        setYear(match.years.includes(wantYear) ? wantYear : match.years[0]);
      } else if (list.length) {
        setProperty(list[0].propertyCode);
        setYear(list[0].years[0]);
      }
    });
  }, []);

  const isRetail = available.find((a) => a.propertyCode === property)?.kind === "retail";
  // Mixed center (retail + office on one page). Both parts are merged into one
  // result — tenants tagged with a RETAIL / OFFICE portion pill, totals summed —
  // so the whole property shows in a single building summary + methodology table.
  const isMixed = isRetail && !!available.find((a) => a.propertyCode === property)?.mixedOfficeCode;
  const activeRetail: RetailBuildingResult | null = (() => {
    if (!isMixed) return retailResult;
    if (!retailResult && !retailOffice) return null;
    const tag = (r: RetailBuildingResult | null, portion: "retail" | "office") =>
      (r?.tenants ?? []).map((t) => ({ ...t, portion }));
    const k = (key: keyof RetailBuildingResult["totals"]) =>
      (retailResult?.totals[key] ?? 0) + (retailOffice?.totals[key] ?? 0);
    return {
      propertyCode: retailResult?.propertyCode ?? "7010",
      reconYear: retailResult?.reconYear ?? year,
      tenants: [...tag(retailResult, "retail"), ...tag(retailOffice, "office")],
      totals: {
        camDue: k("camDue"), camEscrow: k("camEscrow"), camBalance: k("camBalance"),
        insDue: k("insDue"), insEscrow: k("insEscrow"), insBalance: k("insBalance"),
        retDue: k("retDue"), retEscrow: k("retEscrow"), retBalance: k("retBalance"),
      },
    };
  })();

  const loadResult = useCallback(async () => {
    if (!property || !year) return;
    const retail = available.find((a) => a.propertyCode === property)?.kind === "retail";
    setLoading(true);
    try {
      if (retail) {
        const r = await fetch(`/api/cam-recon/retail?property=${property}&year=${year}`);
        const j = r.ok ? await r.json() : null;
        setRetailResult(j?.result ?? null);
        setContacts(j?.contacts ?? {});
        setAllocation(j?.allocation ?? null);
        // Mixed center: also load the office part for its sub-tab.
        const officeCode = available.find((a) => a.propertyCode === property)?.mixedOfficeCode;
        if (officeCode) {
          const ro = await fetch(`/api/cam-recon/retail?property=${officeCode}&year=${year}`)
            .then((x) => (x.ok ? x.json() : null)).catch(() => null);
          setRetailOffice(ro?.result ?? null);
          setContacts((c) => ({ ...c, ...(ro?.contacts ?? {}) }));
        } else {
          setRetailOffice(null);
        }
        // Clear the office-shaped state so its sections don't render.
        setResult(null); setEstimates([]); setExpenseSummary([]); setWarnings([]);
        return;
      }
      const r = await fetch(`/api/cam-recon/office?property=${property}&year=${year}`);
      const j = r.ok ? await r.json() : null;
      setRetailResult(null);
      setRetailOffice(null);
      setAllocation(null);
      setResult(j?.result ?? null);
      setEstimates(j?.estimates ?? []);
      setContacts(j?.contacts ?? {});
      setExpenseSummary(j?.expenseSummary ?? []);
      setExpenseEditable(!!j?.expenseEditable);
      setWarnings(j?.warnings ?? []);
    } finally {
      setLoading(false);
    }
  }, [property, year, available]);

  // Property/year change: reset selection + export dates, then load.
  useEffect(() => {
    if (!property || !year) return;
    // Remember the last-viewed selection so clicking out and back stays here.
    try { localStorage.setItem("camRecon:property", property); localStorage.setItem("camRecon:year", String(year)); } catch {}
    setUnit("ALL");
    loadResult();
  }, [property, year, loadResult]);

  // Persist a single per-unit override (e.g. an escrow adjustment) then
  // reload so balances recompute server-side.
  const saveField = useCallback(async (unitRef: string, field: string, value: number | string | null) => {
    await fetch("/api/cam-recon/office", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ property, year, unitRef, field, value }),
    });
    await loadResult();
  }, [property, year, loadResult]);

  // Save a Final Expense Summary edit (keyed by GL account), then reload so
  // the FINAL flows back into every tenant's calc.
  const saveExpense = useCallback(async (account: string, field: string, value: number | string | null) => {
    await fetch("/api/cam-recon/office", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ property, year, account, field, value }),
    });
    await loadResult();
  }, [property, year, loadResult]);

  const years = available.find((a) => a.propertyCode === property)?.years ?? [];
  const tenants = result?.tenants ?? [];
  const rTenants = activeRetail?.tenants ?? [];
  // The dropdown + prev/next operate over whichever building's tenants are
  // active. `selected` is the office tenant; `rSelected` the retail one.
  const dropdownTenants = isRetail ? rTenants : tenants;
  const selected = !isRetail && unit !== "ALL" ? tenants.find((t) => t.unitRef === unit) ?? null : null;
  const rSelected = isRetail && unit !== "ALL" ? rTenants.find((t) => t.unitRef === unit) ?? null : null;
  const hasSel = !!(selected || rSelected);
  const selLabel = selected ? `${selected.suite} — ${selected.name}`
    : rSelected ? `${rSelected.suite} — ${rSelected.name}` : "All Tenants";
  const tenantIdx = hasSel ? dropdownTenants.findIndex((t) => t.unitRef === unit) : -1;
  const goTenant = (dir: 1 | -1) => {
    if (tenantIdx < 0) return;
    const next = tenantIdx + dir;
    if (next >= 0 && next < dropdownTenants.length) setUnit(dropdownTenants[next].unitRef);
  };
  const totals = result?.totals;
  const propName = available.find((a) => a.propertyCode === property)?.name ?? "";

  // Headline pills follow the selection: a tenant's balances when one is
  // picked, otherwise the building totals. Retail surfaces real CAM/INS/RET
  // pools; office has no separate insurance recovery (it's a CAM line) → $0.
  const camDue = isRetail
    ? (rSelected ? rSelected.camBalance : activeRetail?.totals.camBalance ?? 0)
    : selected ? selected.opexBalance : totals?.opexBalance ?? 0;
  const retDue = isRetail
    ? (rSelected ? rSelected.retBalance : activeRetail?.totals.retBalance ?? 0)
    : selected ? selected.retBalance : totals?.retBalance ?? 0;
  const insDue = isRetail ? (rSelected ? rSelected.insBalance : activeRetail?.totals.insBalance ?? 0) : 0;
  const totalDue = camDue + insDue + retDue;
  // A negative balance is a credit owed back to the tenant; positive is
  // collected from the tenant. (Zero → no direction shown.)
  const direction = (v: number) => (v < -0.005 ? "to Tenant" : v > 0.005 ? "from Tenant" : "");

  // One compiled year-end adjustment schedule across every office property
  // for the selected year — a single one-time Skyline import.
  const [compiling, setCompiling] = useState(false);
  async function downloadAllYearEnd() {
    setCompiling(true);
    try {
      const rows: ReturnType<typeof yearEndAdjustmentRows> = [];
      for (const a of available.filter((x) => x.kind === "office")) {
        if (!a.years.includes(year)) continue;
        const j = await fetch(`/api/cam-recon/office?property=${a.propertyCode}&year=${year}`)
          .then((r) => (r.ok ? r.json() : null)).catch(() => null);
        if (j?.result) rows.push(...yearEndAdjustmentRows(j.result, yeDate));
      }
      downloadCSV(`AllOfficeProperties_${year}_YearEndAdjustments.csv`, chargeRowsToCSV(rows));
    } finally {
      setCompiling(false);
    }
  }
  // One compiled year-end schedule across every shopping center for the year
  // (incl. both parts of a mixed center) — the retail counterpart.
  const [compilingRetail, setCompilingRetail] = useState(false);
  async function downloadAllRetailYearEnd() {
    setCompilingRetail(true);
    try {
      const rows: ReturnType<typeof retailYearEndRows> = [];
      for (const a of available.filter((x) => x.kind === "retail")) {
        if (!a.years.includes(year)) continue;
        const codes = [a.propertyCode, ...(a.mixedOfficeCode ? [a.mixedOfficeCode] : [])];
        for (const code of codes) {
          const j = await fetch(`/api/cam-recon/retail?property=${code}&year=${year}`)
            .then((r) => (r.ok ? r.json() : null)).catch(() => null);
          if (j?.result) rows.push(...retailYearEndRows(j.result, yeDate));
        }
      }
      downloadCSV(`AllShoppingCenters_${year}_YearEndAdjustments.csv`, chargeRowsToCSV(rows));
    } finally {
      setCompilingRetail(false);
    }
  }

  return (
    <main style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <h1>CAM / RET Reconciliation</h1>
        <KormanWordmark />
      </header>

      <div className="card">
        {/* Year · Property · Tenant selectors styled as the section title */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", minWidth: 0 }}>
            <HeaderSelect value={String(year)} onChange={(v) => setYear(Number(v))} displayLabel={String(year || "—")} ariaLabel="Year" muted>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </HeaderSelect>
            <HeaderSelect value={property} onChange={setProperty} displayLabel={property ? `${property} — ${propName}` : "—"} ariaLabel="Property">
              {available.map((a) => <option key={a.propertyCode} value={a.propertyCode}>{a.propertyCode} — {a.name}</option>)}
            </HeaderSelect>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
              {hasSel && (
                <button type="button" onClick={() => goTenant(-1)} disabled={tenantIdx <= 0} aria-label="Previous tenant"
                  title="Previous tenant"
                  style={{ ...arrowBtn, opacity: tenantIdx <= 0 ? 0.35 : 1, cursor: tenantIdx <= 0 ? "default" : "pointer" }}>‹</button>
              )}
              <HeaderSelect value={unit} onChange={setUnit} displayLabel={selLabel} ariaLabel="Tenant" muted>
                <option value="ALL">All Tenants</option>
                {dropdownTenants.map((t) => <option key={t.unitRef} value={t.unitRef}>{t.suite} — {t.name}</option>)}
              </HeaderSelect>
              {hasSel && (
                <button type="button" onClick={() => goTenant(1)} disabled={tenantIdx >= dropdownTenants.length - 1} aria-label="Next tenant"
                  title="Next tenant"
                  style={{ ...arrowBtn, opacity: tenantIdx >= dropdownTenants.length - 1 ? 0.35 : 1, cursor: tenantIdx >= dropdownTenants.length - 1 ? "default" : "pointer" }}>›</button>
              )}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {/* Per-tenant / all-tenant PDFs, then the portfolio year-end export
                (with an info popover for the Skyline import steps). */}
            {isRetail ? (
              rSelected ? (
                <button onClick={() => downloadRetailTenantPdf(rSelected, year, `${property} — ${propName}`, contacts[rSelected.unitRef])} className="btn primary" style={{ fontSize: 13, padding: "8px 14px", fontWeight: 700 }}>Download PDF</button>
              ) : (
                <button onClick={() => activeRetail && downloadAllRetailPdfs(activeRetail.tenants, year, `${property} — ${propName}`, contacts)} disabled={!activeRetail} className="btn primary" style={{ fontSize: 13, padding: "8px 14px", fontWeight: 700 }}>All Tenant PDFs</button>
              )
            ) : (
              <>
                {selected && (
                  <button onClick={() => downloadTenantPdf(selected, year, `${property} — ${propName}`, contacts[selected.unitRef])} className="btn primary" style={{ fontSize: 13, padding: "8px 14px", fontWeight: 700 }}>Download PDF</button>
                )}
                {!selected && (
                  <button onClick={() => result && downloadAllTenantPdfs(result.tenants, year, `${property} — ${propName}`, contacts)} disabled={!result} className="btn primary" style={{ fontSize: 13, padding: "8px 14px", fontWeight: 700 }}>All Tenant PDFs</button>
                )}
              </>
            )}
            {isRetail ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <button onClick={downloadAllRetailYearEnd} disabled={compilingRetail} className="btn" style={{ fontSize: 13, padding: "8px 14px", fontWeight: 700 }}>{compilingRetail ? "Compiling…" : "SC Year-End Adjustments"}</button>
                <InfoPopover><ImportInstructions /></InfoPopover>
              </span>
            ) : (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <button onClick={downloadAllYearEnd} disabled={compiling} className="btn" style={{ fontSize: 13, padding: "8px 14px", fontWeight: 700 }}>{compiling ? "Compiling…" : "BP Year-End Adjustments"}</button>
                <InfoPopover><ImportInstructions /></InfoPopover>
              </span>
            )}
          </div>
        </div>

        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {selected ? (
            <>
              <Pill tone={TONE_NEUTRAL}>{selected.noBaseStop ? "NNN — No Base Year" : `${selected.baseYear} Base Year`}</Pill>
              <Pill tone={TONE_NEUTRAL}>{selected.grossUp ? "Grossed Up 95%" : "Not Grossed Up"}</Pill>
              <Pill tone={TONE_NEUTRAL}>{pct(selected.proRataPct / 100)} Share</Pill>
              {selected.occPct < 0.9999 && <Pill tone={TONE_NEUTRAL}>{pct(selected.occPct, 1)} Occupancy{selected.rcd ? ` (${fmtRCD(selected.rcd)} RCD)` : ""}</Pill>}
              {selected.baseYearResetISO && <Pill tone={TONE_AMBER}>Base Year Reset {new Date(selected.baseYearResetISO + "T00:00:00").toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit" })}</Pill>}
              {selected.futureBaseYear && <Pill tone={TONE_AMBER}>No Recovery — Future Base Year</Pill>}
            </>
          ) : rSelected ? (
            <>
              <Pill tone={TONE_NEUTRAL}>{pct(rSelected.camPrs / 100)} CAM Share</Pill>
              <Pill tone={TONE_NEUTRAL}>{rSelected.adminFeePct ? `${rSelected.adminFeePct}% Admin` : "No Admin Fee"}</Pill>
              <Pill tone={TONE_NEUTRAL}>{pct(rSelected.insPrs / 100)} INS · {pct(rSelected.retPrs / 100)} RET</Pill>
              {rSelected.occPct < 0.9999 && <Pill tone={TONE_AMBER}>{pct(rSelected.occPct, 1)} Occupancy</Pill>}
              {rSelected.capped && <Pill tone={TONE_AMBER}>CAM Capped</Pill>}
              {rSelected.retDiscountPct > 0 && <Pill tone={TONE_NEUTRAL}>{rSelected.retDiscountPct}% RET Discount</Pill>}
              {rSelected.flatRet != null && <Pill tone={TONE_AMBER}>Own-Parcel RET</Pill>}
              {rSelected.grossLease && <Pill tone={TONE_AMBER}>Gross Lease</Pill>}
            </>
          ) : isRetail ? (
            <span className="muted small">{activeRetail?.tenants.length ?? 0} tenants reconciled · {isMixed ? "retail + office · " : ""}CAM / INS / RET pro-rata share, year-end true-up</span>
          ) : (
            <span className="muted small">{tenants.length} tenants reconciled · base-year expense recovery, year-end true-up</span>
          )}
        </div>

        <div className="pills">
          <StatPill label={`CAM Due${direction(camDue) ? ` ${direction(camDue)}` : ""}`} value={money0(Math.abs(camDue))} accent={reconBalanceTone(camDue).fg} />
          <StatPill label={`INS Due${direction(insDue) ? ` ${direction(insDue)}` : ""}`} value={money0(Math.abs(insDue))} accent={reconBalanceTone(insDue).fg} />
          <StatPill label={`RET Due${direction(retDue) ? ` ${direction(retDue)}` : ""}`} value={money0(Math.abs(retDue))} accent={reconBalanceTone(retDue).fg} />
          <StatPill label={`Total Due${direction(totalDue) ? ` ${direction(totalDue)}` : ""}`} value={money0(Math.abs(totalDue))} accent={reconBalanceTone(totalDue).fg} />
        </div>
      </div>

      {loading && <div className="card"><div className="muted small">Loading…</div></div>}

      {!loading && warnings.length > 0 && (
        <div style={{
          padding: "12px 14px", borderRadius: 10,
          background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.35)",
          display: "flex", flexDirection: "column", gap: 6,
        }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: "#b91c1c" }}>
            {warnings.length} data {warnings.length === 1 ? "warning" : "warnings"} — review before billing
          </div>
          {warnings.map((w, i) => (
            <div key={`${w.unitRef}-${i}`} style={{ fontSize: 12.5, color: "#7f1d1d", lineHeight: 1.5 }}>
              • {w.message}
            </div>
          ))}
        </div>
      )}

      {/* Building Summary is always the top content card. */}
      {isRetail && !rSelected && activeRetail && <RetailBuildingSummary result={activeRetail} onPick={setUnit} />}
      {isRetail && !rSelected && allocation && <AllocationBreakdown a={allocation} />}
      {isRetail && !rSelected && activeRetail && <RetailConfigTable result={activeRetail} onPick={setUnit} />}
      {isRetail && rSelected && <RetailTenantStatement t={rSelected} reconYear={year} contact={contacts[rSelected.unitRef]} />}

      {!selected && result && <BuildingSummary result={result} onPick={setUnit} onEditEscrow={saveField} />}
      {!selected && result && <RecoveryByBaseYear result={result} />}
      {!selected && expenseSummary.length > 0 && <FinalExpenseSummary rows={expenseSummary} editable={expenseEditable} year={year} onEdit={saveExpense} />}
      {selected && <TenantStatement t={selected} reconYear={year} estimate={estimates.find((e) => e.unitRef === selected.unitRef)} contact={contacts[selected.unitRef]} />}
    </main>
  );
}

// ── Retail building summary ──────────────────────────────────────────────────

// Unit ref rendered as the rent-roll code chip, linking to the unit detail
// page (where the CAM methodology is edited). stopPropagation so it doesn't
// also trigger the row's in-page drill-down.
function UnitChip({ unitRef, backTo }: { unitRef: string; backTo?: string }) {
  const href = `/rentroll/units/${encodeURIComponent(unitRef)}`
    + (backTo ? `?from=${encodeURIComponent(backTo)}` : "");
  // Matches the Rent Roll unit column exactly: a <code> element (default
  // monospace), 12px / 700, accent blue, underlined.
  return (
    <Link href={href} onClick={(e) => e.stopPropagation()} title="Open unit detail page" style={{ textDecoration: "none", whiteSpace: "nowrap" }}>
      <code style={{ fontSize: 12, fontWeight: 700, color: "#0b4a7d", whiteSpace: "nowrap", textDecoration: "underline", textUnderlineOffset: 2 }}>{unitRef}</code>
    </Link>
  );
}

// Info (ⓘ) button that reveals the Skyline import steps in a small popover —
// keeps the year-end export buttons clean in the header.
function InfoPopover({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label="Import steps" title="Skyline import steps"
        style={{ width: 22, height: 22, borderRadius: 999, border: "1px solid var(--border)", background: "var(--card)", color: "var(--muted)", cursor: "pointer", fontSize: 13, fontWeight: 800, lineHeight: 1, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>i</button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 50, width: 380, maxWidth: "90vw", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 16px", boxShadow: "0 10px 30px rgba(0,0,0,0.15)" }}>
            {children}
          </div>
        </>
      )}
    </span>
  );
}

// Occupancy callout — consistent across office + retail building summaries:
// assume 100% (render nothing), only flag partial-year tenants in amber, with
// a hover tooltip surfacing the lease term (start / move-out) behind it.
function OccCallout({ occPct, year, rcd, vacatedISO }: {
  occPct: number; year: number; rcd?: string | null; vacatedISO?: string | null;
}) {
  if (occPct >= 0.9999) return null;
  const bits: string[] = [];
  if (rcd) bits.push(`Lease commenced ${fmtRCD(rcd)}`);
  if (vacatedISO) bits.push(`Vacated ${new Date(vacatedISO + "T00:00:00").toLocaleDateString("en-US")}`);
  bits.push(`${pct(occPct, 1)} of ${year} occupied`);
  return (
    <span title={bits.join(" · ")} style={{ fontSize: 11, color: "#b45309", cursor: "help", whiteSpace: "nowrap" }}>
      {" "}({pct(occPct, 0)} occ)
    </span>
  );
}

// RETAIL / OFFICE tag for mixed-center (7010) rows.
function PortionPill({ portion }: { portion?: "retail" | "office" }) {
  if (!portion) return null;
  return (
    <Pill tone={portion === "office" ? TONE_PURPLE : TONE_BLUE}>
      {portion === "office" ? "OFFICE" : "RETAIL"}
    </Pill>
  );
}

const INS_TINT = "rgba(13,148,136,0.06)";

function RetailBuildingSummary({ result, onPick }: { result: RetailBuildingResult; onPick: (u: string) => void }) {
  const { tenants, totals } = result;
  const cam = (first = false): React.CSSProperties => ({ ...td, background: CAM_TINT, ...(first ? { borderLeft: BLOCK_SEP } : {}) });
  const ins = (first = false): React.CSSProperties => ({ ...td, background: INS_TINT, ...(first ? { borderLeft: BLOCK_SEP } : {}) });
  const ret = (first = false): React.CSSProperties => ({ ...td, background: RET_TINT, ...(first ? { borderLeft: BLOCK_SEP } : {}) });
  const camH = (first = false): React.CSSProperties => ({ ...th, background: CAM_TINT, ...(first ? { borderLeft: BLOCK_SEP } : {}) });
  const insH = (first = false): React.CSSProperties => ({ ...th, background: INS_TINT, ...(first ? { borderLeft: BLOCK_SEP } : {}) });
  const retH = (first = false): React.CSSProperties => ({ ...th, background: RET_TINT, ...(first ? { borderLeft: BLOCK_SEP } : {}) });
  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <div style={CARD_TITLE}>Building Summary</div>
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10, minWidth: 1040 }}>
        <thead>
          <tr>
            <th colSpan={4} style={{ borderBottom: "1px solid var(--border)" }} />
            <th colSpan={3} style={{ ...groupTh, color: "#0b4a7d", background: CAM_TINT, borderLeft: BLOCK_SEP, borderBottom: "1px solid var(--border)" }}>CAM</th>
            <th colSpan={3} style={{ ...groupTh, color: "#0f766e", background: INS_TINT, borderLeft: BLOCK_SEP, borderBottom: "1px solid var(--border)" }}>INS</th>
            <th colSpan={3} style={{ ...groupTh, color: "#854d0e", background: RET_TINT, borderLeft: BLOCK_SEP, borderBottom: "1px solid var(--border)" }}>RET</th>
          </tr>
          <tr>
            <th style={{ ...th, textAlign: "left" }}>Unit</th>
            <th style={{ ...th, textAlign: "left" }}>Tenant</th>
            <th style={th}>CAM %</th>
            <th style={th}>Admin</th>
            <th style={camH(true)}>Due</th>
            <th style={camH()}>Escrow</th>
            <th style={camH()}>Balance</th>
            <th style={insH(true)}>Due</th>
            <th style={insH()}>Escrow</th>
            <th style={insH()}>Balance</th>
            <th style={retH(true)}>Due</th>
            <th style={retH()}>Escrow</th>
            <th style={retH()}>Balance</th>
          </tr>
        </thead>
        <tbody>
          {tenants.map((t) => (
            <tr key={t.unitRef} style={{ borderBottom: "1px solid var(--border)", cursor: "pointer", ...(t.grossLease ? { opacity: 0.5 } : {}) }} onClick={() => onPick(t.unitRef)}>
              <td style={{ ...td, textAlign: "left" }}><UnitChip unitRef={t.unitRef} backTo={`/cam-recon?property=${result.propertyCode}&year=${result.reconYear}`} /></td>
              <td style={{ ...td, textAlign: "left" }}><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{t.portion && <PortionPill portion={t.portion} />}<span>{t.name}{t.grossLease ? <span className="muted" style={{ fontSize: 11 }}> (Gross)</span> : t.capped ? <span style={{ fontSize: 11, color: "#b45309" }}> (capped)</span> : t.flatRet != null ? <span style={{ fontSize: 11, color: "#b45309" }}> (own-parcel RET)</span> : null}<OccCallout occPct={t.occPct} year={result.reconYear} rcd={t.rcd} vacatedISO={t.vacatedISO} /></span></span></td>
              <td style={td}>{pct(t.camPrs / 100)}</td>
              <td style={td}>{t.adminFeePct ? `${t.adminFeePct}%` : "—"}</td>
              <td style={cam(true)}>{money0(t.camDue)}</td>
              <td style={cam()}>{money0(t.camEscrow)}</td>
              <td style={cam()}><Pill tone={reconBalanceTone(t.camBalance)}>{money0(t.camBalance)}</Pill></td>
              <td style={ins(true)}>{money0(t.insDue)}</td>
              <td style={ins()}>{money0(t.insEscrow)}</td>
              <td style={ins()}><Pill tone={reconBalanceTone(t.insBalance)}>{money0(t.insBalance)}</Pill></td>
              <td style={ret(true)}>{money0(t.retDue)}</td>
              <td style={ret()}>{money0(t.retEscrow)}</td>
              <td style={ret()}><Pill tone={reconBalanceTone(t.retBalance)}>{money0(t.retBalance)}</Pill></td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 800, borderTop: "2px solid var(--border)" }}>
            <td style={{ ...td, textAlign: "left" }} colSpan={4}>Total</td>
            <td style={cam(true)}>{money0(totals.camDue)}</td>
            <td style={cam()}>{money0(totals.camEscrow)}</td>
            <td style={cam()}>{money0(totals.camBalance)}</td>
            <td style={ins(true)}>{money0(totals.insDue)}</td>
            <td style={ins()}>{money0(totals.insEscrow)}</td>
            <td style={ins()}>{money0(totals.insBalance)}</td>
            <td style={ret(true)}>{money0(totals.retDue)}</td>
            <td style={ret()}>{money0(totals.retEscrow)}</td>
            <td style={ret()}>{money0(totals.retBalance)}</td>
          </tr>
        </tfoot>
      </table>
      <p className="small muted" style={{ marginTop: 8 }}>
        Retail pro-rata: CAM = share × pool × (1 + admin), less excluded lines and any controllable cap; INS &amp; RET = share × pool (RET net of any lease discount). Balance = due − escrow billed; negative is a credit to the tenant.
      </p>
    </div>
  );
}

// ── Retail config (methodology) — at-a-glance verification table ─────────────
// Mirrors the Brookwood CAM tab: admin fee + PRS per category for every tenant,
// with an info chip that expands the exceptions (exclusions / cap / discount /
// gross lease) so the whole center can be verified without opening each unit.

function retailExceptions(t: RetailTenantResult): string[] {
  const out: string[] = [];
  if (t.grossLease) out.push("Gross Lease");
  if (t.camCap) {
    const cap = t.camCap.priorControllable * (1 + t.camCap.growthPct / 100);
    out.push(`CAM cap: controllable held to prior ${money0(t.camCap.priorControllable)} × ${(1 + t.camCap.growthPct / 100).toFixed(2)} = ${money0(cap)} (effective pool ${money0(t.camPoolEffective)}).`);
  }
  if (t.camExcludedLabels.length) out.push(`CAM Exclusions: ${t.camExcludedLabels.join(", ")}.`);
  if (t.adminExcludedLabels.length) out.push(`Admin fee excludes: ${t.adminExcludedLabels.join(", ")}.`);
  if (t.retDiscountPct > 0) out.push(`RET discount: ${t.retDiscountPct}%.`);
  return out;
}

function RetailConfigTable({ result, onPick }: { result: RetailBuildingResult; onPick: (u: string) => void }) {
  // Notes column is capped (~30%) and wraps; the other columns keep their
  // natural width so nothing looks cramped.
  const noteTh: React.CSSProperties = { ...th, textAlign: "left", width: "30%" };
  const noteTd: React.CSSProperties = { ...td, textAlign: "left", whiteSpace: "normal", width: "30%" };
  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <div style={CARD_TITLE}>Tenant CAM Methodology</div>
      <p className="small muted" style={{ marginTop: 4 }}>
        Admin fee + pro-rata share per category, at a glance. Lease exceptions (exclusions / cap / discount / gross) are spelled out under Notes.
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10, minWidth: 720 }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: "left" }}>Unit</th>
            <th style={{ ...th, textAlign: "left" }}>Tenant</th>
            <th style={th}>CAM Admin</th>
            <th style={th}>CAM PRS</th>
            <th style={th}>INS PRS</th>
            <th style={th}>RET PRS</th>
            <th style={noteTh}>Notes</th>
          </tr>
        </thead>
        <tbody>
          {result.tenants.map((t) => {
            const ex = retailExceptions(t);
            return (
              <tr key={t.unitRef} style={{ borderBottom: "1px solid var(--border)", ...(t.grossLease ? { opacity: 0.5 } : {}) }}>
                <td style={{ ...td, textAlign: "left" }}><UnitChip unitRef={t.unitRef} backTo={`/cam-recon?property=${result.propertyCode}&year=${result.reconYear}`} /></td>
                <td style={{ ...td, textAlign: "left", cursor: "pointer" }} onClick={() => onPick(t.unitRef)}><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{t.portion && <PortionPill portion={t.portion} />}<span>{t.name}{t.grossLease ? <span className="muted" style={{ fontSize: 11 }}> (Gross)</span> : null}<OccCallout occPct={t.occPct} year={result.reconYear} rcd={t.rcd} vacatedISO={t.vacatedISO} /></span></span></td>
                <td style={td}>{t.adminFeePct ? `${t.adminFeePct}%` : "—"}</td>
                <td style={td}>{t.grossLease ? "—" : pct(t.camPrs / 100)}</td>
                <td style={td}>{t.grossLease ? "—" : pct(t.insPrs / 100)}</td>
                <td style={td}>{t.grossLease ? "—" : pct(t.retPrs / 100)}</td>
                <td style={noteTd}>
                  {ex.length > 0 ? (
                    <ul style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 2 }}>
                      {ex.map((e, i) => <li key={i} style={{ fontSize: 12, color: "#7c4a12", lineHeight: 1.4 }}>{e}</li>)}
                    </ul>
                  ) : <span style={{ color: "var(--muted)" }}>—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Mixed-center allocation breakdown (retail vs office) ─────────────────────

function AllocationBreakdown({ a }: { a: PropertyAllocation }) {
  const scope = (l: { retail: number; office: number }) =>
    l.retail === 0 ? "Office only" : l.office === 0 ? "Retail only" : `${Math.round((l.retail / (l.retail + l.office)) * 100)}% retail`;
  const pctCell = (part: number, full: number) => full > 0 ? ` (${Math.round((part / full) * 100)}%)` : "";
  const camRetail = a.cam.reduce((s, l) => s + l.retail, 0);
  const camOffice = a.cam.reduce((s, l) => s + l.office, 0);
  const Row = ({ l, bold }: { l: { account?: string; label: string; retail: number; office: number }; bold?: boolean }) => {
    const full = l.retail + l.office;
    return (
      <tr style={{ borderBottom: "1px solid var(--border)", fontWeight: bold ? 800 : 500 }}>
        <td style={{ ...td, textAlign: "left", color: "var(--muted)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", fontSize: 12 }}>{l.account ?? ""}</td>
        <td style={{ ...td, textAlign: "left" }}>{l.label}</td>
        <td style={td}>{money(full)}</td>
        <td style={td}>{money(l.retail)}<span className="muted" style={{ fontSize: 11 }}>{pctCell(l.retail, full)}</span></td>
        <td style={td}>{money(l.office)}<span className="muted" style={{ fontSize: 11 }}>{pctCell(l.office, full)}</span></td>
        <td style={{ ...td, textAlign: "left", color: "var(--muted)", fontSize: 12 }}>{bold ? "" : scope(l)}</td>
      </tr>
    );
  };
  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <div style={CARD_TITLE}>Retail / Office Allocation</div>
      <p className="small muted" style={{ marginTop: 4 }}>
        {a.name} is a mixed center. Each operating-expense line is split between the retail (8502) and office (8503) reconciliations — some shared by %, some retail- or office-only.
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10, minWidth: 720 }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: "left" }}>Acct</th>
            <th style={{ ...th, textAlign: "left" }}>Expense</th>
            <th style={th}>Full</th>
            <th style={th}>Retail (8502)</th>
            <th style={th}>Office (8503)</th>
            <th style={{ ...th, textAlign: "left" }}>Split</th>
          </tr>
        </thead>
        <tbody>
          {a.cam.map((l, i) => <Row key={i} l={l} />)}
          <Row l={{ label: "Total Operating Expenses", retail: camRetail, office: camOffice }} bold />
          <Row l={a.insurance} />
          <Row l={a.realEstateTaxes} />
        </tbody>
      </table>
    </div>
  );
}

// ── Retail per-tenant statement ──────────────────────────────────────────────

function RetailScheduleTable({ t }: { t: RetailTenantResult }) {
  const billedTotal = t.camSchedule.filter((l) => l.billed).reduce((a, l) => a + l.amount, 0);
  const capped = t.camPoolEffective < billedTotal - 0.005;
  const sth: React.CSSProperties = { ...th, fontSize: 12, padding: "7px 10px" };
  const std: React.CSSProperties = { ...td, fontSize: 14.5, padding: "7px 10px" };
  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <div style={CARD_TITLE}>Schedule of Operating Expenses</div>
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10, minWidth: 420 }}>
        <thead>
          <tr>
            <th style={{ ...sth, textAlign: "left", width: "1%", whiteSpace: "nowrap" }}>Acct</th>
            <th style={{ ...sth, textAlign: "left" }}>Expense</th>
            <th style={sth}>2025 Actual</th>
          </tr>
        </thead>
        <tbody>
          {t.camSchedule.map((l, i) => {
            // Excluded lines: strike the whole row through (matches the workbook).
            const struck = l.billed ? {} : { textDecoration: "line-through" as const, color: "var(--muted)" };
            return (
            <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={{ ...std, textAlign: "left", whiteSpace: "nowrap", color: "var(--muted)", fontVariantNumeric: "tabular-nums", ...struck }}>{l.glAccount}</td>
              <td style={{ ...std, textAlign: "left", ...struck }}>{l.label}</td>
              <td style={{ ...std, ...struck }}>{money0(l.amount)}</td>
            </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 800, borderTop: "2px solid var(--border)" }}>
            <td style={std} />
            <td style={{ ...std, textAlign: "left" }}>Total Operating Expenses</td>
            <td style={std}>{money0(billedTotal)}</td>
          </tr>
          {capped && (
            <>
              <tr><td style={std} /><td style={{ ...std, textAlign: "left", color: "#b45309" }}>Less: Controllable Expense Cap</td><td style={{ ...std, color: "#b45309" }}>{money0(t.camPoolEffective - billedTotal)}</td></tr>
              <tr style={{ fontWeight: 800 }}><td style={std} /><td style={{ ...std, textAlign: "left" }}>Applicable CAM Pool</td><td style={std}>{money0(t.camPoolEffective)}</td></tr>
            </>
          )}
          {/* Insurance + RET pools — billed separately from the CAM pool. */}
          <tr style={{ borderTop: "2px solid var(--border)" }}>
            <td style={{ ...std, color: "var(--muted)" }}>—</td>
            <td style={{ ...std, textAlign: "left" }}>Property Insurance</td>
            <td style={std}>{money0(t.insPool)}</td>
          </tr>
          <tr>
            <td style={{ ...std, color: "var(--muted)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>6410-8502</td>
            <td style={{ ...std, textAlign: "left" }}>Real Estate Taxes</td>
            <td style={std}>{money0(t.retPool)}</td>
          </tr>
        </tfoot>
      </table>
      {t.portion && (
        <p className="small muted" style={{ marginTop: 6, fontStyle: "italic" }}>
          Operating expenses for this mixed-use center are allocated between its Retail (8502) and Office (8503) portions; the pool above is the {t.portion} portion&rsquo;s share.
        </p>
      )}
    </div>
  );
}

function RetailTenantStatement({ t, reconYear, contact }: {
  t: RetailTenantResult; reconYear: number; contact?: { email: string; cc: string };
}) {
  const occLine = t.occPct < 0.9999; // only show the proration step when it prorates
  const camFull = (t.camPrs / 100) * t.camPoolEffective;
  const insFull = (t.insPrs / 100) * t.insPool;
  const retFull = (t.retPrs / 100) * t.retPool * (1 - t.retDiscountPct / 100);
  // Inline PRS basis: tenant SF ÷ center GLA (back-solved from the share, so it
  // reflects each category's own denominator). No extra rows.
  const basis = (prs: number, denom: number) => prs > 0 && denom > 0 ? ` (${t.sqft.toLocaleString()} / ${denom.toLocaleString()} SF)` : "";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <RetailScheduleTable t={t} />
      {/* Side-by-side reconciliation — CAM / INS / RET, matching the office
          statement's single-card, multi-column layout. */}
      <div className="card" style={{ display: "flex", flexWrap: "wrap", gap: 28 }}>
        <div style={{ flex: "1 1 240px", minWidth: 230 }}>
          <div style={{ ...CAT_LABEL, color: "#0b4a7d" }}>CAM</div>
          <BalanceRow label={`CAM Pool${t.capped ? " (capped)" : t.camPoolEffective < t.camPoolFull ? " (after exclusions)" : ""}`} value={money0(t.camPoolEffective)} />
          <BalanceRow label={`× CAM Share${basis(t.camPrs, t.camDenom)} ${pct(t.camPrs / 100)}`} value={money0(camFull)} />
          {occLine && <BalanceRow label={`× Occupancy ${pct(t.occPct, 1)}`} value={money0(t.camShare)} />}
          {t.adminFeePct > 0 && <BalanceRow label={`+ Admin Fee ${t.adminFeePct}%`} value={money0(t.camAdmin)} />}
          <BalanceRow label="CAM Due" value={money0(t.camDue)} strong />
          <BalanceRow label="Less: Escrow Billed" value={money0(-t.camEscrow)} />
          <FinalBalanceRow label="Balance, CAM Due" value={t.camBalance} />
        </div>
        <div style={{ flex: "1 1 240px", minWidth: 230 }}>
          <div style={{ ...CAT_LABEL, color: "#0f766e" }}>INS</div>
          <BalanceRow label="Insurance Pool" value={money0(t.insPool)} />
          <BalanceRow label={`× INS Share${basis(t.insPrs, t.insDenom)} ${pct(t.insPrs / 100)}`} value={money0(insFull)} />
          {occLine && <BalanceRow label={`× Occupancy ${pct(t.occPct, 1)}`} value={money0(t.insDue)} />}
          <BalanceRow label="INS Due" value={money0(t.insDue)} strong />
          <BalanceRow label="Less: Escrow Billed" value={money0(-t.insEscrow)} />
          <FinalBalanceRow label="Balance, INS Due" value={t.insBalance} />
        </div>
        <div style={{ flex: "1 1 240px", minWidth: 230 }}>
          <div style={{ ...CAT_LABEL, color: "#854d0e" }}>RET</div>
          {t.flatRet != null ? (
            <BalanceRow label="Own-parcel RET (100%)" value={money0(t.flatRet)} />
          ) : (
            <>
              <BalanceRow label="Real Estate Tax Pool" value={money0(t.retPool)} />
              <BalanceRow label={`× RET Share${basis(t.retPrs, t.retDenom)} ${pct(t.retPrs / 100)}${t.retDiscountPct > 0 ? ` less ${t.retDiscountPct}%` : ""}`} value={money0(retFull)} />
              {occLine && <BalanceRow label={`× Occupancy ${pct(t.occPct, 1)}`} value={money0(t.retDue)} />}
            </>
          )}
          <BalanceRow label="RET Due" value={money0(t.retDue)} strong />
          <BalanceRow label="Less: Escrow Billed" value={money0(-t.retEscrow)} />
          <FinalBalanceRow label="Balance, RET Due" value={t.retBalance} />
        </div>
      </div>

      {/* Net total lives in the header KPI pills (matches the office statement). */}
      <div className="card" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
        <span style={{ ...SECTION_LABEL, whiteSpace: "nowrap" }}>Statement to</span>
        {contact?.email
          ? <span style={{ fontSize: 13, fontWeight: 700, wordBreak: "break-all" }}>{contact.email}</span>
          : <span style={{ fontSize: 13, color: "#b91c1c", fontWeight: 600 }}>No CAM/RET recipient flagged — set one on the Contacts page</span>}
        <a href={`/rentroll/units/${encodeURIComponent(t.unitRef)}`} style={{ fontSize: 12, fontWeight: 600, color: "#0b4a7d", textDecoration: "none", marginLeft: "auto" }}>Edit contacts →</a>
      </div>
    </div>
  );
}

// One retail tenant's CAM/INS/RET statement as a branded PDF.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drawRetailStatement(doc: any, t: RetailTenantResult, year: number, propLabel: string, contact?: { email: string; cc: string }) {
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
  const at = (s: string, x: number, opts?: { align?: "right" | "center" | "left" }) => doc.text(s, x, y, opts);

  fill(NAVY); doc.rect(0, 0, PAGE_W, 84, "F");
  ink([255, 255, 255]); doc.setFont("helvetica", "bold"); doc.setFontSize(24); doc.text("KORMAN", L, 46);
  stroke([255, 255, 255]); doc.setLineWidth(0.7); doc.line(170, 26, 170, 50);
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
  doc.text("COMMERCIAL", 180, 34); doc.text("PROPERTIES", 180, 45);
  doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.text("CAM / INS / RET Reconciliation", R, 38, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.text(`${year} Year-End Statement`, R, 54, { align: "right" });

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

  // Schedule of operating expenses (the CAM line items).
  bar("Schedule of Operating Expenses");
  doc.setFontSize(9);
  t.camSchedule.forEach((l, i) => {
    if (i % 2 === 1) { fill([247, 249, 251]); doc.rect(L, y - 9, W, 13, "F"); }
    doc.setFont("helvetica", "normal");
    ink(MUTED); at(l.glAccount, L + 6);
    ink(l.billed ? INK : MUTED);
    at(l.label, L + 74);
    at(money(l.amount), R - 6, { align: "right" });
    // Excluded lines: strike the whole row through (matches the source workbook).
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

  // Full waterfall — show share, occupancy (only when < 100%), and admin.
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

  if (contact?.email) { ink(MUTED); doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); at(`Statement to: ${contact.email}`, L); y += 14; }
  stroke(LINE); doc.setLineWidth(0.6); doc.line(L, 752, R, 752);
  ink(MUTED); doc.setFontSize(8);
  doc.text("Invoices available, upon request.", L, 766);
  doc.text(`${year} CAM / INS / RET Reconciliation  ·  Suite ${t.suite}`, R, 766, { align: "right" });
}

async function downloadRetailTenantPdf(t: RetailTenantResult, year: number, propLabel: string, contact?: { email: string; cc: string }) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  drawRetailStatement(doc, t, year, propLabel, contact);
  const propCode = propLabel.split(" ")[0];
  doc.save(`${propCode}_${year}_Suite${t.suite}_${t.name.replace(/[^\w]+/g, "_")}_CAM.pdf`);
}

async function downloadAllRetailPdfs(tenants: RetailTenantResult[], year: number, propLabel: string, contacts: Record<string, { email: string; cc: string }>) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  tenants.forEach((t, i) => { if (i > 0) doc.addPage(); drawRetailStatement(doc, t, year, propLabel, contacts[t.unitRef]); });
  const propCode = propLabel.split(" ")[0];
  doc.save(`${propCode}_${year}_AllTenantStatements_CAM.pdf`);
}

// ── Building summary table ───────────────────────────────────────────────────

// Two column blocks — CAM (Op Ex) and RET — each tinted, separated by a
// rule, and capped with a spanning group header.
const CAM_TINT = "rgba(11,74,125,0.05)";
const RET_TINT = "rgba(202,138,4,0.06)";
const BLOCK_SEP = "2px solid rgba(15,23,42,0.18)";
const groupTh: React.CSSProperties = {
  textAlign: "center", padding: "5px 10px", fontSize: 11, fontWeight: 800,
  textTransform: "uppercase", letterSpacing: "0.08em",
};

// Inline-editable dollar cell. Shows the amount; click to edit. Commits on
// blur / Enter when changed. Stops row-click propagation so editing doesn't
// open the tenant statement.
// Tint marking a cell as editable, and the green "matches" tint.
const EDIT_BG = "rgba(11,74,125,0.06)";
const MATCH_BG = "rgba(22,163,74,0.16)";

function EditableMoney({ value, onCommit, whole = false, bg = EDIT_BG }: {
  value: number; onCommit: (n: number) => void; whole?: boolean; bg?: string;
}) {
  const fmt = (n: number) => whole
    ? Math.round(n).toLocaleString("en-US")
    : (Math.round(n * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(fmt(value));
  useEffect(() => { if (!editing) setText(fmt(value)); }, [value, editing, whole]);
  function commit(e: React.FocusEvent<HTMLInputElement> | React.KeyboardEvent<HTMLInputElement>) {
    setEditing(false);
    (e.currentTarget as HTMLInputElement).style.borderColor = "transparent";
    (e.currentTarget as HTMLInputElement).style.background = bg;
    const n = Number(text.replace(/[^0-9.\-]/g, ""));
    const cur = whole ? Math.round(value) : Math.round(value * 100) / 100;
    const next = whole ? Math.round(n) : Math.round(n * 100) / 100;
    if (Number.isFinite(n) && next !== cur) onCommit(next);
    else setText(fmt(value));
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "flex-end", gap: 1 }}>
      <span style={{ color: "var(--muted)" }}>$</span>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onFocus={(e) => { setEditing(true); setText(whole ? String(Math.round(value)) : String(Math.round(value * 100) / 100)); e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--card)"; e.currentTarget.select(); }}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setEditing(false); setText(fmt(value)); e.currentTarget.blur(); } }}
        title="Editable"
        style={{ width: 92, textAlign: "right", border: "1px solid transparent", borderRadius: 6, padding: "2px 5px", background: bg, color: "inherit", font: "inherit", cursor: "text" }}
      />
    </span>
  );
}

function BuildingSummary({ result, onPick, onEditEscrow }: {
  result: BuildingReconResult;
  onPick: (u: string) => void;
  onEditEscrow: (unitRef: string, field: string, value: number | null) => void;
}) {
  const { tenants, totals } = result;
  const cam = (first = false): React.CSSProperties => ({ ...td, background: CAM_TINT, ...(first ? { borderLeft: BLOCK_SEP } : {}) });
  const ret = (first = false): React.CSSProperties => ({ ...td, background: RET_TINT, ...(first ? { borderLeft: BLOCK_SEP } : {}) });
  const camH = (first = false): React.CSSProperties => ({ ...th, background: CAM_TINT, ...(first ? { borderLeft: BLOCK_SEP } : {}) });
  const retH = (first = false): React.CSSProperties => ({ ...th, background: RET_TINT, ...(first ? { borderLeft: BLOCK_SEP } : {}) });
  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <div style={CARD_TITLE}>Building Summary</div>
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10, minWidth: 920 }}>
        <thead>
          {/* Group header: identity columns, then the CAM and RET blocks */}
          <tr>
            <th colSpan={4} style={{ borderBottom: "1px solid var(--border)" }} />
            <th colSpan={3} style={{ ...groupTh, color: "#0b4a7d", background: CAM_TINT, borderLeft: BLOCK_SEP, borderBottom: "1px solid var(--border)" }}>CAM</th>
            <th colSpan={3} style={{ ...groupTh, color: "#854d0e", background: RET_TINT, borderLeft: BLOCK_SEP, borderBottom: "1px solid var(--border)" }}>RET</th>
          </tr>
          <tr>
            <th style={{ ...th, textAlign: "left" }}>Unit</th>
            <th style={{ ...th, textAlign: "left" }}>Tenant</th>
            <th style={th}>Base Yr</th>
            <th style={th}>% Share</th>
            <th style={camH(true)}>Due</th>
            <th style={camH()}>Escrow</th>
            <th style={camH()}>Balance</th>
            <th style={retH(true)}>Due</th>
            <th style={retH()}>Escrow</th>
            <th style={retH()}>Balance</th>
          </tr>
        </thead>
        <tbody>
          {tenants.map((t) => (
            <tr key={t.unitRef} style={{ borderBottom: "1px solid var(--border)", cursor: "pointer" }} onClick={() => onPick(t.unitRef)}>
              <td style={{ ...td, textAlign: "left" }}><UnitChip unitRef={t.unitRef} backTo={`/cam-recon?property=${result.propertyCode}&year=${result.reconYear}`} /></td>
              <td style={{ ...td, textAlign: "left" }}>{t.name}<OccCallout occPct={t.occPct} year={result.reconYear} rcd={t.rcd} /></td>
              <td style={td}>{t.noBaseStop ? "NNN" : t.baseYear}{t.baseYearResetISO && <span title={`Base year reset ${new Date(t.baseYearResetISO + "T00:00:00").toLocaleDateString("en-US")}`} style={{ color: "#b45309", fontWeight: 800, marginLeft: 3, cursor: "help" }}>↺</span>}</td>
              <td style={td}>{pct(t.proRataPct / 100)}</td>
              <td style={cam(true)}>{money0(t.opexAmountDue)}</td>
              <td style={cam()} onClick={(e) => e.stopPropagation()}>
                <EditableMoney value={t.opexEscrow} onCommit={(v) => onEditEscrow(t.unitRef, "opexEscrow", v)} />
              </td>
              <td style={cam()}><Pill tone={reconBalanceTone(t.opexBalance)}>{money0(t.opexBalance)}</Pill></td>
              <td style={ret(true)}>{money0(t.retAmountDue)}</td>
              <td style={ret()} onClick={(e) => e.stopPropagation()}>
                <EditableMoney value={t.retEscrow} onCommit={(v) => onEditEscrow(t.unitRef, "retEscrow", v)} />
              </td>
              <td style={ret()}><Pill tone={reconBalanceTone(t.retBalance)}>{money0(t.retBalance)}</Pill></td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 800, borderTop: "2px solid var(--border)" }}>
            <td style={{ ...td, textAlign: "left" }} colSpan={4}>Total</td>
            <td style={cam(true)}>{money0(totals.opexAmountDue)}</td>
            <td style={cam()}>{money0(totals.opexEscrow)}</td>
            <td style={cam()}>{money0(totals.opexBalance)}</td>
            <td style={ret(true)}>{money0(totals.retAmountDue)}</td>
            <td style={ret()}>{money0(totals.retEscrow)}</td>
            <td style={ret()}>{money0(totals.retBalance)}</td>
          </tr>
        </tfoot>
      </table>
      <p className="small muted" style={{ marginTop: 8 }}>Click a row to open that tenant&rsquo;s reconciliation statement.</p>
    </div>
  );
}

// ── Final Expense Summary ────────────────────────────────────────────────────

type ExpRow = {
  account: string; label: string; tbDetail: number; excelAvid: number;
  final: number; description: string; variance: number;
};

function FinalExpenseSummary({ rows, editable, year, onEdit }: {
  rows: ExpRow[];
  editable: boolean;
  year: number;
  onEdit: (account: string, field: string, value: number | string | null) => void;
}) {
  const isSep = (a: string) => a.startsWith("6120") || a.startsWith("6410"); // Electric / RET
  const opexTotal = rows.filter((r) => !isSep(r.account)).reduce((s, r) => s + r.final, 0);
  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <div style={CARD_TITLE}>Final Expense Summary</div>
      {editable ? (
        <>
          <p className="small muted" style={{ marginTop: 4 }}>
            TB Detail is the general ledger. Import Excel Avid, review the variance, then set FINAL — FINAL drives every tenant&rsquo;s CAM/RET calc and is recorded as the year&rsquo;s expense history.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginTop: 6 }}>
            <span className="small" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: EDIT_BG, border: "1px solid var(--border)", display: "inline-block" }} /> editable (Excel Avid · FINAL · Description)
            </span>
            <span className="small" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: MATCH_BG, display: "inline-block" }} /> source FINAL matches (TB Detail or Excel Avid)
            </span>
          </div>
        </>
      ) : (
        <p className="small muted" style={{ marginTop: 4 }}>
          {year} uses the operating-expense history as the final — these are the booked figures that drive every tenant&rsquo;s CAM/RET calc. GL/Avid adjustments become available from 2026.
        </p>
      )}
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10, minWidth: editable ? 860 : 420 }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: "left" }}>Acc Code</th>
            <th style={{ ...th, textAlign: "left" }}>Expense</th>
            {editable ? (
              <>
                <th style={th}>TB Detail (GL)</th>
                <th style={th}>Excel Avid</th>
                <th style={th}>Variance</th>
                <th style={th}>FINAL</th>
                <th style={{ ...th, textAlign: "left" }}>Description</th>
              </>
            ) : (
              <th style={th}>Expense (Final)</th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const matchesTB = Math.round(r.final) === Math.round(r.tbDetail);
            const matchesAvid = Math.round(r.final) === Math.round(r.excelAvid);
            return (
              <tr key={r.account} style={{ borderBottom: "1px solid var(--border)", ...(isSep(r.account) ? { borderTop: "2px solid var(--border)" } : {}) }}>
                <td style={{ ...td, textAlign: "left", color: "var(--muted)", fontSize: 12 }}>{r.account}</td>
                <td style={{ ...td, textAlign: "left" }}>{r.label}</td>
                {editable ? (
                  <>
                    <td style={{ ...td, ...(matchesTB ? { background: MATCH_BG } : {}) }}>{money0(r.tbDetail)}</td>
                    <td style={td}><EditableMoney value={r.excelAvid} whole bg={matchesAvid ? MATCH_BG : EDIT_BG} onCommit={(v) => onEdit(r.account, "excelAvid", v)} /></td>
                    <td style={{ ...td, color: Math.abs(r.variance) < 0.5 ? "var(--muted)" : r.variance < 0 ? "#b91c1c" : "#15803d" }}>{money0(r.variance)}</td>
                    <td style={{ ...td, fontWeight: 700 }}><EditableMoney value={r.final} whole onCommit={(v) => onEdit(r.account, "final", v)} /></td>
                    <td style={{ ...td, textAlign: "left" }}><EditableText value={r.description} placeholder="—" onCommit={(v) => onEdit(r.account, "description", v)} /></td>
                  </>
                ) : (
                  <td style={{ ...td, fontWeight: 700 }}>{money0(r.final)}</td>
                )}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 800, borderTop: "2px solid var(--border)" }}>
            <td style={{ ...td, textAlign: "left" }} colSpan={editable ? 5 : 2}>Total Operating Expenses (excl. Electric / RET)</td>
            <td style={td}>{money0(opexTotal)}</td>
            {editable && <td />}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── Recovery analysis by base year ───────────────────────────────────────────

const REC_CAM = "#0b4a7d";
const REC_RET = "#0d9488";

function RecoveryByBaseYear({ result }: { result: BuildingReconResult }) {
  const [hover, setHover] = useState<number | null>(null);
  const groups = useMemo(() => {
    const map = new Map<number, { cam: number; ret: number; members: { suite: string; name: string; total: number }[] }>();
    for (const t of result.tenants) {
      const g = map.get(t.baseYear) ?? { cam: 0, ret: 0, members: [] };
      g.cam += t.opexAmountDue;
      g.ret += t.retAmountDue;
      g.members.push({ suite: t.suite, name: t.name, total: t.opexAmountDue + t.retAmountDue });
      map.set(t.baseYear, g);
    }
    return [...map.entries()]
      .map(([year, v]) => ({ year, cam: v.cam, ret: v.ret, total: v.cam + v.ret, count: v.members.length, members: v.members.sort((a, b) => b.total - a.total) }))
      .sort((a, b) => a.year - b.year);
  }, [result]);

  const max = Math.max(1, ...groups.map((g) => g.total));
  const totalRecovery = groups.reduce((s, g) => s + g.total, 0);
  const H = 180;
  const hovered = hover != null ? groups.find((g) => g.year === hover) : null;

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={CARD_TITLE}>Recovery Analysis by Base Year</div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Legend color={REC_CAM} label="CAM" />
          <Legend color={REC_RET} label="RET" />
          <span className="small muted">{money0(totalRecovery)} total recovery</span>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10, marginTop: 18, overflowX: "auto", paddingBottom: 4 }} onMouseLeave={() => setHover(null)}>
        {groups.map((g) => {
          const camH = (g.cam / max) * H;
          const retH = (g.ret / max) * H;
          const dim = hover != null && hover !== g.year;
          return (
            <div
              key={g.year}
              onMouseEnter={() => setHover(g.year)}
              style={{ flex: "1 0 56px", display: "flex", flexDirection: "column", alignItems: "center", minWidth: 56, cursor: "default", opacity: dim ? 0.5 : 1, transition: "opacity 0.12s" }}
            >
              <div style={{ fontSize: 12, fontWeight: 800 }}>{money0(g.total)}</div>
              <div style={{ height: H, display: "flex", flexDirection: "column", justifyContent: "flex-end", width: 40, marginTop: 4, outline: hover === g.year ? "2px solid rgba(11,74,125,0.35)" : "none", outlineOffset: 2, borderRadius: 4 }}>
                <div style={{ height: Math.max(0, retH), background: REC_RET, borderRadius: "4px 4px 0 0" }} />
                <div style={{ height: Math.max(0, camH), background: REC_CAM, borderRadius: retH < 1 ? "4px 4px 0 0" : 0 }} />
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 6 }}>{g.year}</div>
              <div className="small muted">{g.count} {g.count === 1 ? "tenant" : "tenants"}</div>
            </div>
          );
        })}
      </div>

      {/* Hover detail — which tenants sit on the hovered base year. */}
      <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 10, minHeight: 58 }}>
        {hovered ? (
          <>
            <div className="small" style={{ fontWeight: 800, marginBottom: 8 }}>
              Base Year {hovered.year} · {hovered.count} {hovered.count === 1 ? "tenant" : "tenants"} · {money0(hovered.total)} recovery
              <span className="muted" style={{ fontWeight: 600 }}>  (CAM {money0(hovered.cam)} · RET {money0(hovered.ret)})</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {hovered.members.map((m) => (
                <Pill key={m.suite + m.name} tone={TONE_NEUTRAL}>{m.suite} · {m.name} — {money0(m.total)}</Pill>
              ))}
            </div>
          </>
        ) : (
          <span className="small muted">Hover a bar to list the tenants on that base year. Bars show total reconciled recovery (CAM + RET amount due); older base years recover more as the gap to current-year expenses widens.</span>
        )}
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span style={{ width: 11, height: 11, borderRadius: 3, background: color, display: "inline-block" }} />
      <span className="small" style={{ fontWeight: 700 }}>{label}</span>
    </span>
  );
}

// ── Per-tenant statement ─────────────────────────────────────────────────────

function ScheduleTable({ title, lines, baseYear, reconYear, totalLabel }: {
  title: string; lines: TenantReconResult["opexLines"]; baseYear: number | string; reconYear: number; totalLabel?: string;
}) {
  const baseTotal = lines.reduce((s, l) => s + l.baseCost, 0);
  const actualTotal = lines.reduce((s, l) => s + l.actual, 0);
  const incTotal = lines.reduce((s, l) => s + l.netIncrease, 0);
  // Slightly larger fonts + whole dollars for an easy-to-read statement.
  const sth: React.CSSProperties = { ...th, fontSize: 12, padding: "7px 10px" };
  const std: React.CSSProperties = { ...td, fontSize: 14.5, padding: "7px 10px" };
  return (
    // Fixed layout + shared column widths so the Op Ex and RET schedules
    // stack cleanly (B/Y over B/Y, Actual over Actual).
    <>
    <div style={CARD_TITLE}>{title}</div>
    <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", minWidth: 560, marginTop: 10 }}>
      <colgroup>
        <col style={{ width: "12%" }} />
        <col style={{ width: "32%" }} />
        <col style={{ width: "18.66%" }} />
        <col style={{ width: "18.66%" }} />
        <col style={{ width: "18.66%" }} />
      </colgroup>
      <thead>
        <tr>
          <th style={{ ...sth, textAlign: "left" }}>Acct</th>
          <th style={{ ...sth, textAlign: "left" }}>Expense</th>
          <th style={sth}>B/Y Costs ({baseYear})</th>
          <th style={sth}>Actual ({reconYear})</th>
          <th style={sth}>Net Increase</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l) => (
          <tr key={l.glAccount} style={{ borderBottom: "1px solid var(--border)" }}>
            <td style={{ ...std, textAlign: "left", color: "var(--muted)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{l.glAccount}</td>
            <td style={{ ...std, textAlign: "left" }}>{l.label}</td>
            <td style={std}>{money0(l.baseCost)}</td>
            <td style={std}>{money0(l.actual)}</td>
            <td style={{ ...std, color: l.netIncrease > 0 ? "var(--text)" : "var(--muted)" }}>{money0(l.netIncrease)}</td>
          </tr>
        ))}
      </tbody>
      {totalLabel && (
        <tfoot>
          <tr style={{ fontWeight: 800, borderTop: "2px solid var(--border)" }}>
            <td style={std} />
            <td style={{ ...std, textAlign: "left" }}>{totalLabel}</td>
            <td style={std}>{money0(baseTotal)}</td>
            <td style={std}>{money0(actualTotal)}</td>
            <td style={std}>{money0(incTotal)}</td>
          </tr>
        </tfoot>
      )}
    </table>
    </>
  );
}

function BalanceRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 10px", fontWeight: strong ? 800 : 500, fontSize: strong ? 15.5 : 14 }}>
      <span style={strong ? undefined : { color: "var(--muted)" }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

// The bottom-line balance — boxed + tone-colored (green credit / amber owed)
// so it stands out from the rest of the waterfall.
function FinalBalanceRow({ label, value }: { label: string; value: number }) {
  const tone = reconBalanceTone(value);
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
      marginTop: 8, padding: "9px 12px", borderRadius: 8,
      background: tone.bg, border: `1.5px solid ${tone.border}`,
      fontWeight: 800, fontSize: 16.5,
    }}>
      <span>{label}</span>
      <span style={{ color: tone.fg }}>{money0(value)}</span>
    </div>
  );
}

// Inline-editable text (email / cc). Commits on blur when changed.
function EditableText({ value, placeholder, onCommit }: { value: string; placeholder: string; onCommit: (s: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => { setText(value); }, [value]);
  return (
    <input
      value={text}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={(e) => { e.currentTarget.style.borderColor = "transparent"; e.currentTarget.style.background = EDIT_BG; if (text !== value) onCommit(text.trim()); }}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setText(value); e.currentTarget.blur(); } }}
      onFocus={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--card)"; }}
      style={{ minWidth: 240, flex: 1, border: "1px solid transparent", borderRadius: 6, padding: "3px 6px", background: EDIT_BG, color: "inherit", font: "inherit", fontSize: 13 }}
    />
  );
}

function TenantStatement({ t, reconYear, estimate, contact }: {
  t: TenantReconResult; reconYear: number; estimate?: NextYearEstimate;
  contact?: { email: string; cc: string };
}) {
  const occLine = t.occPct < 0.9999; // only show the proration step when it prorates
  const occLabel = `${pct(t.occPct, 1)}${t.occPct < 0.9999 && t.rcd ? ` (${fmtRCD(t.rcd)} RCD)` : ""}`;
  const resetRel = t.occPct > 0 ? t.recoveryPct / t.occPct : 0;
  const resetShort = t.baseYearResetISO
    ? new Date(t.baseYearResetISO + "T00:00:00").toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit" })
    : "";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Expense schedules — CAM then RET */}
      <div className="card" style={{ overflowX: "auto" }}>
        <ScheduleTable title="Schedule of Operating Expenses" lines={t.opexLines} baseYear={t.noBaseStop ? "none" : t.baseYear} reconYear={reconYear} totalLabel="Total Operating Expenses" />
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <ScheduleTable title="Real Estate Taxes" lines={[t.retLine]} baseYear={t.noBaseStop ? "none" : t.baseYear} reconYear={reconYear} />
      </div>

      {/* Side-by-side reconciliation — CAM and RET calculations */}
      <div className="card" style={{ display: "flex", flexWrap: "wrap", gap: 28 }}>
        <div style={{ flex: "1 1 300px", minWidth: 280 }}>
          <div style={{ ...CAT_LABEL, color: "#0b4a7d" }}>CAM</div>
          <BalanceRow label="Net Increase Over Base Year" value={money0(t.opexNetIncrease)} />
          <BalanceRow label="× Tenant Proportionate Share" value={pct(t.proRataPct / 100)} />
          {occLine && <BalanceRow label="× Occupancy % For The Year" value={occLabel} />}
          {t.baseYearResetISO && <BalanceRow label={`× Base Year Reset Proration (${resetShort})`} value={pct(resetRel, 1)} />}
          <BalanceRow label="Amount Due" value={money0(t.opexAmountDue)} strong />
          <BalanceRow label="Less: Escrow Payments for the Year" value={money0(-t.opexEscrow)} />
          <FinalBalanceRow label="Balance, Op Ex Costs Due" value={t.opexBalance} />
        </div>
        <div style={{ flex: "1 1 300px", minWidth: 280 }}>
          <div style={{ ...CAT_LABEL, color: "#854d0e" }}>RET</div>
          <BalanceRow label="Net Increase Over Base Year" value={money0(t.retLine.netIncrease)} />
          <BalanceRow label="× Tenant Proportionate Share" value={pct(t.proRataPct / 100)} />
          {occLine && <BalanceRow label="× Occupancy % For The Year" value={occLabel} />}
          {t.baseYearResetISO && <BalanceRow label={`× Base Year Reset Proration (${resetShort})`} value={pct(resetRel, 1)} />}
          <BalanceRow label="Amount Due" value={money0(t.retAmountDue)} strong />
          <BalanceRow label="Less: Escrow Payments for the Year" value={money0(-t.retEscrow)} />
          <FinalBalanceRow label="Balance, Real Estate Taxes Due" value={t.retBalance} />
        </div>
      </div>

      {t.baseYearResetISO && (
        <p className="small muted" style={{ margin: 0 }}>
          Base year was reset on {new Date(t.baseYearResetISO + "T00:00:00").toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" })} — occupancy is full-year, but recovery is prorated through the day before the reset (after which the new base year applies and no further increase accrues).
        </p>
      )}
      {t.futureBaseYear && (
        <p className="small muted" style={{ margin: 0 }}>
          Base year {t.baseYear} is after the {reconYear} reconciliation year, so no recovery is due.
        </p>
      )}

      {/* Billing contact — read-only; the tenant's Contacts page is the
          master source of truth for who receives the statement. CC is the
          constant internal default and isn't shown per tenant. */}
      <div className="card" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
        <span style={{ ...SECTION_LABEL, whiteSpace: "nowrap" }}>Statement to</span>
        {contact?.email ? (
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", wordBreak: "break-all" }}>{contact.email}</span>
        ) : (
          <span style={{ fontSize: 13, color: "#b91c1c", fontWeight: 600 }}>
            No CAM/RET recipient flagged — set one on the Contacts page
          </span>
        )}
        <a
          href={`/rentroll/units/${encodeURIComponent(t.unitRef)}`}
          style={{ fontSize: 12, fontWeight: 600, color: "#0b4a7d", textDecoration: "none", marginLeft: "auto" }}
        >
          Edit contacts →
        </a>
      </div>
    </div>
  );
}

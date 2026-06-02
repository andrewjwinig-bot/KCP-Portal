"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pill, StatPill, reconBalanceTone, TONE_NEUTRAL, TONE_AMBER } from "@/app/components/Pill";
import { Calendar } from "@/app/components/Calendar";
import {
  yearEndAdjustmentRows,
  estimateChargeRows,
  chargeRowsToCSV,
  type NextYearEstimate,
} from "@/lib/cam/office/exports";
import type { BuildingReconResult, TenantReconResult } from "@/lib/cam/office/types";

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

const SECTION_LABEL: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)",
};
const th: React.CSSProperties = {
  textAlign: "right", padding: "6px 10px", fontSize: 11, fontWeight: 700,
  textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--muted)",
  borderBottom: "1px solid var(--border)", whiteSpace: "nowrap",
};
const td: React.CSSProperties = { textAlign: "right", padding: "6px 10px", fontSize: 13, whiteSpace: "nowrap" };

type Available = { propertyCode: string; name: string; years: number[] };

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
  at(`Base Year ${t.baseYear}   ·   ${t.grossUp ? "Grossed Up to 95%" : "Not Grossed Up"}   ·   ${pct(t.proRataPct / 100)} Share   ·   ${pct(t.occPct, 1)} Occupancy`, L);
  y += 28;

  const sectionBar = (title: string, withCols: boolean) => {
    fill(TINT); doc.rect(L, y - 11, W, 18, "F");
    ink(NAVY); doc.setFont("helvetica", "bold"); doc.setFontSize(9);
    at(title.toUpperCase(), L + 6);
    if (withCols) {
      doc.setFontSize(8);
      at(`B/Y ${t.baseYear}`, cols[0], { align: "right" });
      at(`Actual ${year}`, cols[1], { align: "right" });
      at("Net Increase", cols[2] - 6, { align: "right" });
    }
    y += 22; ink(INK); doc.setFontSize(10);
  };
  const lineRow = (i: number, label: string, b: number, a: number, n: number, bold = false) => {
    if (!bold && i % 2 === 1) { fill(ZEBRA); doc.rect(L, y - 10, W, 15, "F"); }
    doc.setFont("helvetica", bold ? "bold" : "normal");
    ink(bold ? NAVY : INK);
    at(label, L + 6);
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
  t.opexLines.forEach((l, i) => lineRow(i, l.label, l.baseCost, l.actual, l.netIncrease));
  stroke(NAVY); doc.setLineWidth(0.8); doc.line(L, y - 11, R, y - 11);
  lineRow(0, "Total Operating Expenses", t.opexBaseTotal, t.opexActualTotal, t.opexNetIncrease, true);
  y += 6;
  sumRow("Net Increase Over Base Year", money(t.opexNetIncrease));
  sumRow("× Tenant Proportionate Share", pct(t.proRataPct / 100));
  sumRow(`× Occupancy % For The Year${t.baseYearResetISO ? " *" : ""}`, pct(t.occPct, 1));
  sumRow("Amount Due", money(t.opexAmountDue), true);
  sumRow("Less: Escrow Payments for the Year", money(-t.opexEscrow));
  sumRow("Balance, Op Ex Costs Due", money(t.opexBalance), true);
  y += 20;

  // ── Real estate taxes ────────────────────────────────────────────────────
  sectionBar("Real Estate Taxes", true);
  lineRow(0, t.retLine.label, t.retLine.baseCost, t.retLine.actual, t.retLine.netIncrease);
  y += 6;
  sumRow("× Tenant Proportionate Share", pct(t.proRataPct / 100));
  sumRow(`× Occupancy % For The Year${t.baseYearResetISO ? " *" : ""}`, pct(t.occPct, 1));
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
  doc.text("Korman Commercial Properties", L, 766);
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
  const [estimates, setEstimates] = useState<NextYearEstimate[]>([]);
  const [contacts, setContacts] = useState<Record<string, { email: string; cc: string }>>({});
  const [expenseSummary, setExpenseSummary] = useState<ExpRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [yeDate, setYeDate] = useState("");
  const [estDate, setEstDate] = useState("");

  useEffect(() => {
    fetch("/api/cam-recon/office")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const list: Available[] = j?.available ?? [];
        setAvailable(list);
        if (list.length) {
          setProperty(list[0].propertyCode);
          setYear(list[0].years[0]);
        }
      })
      .catch(() => {});
  }, []);

  const loadResult = useCallback(async () => {
    if (!property || !year) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/cam-recon/office?property=${property}&year=${year}`);
      const j = r.ok ? await r.json() : null;
      setResult(j?.result ?? null);
      setEstimates(j?.estimates ?? []);
      setContacts(j?.contacts ?? {});
      setExpenseSummary(j?.expenseSummary ?? []);
    } finally {
      setLoading(false);
    }
  }, [property, year]);

  // Property/year change: reset selection + export dates, then load.
  useEffect(() => {
    if (!property || !year) return;
    setYeDate(`${year + 1}-04-30`);
    setEstDate(`${year + 1}-01-01`);
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
  const selected = unit === "ALL" ? null : tenants.find((t) => t.unitRef === unit) ?? null;
  const totals = result?.totals;
  const propName = available.find((a) => a.propertyCode === property)?.name ?? "";

  // Headline pills follow the selection: a tenant's balances when one is
  // picked, otherwise the building totals. Office has no separate insurance
  // recovery (insurance is a CAM line), so INS shows $0.
  const camDue = selected ? selected.opexBalance : totals?.opexBalance ?? 0;
  const retDue = selected ? selected.retBalance : totals?.retBalance ?? 0;
  const insDue = 0;
  const totalDue = camDue + insDue + retDue;
  // A negative balance is a credit owed back to the tenant; positive is
  // collected from the tenant. (Zero → no direction shown.)
  const direction = (v: number) => (v < -0.005 ? "to tenants" : v > 0.005 ? "from tenants" : "");

  function exportEstimate() {
    if (!result) return;
    downloadCSV(`${property}_${year + 1}_CAM_RET_Estimate.csv`, chargeRowsToCSV(estimateChargeRows(result, estDate)));
  }
  // One compiled year-end adjustment schedule across every office property
  // for the selected year — a single one-time Skyline import.
  const [compiling, setCompiling] = useState(false);
  async function downloadAllYearEnd() {
    setCompiling(true);
    try {
      const rows: ReturnType<typeof yearEndAdjustmentRows> = [];
      for (const a of available) {
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
            <HeaderSelect value={unit} onChange={setUnit} displayLabel={selected ? `${selected.suite} — ${selected.name}` : "All Tenants"} ariaLabel="Tenant" muted>
              <option value="ALL">All Tenants</option>
              {tenants.map((t) => <option key={t.unitRef} value={t.unitRef}>{t.suite} — {t.name}</option>)}
            </HeaderSelect>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {selected && (
              <button onClick={() => downloadTenantPdf(selected, year, `${property} — ${propName}`, contacts[selected.unitRef])} className="btn primary" style={{ fontSize: 13, padding: "8px 14px", fontWeight: 700 }}>Download PDF</button>
            )}
            <button onClick={() => result && downloadAllTenantPdfs(result.tenants, year, `${property} — ${propName}`, contacts)} disabled={!result} className="btn" style={{ fontSize: 13, padding: "8px 14px", fontWeight: 700 }}>All Tenant PDFs</button>
            <button onClick={exportEstimate} disabled={!result} className="btn" style={{ fontSize: 13, padding: "8px 14px", fontWeight: 700 }}>{year + 1} Estimate</button>
          </div>
        </div>

        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {selected ? (
            <>
              <Pill tone={TONE_NEUTRAL}>{selected.baseYear} Base Year</Pill>
              <Pill tone={TONE_NEUTRAL}>{selected.grossUp ? "Grossed Up 95%" : "Not Grossed Up"}</Pill>
              <Pill tone={TONE_NEUTRAL}>{pct(selected.proRataPct / 100)} Share</Pill>
              {selected.occPct < 0.9999 && <Pill tone={TONE_NEUTRAL}>{pct(selected.occPct, 1)} Occupancy</Pill>}
              {selected.baseYearResetISO && <Pill tone={TONE_AMBER}>Base Year Reset</Pill>}
              {selected.futureBaseYear && <Pill tone={TONE_AMBER}>No Recovery — Future Base Year</Pill>}
            </>
          ) : (
            <span className="muted small">{tenants.length} tenants reconciled · base-year expense recovery, year-end true-up</span>
          )}
        </div>

        <div className="pills">
          <StatPill label={`CAM Due${direction(camDue) ? ` · ${direction(camDue)}` : ""}`} value={money0(Math.abs(camDue))} accent={reconBalanceTone(camDue).fg} />
          <StatPill label={`INS Due${direction(insDue) ? ` · ${direction(insDue)}` : ""}`} value={money0(Math.abs(insDue))} />
          <StatPill label={`RET Due${direction(retDue) ? ` · ${direction(retDue)}` : ""}`} value={money0(Math.abs(retDue))} accent={reconBalanceTone(retDue).fg} />
          <StatPill label={`Total Due${direction(totalDue) ? ` · ${direction(totalDue)}` : ""}`} value={money0(Math.abs(totalDue))} accent={reconBalanceTone(totalDue).fg} />
        </div>
      </div>

      {loading && <div className="card"><div className="muted small">Loading…</div></div>}

      {!selected && result && <BuildingSummary result={result} onPick={setUnit} onEditEscrow={saveField} />}
      {!selected && result && <RecoveryByBaseYear result={result} />}
      {!selected && expenseSummary.length > 0 && <FinalExpenseSummary rows={expenseSummary} onEdit={saveExpense} />}
      {selected && <TenantStatement t={selected} reconYear={year} estimate={estimates.find((e) => e.unitRef === selected.unitRef)} contact={contacts[selected.unitRef]} onEdit={saveField} />}

      {/* Year-End Adjustments — one compiled schedule across every office
          property, hit once at year end. Lives at the bottom for that
          reason. */}
      {result && (
        <div className="card">
          <div style={SECTION_LABEL}>Year-End Adjustments — All Office Properties</div>
          <p className="small muted" style={{ marginTop: 6 }}>
            One compiled YEC / YER schedule across every office property for {year} — a single one-time Skyline import.
          </p>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end", marginTop: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="small muted">One-time true-up posted on:</span>
              <Calendar value={yeDate} variant="card" onChange={setYeDate} />
            </div>
            <button onClick={downloadAllYearEnd} disabled={compiling} className="btn primary" style={{ fontSize: 13, padding: "9px 14px", fontWeight: 700 }}>
              {compiling ? "Compiling…" : "Download All Year-End Adjustments CSV"}
            </button>
          </div>
          <p className="small muted" style={{ marginTop: 14, marginBottom: 0 }}>
            Values-only (no header), $0 rows omitted — paste into Skyline Data Import → Unit Charges.
          </p>
        </div>
      )}
    </main>
  );
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
      <div style={SECTION_LABEL}>Building Summary — {result.propertyCode} · {result.reconYear}</div>
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10, minWidth: 920 }}>
        <thead>
          {/* Group header: identity columns, then the CAM and RET blocks */}
          <tr>
            <th colSpan={5} style={{ borderBottom: "1px solid var(--border)" }} />
            <th colSpan={3} style={{ ...groupTh, color: "#0b4a7d", background: CAM_TINT, borderLeft: BLOCK_SEP, borderBottom: "1px solid var(--border)" }}>CAM</th>
            <th colSpan={3} style={{ ...groupTh, color: "#854d0e", background: RET_TINT, borderLeft: BLOCK_SEP, borderBottom: "1px solid var(--border)" }}>RET</th>
          </tr>
          <tr>
            <th style={{ ...th, textAlign: "left" }}>Suite</th>
            <th style={{ ...th, textAlign: "left" }}>Tenant</th>
            <th style={th}>Base Yr</th>
            <th style={th}>% Share</th>
            <th style={th}>% Occ</th>
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
              <td style={{ ...td, textAlign: "left", fontWeight: 700 }}>{t.suite}</td>
              <td style={{ ...td, textAlign: "left" }}>{t.name}</td>
              <td style={td}>{t.baseYear}</td>
              <td style={td}>{pct(t.proRataPct / 100)}</td>
              <td style={td}>{pct(t.occPct, 1)}</td>
              <td style={cam(true)}>{money(t.opexAmountDue)}</td>
              <td style={cam()} onClick={(e) => e.stopPropagation()}>
                <EditableMoney value={t.opexEscrow} onCommit={(v) => onEditEscrow(t.unitRef, "opexEscrow", v)} />
              </td>
              <td style={cam()}><Pill tone={reconBalanceTone(t.opexBalance)}>{money(t.opexBalance)}</Pill></td>
              <td style={ret(true)}>{money(t.retAmountDue)}</td>
              <td style={ret()} onClick={(e) => e.stopPropagation()}>
                <EditableMoney value={t.retEscrow} onCommit={(v) => onEditEscrow(t.unitRef, "retEscrow", v)} />
              </td>
              <td style={ret()}><Pill tone={reconBalanceTone(t.retBalance)}>{money(t.retBalance)}</Pill></td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 800, borderTop: "2px solid var(--border)" }}>
            <td style={{ ...td, textAlign: "left" }} colSpan={5}>Total</td>
            <td style={cam(true)}>{money(totals.opexAmountDue)}</td>
            <td style={cam()}>{money(totals.opexEscrow)}</td>
            <td style={cam()}>{money(totals.opexBalance)}</td>
            <td style={ret(true)}>{money(totals.retAmountDue)}</td>
            <td style={ret()}>{money(totals.retEscrow)}</td>
            <td style={ret()}>{money(totals.retBalance)}</td>
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

function FinalExpenseSummary({ rows, onEdit }: {
  rows: ExpRow[];
  onEdit: (account: string, field: string, value: number | string | null) => void;
}) {
  const isSep = (a: string) => a.startsWith("6120") || a.startsWith("6410"); // Electric / RET
  const opexTotal = rows.filter((r) => !isSep(r.account)).reduce((s, r) => s + r.final, 0);
  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <div style={SECTION_LABEL}>Final Expense Summary</div>
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
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10, minWidth: 860 }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: "left" }}>Acc Code</th>
            <th style={{ ...th, textAlign: "left" }}>Expense</th>
            <th style={th}>TB Detail (GL)</th>
            <th style={th}>Excel Avid</th>
            <th style={th}>Variance</th>
            <th style={th}>FINAL</th>
            <th style={{ ...th, textAlign: "left" }}>Description</th>
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
                <td style={{ ...td, ...(matchesTB ? { background: MATCH_BG } : {}) }}>{money0(r.tbDetail)}</td>
                <td style={td}><EditableMoney value={r.excelAvid} whole bg={matchesAvid ? MATCH_BG : EDIT_BG} onCommit={(v) => onEdit(r.account, "excelAvid", v)} /></td>
                <td style={{ ...td, color: Math.abs(r.variance) < 0.5 ? "var(--muted)" : r.variance < 0 ? "#b91c1c" : "#15803d" }}>{money0(r.variance)}</td>
                <td style={{ ...td, fontWeight: 700 }}><EditableMoney value={r.final} whole onCommit={(v) => onEdit(r.account, "final", v)} /></td>
                <td style={{ ...td, textAlign: "left" }}><EditableText value={r.description} placeholder="—" onCommit={(v) => onEdit(r.account, "description", v)} /></td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 800, borderTop: "2px solid var(--border)" }}>
            <td style={{ ...td, textAlign: "left" }} colSpan={5}>Total Operating Expenses (excl. Electric / RET)</td>
            <td style={td}>{money0(opexTotal)}</td>
            <td />
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
        <div style={SECTION_LABEL}>Recovery Analysis by Base Year</div>
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
  title: string; lines: TenantReconResult["opexLines"]; baseYear: number; reconYear: number; totalLabel?: string;
}) {
  const baseTotal = lines.reduce((s, l) => s + l.baseCost, 0);
  const actualTotal = lines.reduce((s, l) => s + l.actual, 0);
  const incTotal = lines.reduce((s, l) => s + l.netIncrease, 0);
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
      <thead>
        <tr>
          <th style={{ ...th, textAlign: "left" }}>{title}</th>
          <th style={th}>B/Y Costs ({baseYear})</th>
          <th style={th}>Actual ({reconYear})</th>
          <th style={th}>Net Increase</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l) => (
          <tr key={l.glAccount} style={{ borderBottom: "1px solid var(--border)" }}>
            <td style={{ ...td, textAlign: "left" }}>{l.label}</td>
            <td style={td}>{money(l.baseCost)}</td>
            <td style={td}>{money(l.actual)}</td>
            <td style={{ ...td, color: l.netIncrease > 0 ? "var(--text)" : "var(--muted)" }}>{money(l.netIncrease)}</td>
          </tr>
        ))}
      </tbody>
      {totalLabel && (
        <tfoot>
          <tr style={{ fontWeight: 800, borderTop: "2px solid var(--border)" }}>
            <td style={{ ...td, textAlign: "left" }}>{totalLabel}</td>
            <td style={td}>{money(baseTotal)}</td>
            <td style={td}>{money(actualTotal)}</td>
            <td style={td}>{money(incTotal)}</td>
          </tr>
        </tfoot>
      )}
    </table>
  );
}

function BalanceRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 10px", fontWeight: strong ? 800 : 500, fontSize: strong ? 14 : 13 }}>
      <span style={strong ? undefined : { color: "var(--muted)" }}>{label}</span>
      <span>{value}</span>
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

function TenantStatement({ t, reconYear, estimate, contact, onEdit }: {
  t: TenantReconResult; reconYear: number; estimate?: NextYearEstimate;
  contact?: { email: string; cc: string };
  onEdit: (unitRef: string, field: string, value: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Billing contact — where the statement is circulated, plus CC. */}
      <div className="card" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <span style={{ ...SECTION_LABEL, whiteSpace: "nowrap" }}>Statement to</span>
        <EditableText value={contact?.email ?? ""} placeholder="tenant@email.com" onCommit={(v) => onEdit(t.unitRef, "email", v)} />
        <span style={{ ...SECTION_LABEL, whiteSpace: "nowrap" }}>CC</span>
        <EditableText value={contact?.cc ?? ""} placeholder="cc@kormancommercial.com" onCommit={(v) => onEdit(t.unitRef, "cc", v)} />
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <ScheduleTable title="Schedule of Operating Expenses" lines={t.opexLines} baseYear={t.baseYear} reconYear={reconYear} totalLabel="Total Operating Expenses" />
        <div style={{ borderTop: "2px solid var(--border)", marginTop: 8, paddingTop: 8, maxWidth: 420, marginLeft: "auto" }}>
          <BalanceRow label="Net Increase Over Base Year" value={money(t.opexNetIncrease)} />
          <BalanceRow label="× Tenant Proportionate Share" value={pct(t.proRataPct / 100)} />
          <BalanceRow label={`× Occupancy % For The Year${t.baseYearResetISO ? " *" : ""}`} value={pct(t.occPct, 1)} />
          <BalanceRow label="Amount Due" value={money(t.opexAmountDue)} strong />
          <BalanceRow label="Less: Escrow Payments for the Year" value={money(-t.opexEscrow)} />
          <BalanceRow label="Balance, Op Ex Costs Due" value={money(t.opexBalance)} strong />
        </div>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <ScheduleTable title="Real Estate Taxes" lines={[t.retLine]} baseYear={t.baseYear} reconYear={reconYear} />
        <div style={{ borderTop: "2px solid var(--border)", marginTop: 8, paddingTop: 8, maxWidth: 420, marginLeft: "auto" }}>
          <BalanceRow label="Net Increase Over Base Year" value={money(t.retLine.netIncrease)} />
          <BalanceRow label="× Tenant Proportionate Share" value={pct(t.proRataPct / 100)} />
          <BalanceRow label={`× Occupancy % For The Year${t.baseYearResetISO ? " *" : ""}`} value={pct(t.occPct, 1)} />
          <BalanceRow label="Amount Due" value={money(t.retAmountDue)} strong />
          <BalanceRow label="Less: Escrow Payments for the Year" value={money(-t.retEscrow)} />
          <BalanceRow label="Balance, Real Estate Taxes Due" value={money(t.retBalance)} strong />
        </div>
      </div>

      {t.baseYearResetISO && (
        <p className="small muted" style={{ margin: 0 }}>
          * Tenant&rsquo;s base year was reset on {new Date(t.baseYearResetISO + "T00:00:00").toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" })}; recovery is prorated through the reset date.
        </p>
      )}
      {t.futureBaseYear && (
        <p className="small muted" style={{ margin: 0 }}>
          Base year {t.baseYear} is after the {reconYear} reconciliation year, so no recovery is due.
        </p>
      )}

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
        <Pill tone={reconBalanceTone(t.opexBalance + t.retBalance)}>
          Net true-up: {money(t.opexBalance + t.retBalance)} {(t.opexBalance + t.retBalance) < 0 ? "(credit to tenant)" : "(owed by tenant)"}
        </Pill>
        {estimate && (
          <span className="small muted">
            {reconYear + 1} estimate: {money(estimate.monthlyCam)}/mo CAM · {money(estimate.monthlyRet)}/mo RET
          </span>
        )}
      </div>
    </div>
  );
}

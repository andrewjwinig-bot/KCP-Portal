"use client";

import { useEffect, useMemo, useState } from "react";
import { Pill, StatPill, reconBalanceTone, TONE_BLUE, TONE_NEUTRAL } from "@/app/components/Pill";
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
function pct(n: number, dp = 2): string {
  return (n * 100).toFixed(dp) + "%";
}

const SECTION_LABEL: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--muted)",
};
const selectStyle: React.CSSProperties = {
  padding: "7px 10px",
  borderRadius: 9,
  border: "1px solid var(--border)",
  background: "var(--card)",
  color: "var(--text)",
  fontSize: 14,
  fontWeight: 700,
};
const th: React.CSSProperties = {
  textAlign: "right",
  padding: "6px 10px",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "var(--muted)",
  borderBottom: "1px solid var(--border)",
  whiteSpace: "nowrap",
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

export default function OfficeCamReconPage() {
  const [available, setAvailable] = useState<Available[]>([]);
  const [property, setProperty] = useState<string>("");
  const [year, setYear] = useState<number>(0);
  const [unit, setUnit] = useState<string>("ALL");
  const [result, setResult] = useState<BuildingReconResult | null>(null);
  const [estimates, setEstimates] = useState<NextYearEstimate[]>([]);
  const [loading, setLoading] = useState(false);

  // Effective dates for the two Skyline uploads.
  const [yeDate, setYeDate] = useState("");
  const [estDate, setEstDate] = useState("");

  // Load the list of available building/year reconciliations.
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

  // Load a specific reconciliation.
  useEffect(() => {
    if (!property || !year) return;
    setLoading(true);
    fetch(`/api/cam-recon/office?property=${property}&year=${year}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        setResult(j?.result ?? null);
        setEstimates(j?.estimates ?? []);
        setYeDate(`${year + 1}-04-30`);
        setEstDate(`${year + 1}-01-01`);
        setUnit("ALL");
      })
      .finally(() => setLoading(false));
  }, [property, year]);

  const years = available.find((a) => a.propertyCode === property)?.years ?? [];
  const tenants = result?.tenants ?? [];
  const selected = unit === "ALL" ? null : tenants.find((t) => t.unitRef === unit) ?? null;

  const totals = result?.totals;

  function exportYearEnd() {
    if (!result) return;
    const rows = yearEndAdjustmentRows(result, yeDate);
    downloadCSV(`${property}_${year}_YearEndAdjustments.csv`, chargeRowsToCSV(rows));
  }
  function exportEstimate() {
    if (!result) return;
    const rows = estimateChargeRows(result, estDate);
    downloadCSV(`${property}_${year + 1}_CAM_RET_Estimate.csv`, chargeRowsToCSV(rows));
  }

  return (
    <div style={{ padding: "24px 28px", maxWidth: 1180, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Office CAM / RET Reconciliation</h1>
        <span className="small muted">Base-year expense recovery — year-end true-up</span>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end", marginTop: 18 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={SECTION_LABEL}>Building</span>
          <select style={selectStyle} value={property} onChange={(e) => setProperty(e.target.value)}>
            {available.map((a) => (
              <option key={a.propertyCode} value={a.propertyCode}>
                {a.propertyCode} — {a.name}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={SECTION_LABEL}>Recon Year</span>
          <select style={selectStyle} value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={SECTION_LABEL}>Tenant</span>
          <select style={{ ...selectStyle, minWidth: 260 }} value={unit} onChange={(e) => setUnit(e.target.value)}>
            <option value="ALL">All Tenants — Building Summary</option>
            {tenants.map((t) => (
              <option key={t.unitRef} value={t.unitRef}>
                {t.suite} — {t.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading && <p className="muted" style={{ marginTop: 24 }}>Loading…</p>}

      {/* KPIs */}
      {totals && (
        <div className="pills" style={{ marginTop: 20 }}>
          <StatPill label="Op Ex true-up" value={money(totals.opexBalance)} sub={`${money(totals.opexAmountDue)} due · ${money(-totals.opexEscrow)} escrow`} />
          <StatPill label="RET true-up" value={money(totals.retBalance)} sub={`${money(totals.retAmountDue)} due · ${money(-totals.retEscrow)} escrow`} />
          <StatPill label="Combined net" value={money(totals.opexBalance + totals.retBalance)} accent={(totals.opexBalance + totals.retBalance) < 0 ? "#15803d" : "#b45309"} />
          <StatPill label="Tenants reconciled" value={tenants.length} />
        </div>
      )}

      {/* Building summary */}
      {!selected && result && (
        <BuildingSummary result={result} onPick={setUnit} />
      )}

      {/* Per-tenant statement */}
      {selected && <TenantStatement t={selected} reconYear={year} estimate={estimates.find((e) => e.unitRef === selected.unitRef)} />}

      {/* Exports */}
      {result && (
        <div style={{ marginTop: 32, padding: 18, border: "1px solid var(--border)", borderRadius: 12, background: "var(--card)" }}>
          <div style={SECTION_LABEL}>Skyline Exports</div>
          <div style={{ display: "flex", gap: 28, flexWrap: "wrap", marginTop: 14 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span className="small" style={{ fontWeight: 700 }}>Year End Adjustments (YEC / YER)</span>
              <span className="small muted">One-time true-up posted on:</span>
              <Calendar value={yeDate} variant="card" onChange={setYeDate} />
              <button onClick={exportYearEnd} style={primaryBtn}>Download Year End Adjustments CSV</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span className="small" style={{ fontWeight: 700 }}>{year + 1} CAM / RET Estimate</span>
              <span className="small muted">Recurring monthly charge effective:</span>
              <Calendar value={estDate} variant="card" onChange={setEstDate} />
              <button onClick={exportEstimate} style={primaryBtn}>Download Next-Year Estimate CSV</button>
            </div>
          </div>
          <p className="small muted" style={{ marginTop: 14, marginBottom: 0 }}>
            CSVs are values-only (no header) and omit $0 rows — paste directly into Skyline Data Import → Unit Charges.
          </p>
        </div>
      )}
    </div>
  );
}

const primaryBtn: React.CSSProperties = {
  marginTop: 4,
  padding: "9px 14px",
  borderRadius: 9,
  border: "none",
  background: "#1e4976",
  color: "#fff",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

// ── Building summary table ───────────────────────────────────────────────────

function BuildingSummary({ result, onPick }: { result: BuildingReconResult; onPick: (u: string) => void }) {
  const { tenants, totals } = result;
  return (
    <div style={{ marginTop: 24, overflowX: "auto" }}>
      <div style={SECTION_LABEL}>Building Summary — {result.propertyCode} · {result.reconYear}</div>
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10, minWidth: 920 }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: "left" }}>Suite</th>
            <th style={{ ...th, textAlign: "left" }}>Tenant</th>
            <th style={th}>Base Yr</th>
            <th style={th}>% Share</th>
            <th style={th}>% Occ</th>
            <th style={th}>Op Ex Due</th>
            <th style={th}>Op Ex Escrow</th>
            <th style={th}>Op Ex Balance</th>
            <th style={th}>RET Due</th>
            <th style={th}>RET Escrow</th>
            <th style={th}>RET Balance</th>
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
              <td style={td}>{money(t.opexAmountDue)}</td>
              <td style={{ ...td, color: "var(--muted)" }}>{money(-t.opexEscrow)}</td>
              <td style={td}><Pill tone={reconBalanceTone(t.opexBalance)}>{money(t.opexBalance)}</Pill></td>
              <td style={td}>{money(t.retAmountDue)}</td>
              <td style={{ ...td, color: "var(--muted)" }}>{money(-t.retEscrow)}</td>
              <td style={td}><Pill tone={reconBalanceTone(t.retBalance)}>{money(t.retBalance)}</Pill></td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 800, borderTop: "2px solid var(--border)" }}>
            <td style={{ ...td, textAlign: "left" }} colSpan={5}>Total</td>
            <td style={td}>{money(totals.opexAmountDue)}</td>
            <td style={td}>{money(-totals.opexEscrow)}</td>
            <td style={td}>{money(totals.opexBalance)}</td>
            <td style={td}>{money(totals.retAmountDue)}</td>
            <td style={td}>{money(-totals.retEscrow)}</td>
            <td style={td}>{money(totals.retBalance)}</td>
          </tr>
        </tfoot>
      </table>
      <p className="small muted" style={{ marginTop: 8 }}>Click a row to open that tenant&rsquo;s reconciliation statement.</p>
    </div>
  );
}

// ── Per-tenant statement ─────────────────────────────────────────────────────

function ScheduleTable({ title, lines, baseYear, reconYear }: {
  title: string;
  lines: TenantReconResult["opexLines"];
  baseYear: number;
  reconYear: number;
}) {
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

function TenantStatement({ t, reconYear, estimate }: { t: TenantReconResult; reconYear: number; estimate?: NextYearEstimate }) {
  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{t.name}</h2>
        <Pill tone={TONE_BLUE}>Suite {t.suite}</Pill>
        <Pill tone={TONE_NEUTRAL}>Base Year {t.baseYear}</Pill>
        <Pill tone={TONE_NEUTRAL}>{t.grossUp ? "Grossed up 95%" : "Not grossed up"}</Pill>
        <Pill tone={TONE_NEUTRAL}>{pct(t.proRataPct / 100)} share</Pill>
        {t.occPct < 0.9999 && <Pill tone={TONE_NEUTRAL}>{pct(t.occPct, 1)} occ</Pill>}
      </div>

      {/* Operating expenses */}
      <div style={{ marginTop: 18, padding: 16, border: "1px solid var(--border)", borderRadius: 12, background: "var(--card)", overflowX: "auto" }}>
        <ScheduleTable title="Schedule of Operating Expenses" lines={t.opexLines} baseYear={t.baseYear} reconYear={reconYear} />
        <div style={{ borderTop: "2px solid var(--border)", marginTop: 8, paddingTop: 8, maxWidth: 420, marginLeft: "auto" }}>
          <BalanceRow label="Net Increase Over Base Year" value={money(t.opexNetIncrease)} />
          <BalanceRow label="× Tenant Proportionate Share" value={pct(t.proRataPct / 100)} />
          <BalanceRow label="× Occupancy % For The Year" value={pct(t.occPct, 1)} />
          <BalanceRow label="Amount Due" value={money(t.opexAmountDue)} strong />
          <BalanceRow label="Less: Escrow Payments for the Year" value={money(-t.opexEscrow)} />
          <BalanceRow label="Balance, Op Ex Costs Due" value={money(t.opexBalance)} strong />
        </div>
      </div>

      {/* Real estate taxes */}
      <div style={{ marginTop: 16, padding: 16, border: "1px solid var(--border)", borderRadius: 12, background: "var(--card)", overflowX: "auto" }}>
        <ScheduleTable title="Real Estate Taxes" lines={[t.retLine]} baseYear={t.baseYear} reconYear={reconYear} />
        <div style={{ borderTop: "2px solid var(--border)", marginTop: 8, paddingTop: 8, maxWidth: 420, marginLeft: "auto" }}>
          <BalanceRow label="Net Increase Over Base Year" value={money(t.retLine.netIncrease)} />
          <BalanceRow label="× Tenant Proportionate Share" value={pct(t.proRataPct / 100)} />
          <BalanceRow label="× Occupancy % For The Year" value={pct(t.occPct, 1)} />
          <BalanceRow label="Amount Due" value={money(t.retAmountDue)} strong />
          <BalanceRow label="Less: Escrow Payments for the Year" value={money(-t.retEscrow)} />
          <BalanceRow label="Balance, Real Estate Taxes Due" value={money(t.retBalance)} strong />
        </div>
      </div>

      {/* Net + next-year estimate */}
      <div style={{ marginTop: 16, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
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

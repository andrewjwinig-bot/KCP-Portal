"use client";

import { useCallback, useEffect, useState } from "react";
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
  const saveField = useCallback(async (unitRef: string, field: string, value: number | null) => {
    await fetch("/api/cam-recon/office", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ property, year, unitRef, field, value }),
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

  function exportYearEnd() {
    if (!result) return;
    downloadCSV(`${property}_${year}_YearEndAdjustments.csv`, chargeRowsToCSV(yearEndAdjustmentRows(result, yeDate)));
  }
  function exportEstimate() {
    if (!result) return;
    downloadCSV(`${property}_${year + 1}_CAM_RET_Estimate.csv`, chargeRowsToCSV(estimateChargeRows(result, estDate)));
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
            <button onClick={exportYearEnd} disabled={!result} className="btn primary" style={{ fontSize: 13, padding: "8px 14px", fontWeight: 700 }}>Year-End Adjustments</button>
            <button onClick={exportEstimate} disabled={!result} className="btn" style={{ fontSize: 13, padding: "8px 14px", fontWeight: 700 }}>{year + 1} Estimate</button>
          </div>
        </div>

        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {selected ? (
            <>
              <Pill tone={TONE_NEUTRAL}>Base Year {selected.baseYear}</Pill>
              <Pill tone={TONE_NEUTRAL}>{selected.grossUp ? "Grossed up 95%" : "Not grossed up"}</Pill>
              <Pill tone={TONE_NEUTRAL}>{pct(selected.proRataPct / 100)} share</Pill>
              {selected.occPct < 0.9999 && <Pill tone={TONE_NEUTRAL}>{pct(selected.occPct, 1)} occ</Pill>}
              {selected.baseYearResetISO && <Pill tone={TONE_AMBER}>Base year reset</Pill>}
            </>
          ) : (
            <span className="muted small">{tenants.length} tenants reconciled · base-year expense recovery, year-end true-up</span>
          )}
        </div>

        <div className="pills">
          <StatPill label={`CAM Due${direction(camDue) ? ` · ${direction(camDue)}` : ""}`} value={money(Math.abs(camDue))} accent={reconBalanceTone(camDue).fg} />
          <StatPill label={`INS Due${direction(insDue) ? ` · ${direction(insDue)}` : ""}`} value={money(Math.abs(insDue))} />
          <StatPill label={`RET Due${direction(retDue) ? ` · ${direction(retDue)}` : ""}`} value={money(Math.abs(retDue))} accent={reconBalanceTone(retDue).fg} />
          <StatPill label={`Total Due${direction(totalDue) ? ` · ${direction(totalDue)}` : ""}`} value={money(Math.abs(totalDue))} accent={reconBalanceTone(totalDue).fg} />
        </div>
      </div>

      {loading && <div className="card"><div className="muted small">Loading…</div></div>}

      {!selected && result && <BuildingSummary result={result} onPick={setUnit} onEditEscrow={saveField} />}
      {selected && <TenantStatement t={selected} reconYear={year} estimate={estimates.find((e) => e.unitRef === selected.unitRef)} />}

      {result && (
        <div className="card">
          <div style={SECTION_LABEL}>Skyline Exports</div>
          <div style={{ display: "flex", gap: 28, flexWrap: "wrap", marginTop: 14 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span className="small" style={{ fontWeight: 700 }}>Year End Adjustments (YEC / YER)</span>
              <span className="small muted">One-time true-up posted on:</span>
              <Calendar value={yeDate} variant="card" onChange={setYeDate} />
              <button onClick={exportYearEnd} className="btn primary" style={{ fontSize: 13, padding: "9px 14px", fontWeight: 700 }}>Download Year End Adjustments CSV</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span className="small" style={{ fontWeight: 700 }}>{year + 1} CAM / RET Estimate</span>
              <span className="small muted">Recurring monthly charge effective:</span>
              <Calendar value={estDate} variant="card" onChange={setEstDate} />
              <button onClick={exportEstimate} className="btn primary" style={{ fontSize: 13, padding: "9px 14px", fontWeight: 700 }}>Download Next-Year Estimate CSV</button>
            </div>
          </div>
          <p className="small muted" style={{ marginTop: 14, marginBottom: 0 }}>
            CSVs are values-only (no header) and omit $0 rows — paste directly into Skyline Data Import → Unit Charges.
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
function EditableMoney({ value, onCommit }: { value: number; onCommit: (n: number) => void }) {
  const [text, setText] = useState(value.toFixed(2));
  useEffect(() => { setText(value.toFixed(2)); }, [value]);
  function commit(e: React.FocusEvent<HTMLInputElement> | React.KeyboardEvent<HTMLInputElement>) {
    (e.currentTarget as HTMLInputElement).style.borderColor = "transparent";
    (e.currentTarget as HTMLInputElement).style.background = "transparent";
    const n = Number(text.replace(/[^0-9.\-]/g, ""));
    if (Number.isFinite(n) && Math.round(n * 100) !== Math.round(value * 100)) {
      onCommit(Math.round(n * 100) / 100);
    } else {
      setText(value.toFixed(2));
    }
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "flex-end", gap: 1 }}>
      <span style={{ color: "var(--muted)" }}>$</span>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onFocus={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--card)"; e.currentTarget.select(); }}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setText(value.toFixed(2)); e.currentTarget.blur(); } }}
        title="Click to adjust escrow (amount actually collected)"
        style={{ width: 84, textAlign: "right", border: "1px solid transparent", borderRadius: 6, padding: "2px 4px", background: "transparent", color: "inherit", font: "inherit", cursor: "pointer" }}
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

function TenantStatement({ t, reconYear, estimate }: { t: TenantReconResult; reconYear: number; estimate?: NextYearEstimate }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
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

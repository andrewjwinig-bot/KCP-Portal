"use client";

import { useEffect, useState } from "react";
import type { BuildingReconResult } from "@/lib/cam/office/types";
import type { NextYearEstimate } from "@/lib/cam/office/exports";

function money0(n: number): string {
  const v = Math.round(n);
  return (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US");
}

const SECTION_LABEL: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)",
};
const th: React.CSSProperties = {
  textAlign: "right", padding: "6px 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase",
  letterSpacing: "0.04em", color: "var(--muted)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap",
};
const td: React.CSSProperties = { textAlign: "right", padding: "6px 10px", fontSize: 13, whiteSpace: "nowrap" };

function HeaderSelect({ value, onChange, displayLabel, ariaLabel, muted = false, children }: {
  value: string; onChange: (next: string) => void; displayLabel: string; ariaLabel: string; muted?: boolean; children: React.ReactNode;
}) {
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 6px", borderRadius: 8, cursor: "pointer", maxWidth: "100%", minWidth: 0 }}>
      <span style={{ fontSize: 22, fontWeight: 800, color: muted ? "var(--muted)" : "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{displayLabel}</span>
      <span aria-hidden style={{ fontSize: 11, lineHeight: 1, color: muted ? "var(--muted)" : "var(--text)", opacity: 0.6, flexShrink: 0 }}>▾</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={ariaLabel}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer", border: 0, padding: 0, margin: 0, appearance: "auto", background: "transparent" }}>
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

type Available = { propertyCode: string; name: string; years: number[] };

// Spike threshold — flag a >50% jump in a tenant's monthly estimate.
const SPIKE = 0.5;
function pctChange(prev: number, next: number): number | null {
  if (prev <= 0) return next > 0 ? Infinity : null;
  return (next - prev) / prev;
}
function changeCell(prev: number, next: number) {
  const c = pctChange(prev, next);
  if (c == null) return <span style={{ color: "var(--muted)" }}>—</span>;
  if (c === Infinity) return <span style={{ color: "#b45309", fontWeight: 700 }}>new</span>;
  const spike = Math.abs(c) >= SPIKE;
  return <span style={{ color: spike ? "#b91c1c" : c < 0 ? "#15803d" : "var(--text)", fontWeight: spike ? 800 : 500 }}>{c >= 0 ? "+" : ""}{(c * 100).toFixed(0)}%</span>;
}

export default function CamEstimatesPage() {
  const [available, setAvailable] = useState<Available[]>([]);
  const [property, setProperty] = useState("");
  const [year, setYear] = useState(0);
  const [result, setResult] = useState<BuildingReconResult | null>(null);
  const [estimates, setEstimates] = useState<NextYearEstimate[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/cam-recon/office")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const list: Available[] = j?.available ?? [];
        setAvailable(list);
        if (list.length) { setProperty(list[0].propertyCode); setYear(list[0].years[0]); }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!property || !year) return;
    setLoading(true);
    fetch(`/api/cam-recon/office?property=${property}&year=${year}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { setResult(j?.result ?? null); setEstimates(j?.estimates ?? []); })
      .finally(() => setLoading(false));
  }, [property, year]);

  const years = available.find((a) => a.propertyCode === property)?.years ?? [];
  const propName = available.find((a) => a.propertyCode === property)?.name ?? "";
  const estByUnit = new Map(estimates.map((e) => [e.unitRef, e]));
  const tenants = result?.tenants ?? [];
  const prevYear = year;        // current rent-roll charge = the recon year's estimate
  const newYear = year + 1;     // budget/recon-derived new estimate

  return (
    <main style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <h1>CAM / RET Estimates</h1>
        <KormanWordmark />
      </header>

      <div className="card">
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", minWidth: 0 }}>
          <HeaderSelect value={String(year)} onChange={(v) => setYear(Number(v))} displayLabel={String(year || "—")} ariaLabel="Year" muted>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </HeaderSelect>
          <HeaderSelect value={property} onChange={setProperty} displayLabel={property ? `${property} — ${propName}` : "—"} ariaLabel="Property">
            {available.map((a) => <option key={a.propertyCode} value={a.propertyCode}>{a.propertyCode} — {a.name}</option>)}
          </HeaderSelect>
        </div>
        <p className="small muted" style={{ marginTop: 6, marginBottom: 0 }}>
          Monthly CAM / RET escrow per tenant: {prevYear} (current charge) vs. the {newYear} estimate, with the change. A jump over {Math.round(SPIKE * 100)}% is flagged red so you can review before it reaches a tenant.
        </p>
      </div>

      {loading && <div className="card"><div className="muted small">Loading…</div></div>}

      {result && (
        <div className="card" style={{ overflowX: "auto" }}>
          <div style={SECTION_LABEL}>Monthly Estimates — {result.propertyCode}</div>
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10, minWidth: 820 }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: "left" }}>Suite</th>
                <th style={{ ...th, textAlign: "left" }}>Tenant</th>
                <th style={{ ...th, textAlign: "center" }}>Base Yr</th>
                <th style={th}>{prevYear} CAM</th>
                <th style={th}>{newYear} CAM</th>
                <th style={th}>Δ</th>
                <th style={th}>{prevYear} RET</th>
                <th style={th}>{newYear} RET</th>
                <th style={th}>Δ</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => {
                const e = estByUnit.get(t.unitRef);
                const newCam = e?.monthlyCam ?? 0;
                const newRet = e?.monthlyRet ?? 0;
                return (
                  <tr key={t.unitRef} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ ...td, textAlign: "left", fontWeight: 700 }}>{t.suite}</td>
                    <td style={{ ...td, textAlign: "left" }}>{t.name}</td>
                    <td style={{ ...td, textAlign: "center", fontWeight: 700 }}>
                      {t.baseYear}
                      {t.baseYearResetISO && (
                        <span title={`Base year reset ${t.baseYearResetISO}`} style={{ color: "#b45309" }}> ↺</span>
                      )}
                    </td>
                    <td style={td}>{money0(t.camMonthly)}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{money0(newCam)}</td>
                    <td style={td}>{changeCell(t.camMonthly, newCam)}</td>
                    <td style={td}>{money0(t.retMonthly)}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{money0(newRet)}</td>
                    <td style={td}>{changeCell(t.retMonthly, newRet)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="small muted" style={{ marginTop: 8 }}>
            {prevYear} = current monthly charge on the rent roll. {newYear} = recon-derived estimate (will switch to budget-driven once the {newYear} budget is loaded). Δ flags spikes ≥ {Math.round(SPIKE * 100)}%.
          </p>
        </div>
      )}
    </main>
  );
}

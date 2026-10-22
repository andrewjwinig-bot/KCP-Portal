"use client";
import LoadingState from "@/app/components/LoadingState";

// T-12 — the TRAILING TWELVE MONTHS of actuals, ending at a posted month (Sep 25
// … Aug 26). The Reprojections page's grid on twelve rolling months of GL, so
// it reads line for line like the statement, the reprojection and the budget:
// every month an actual, nothing from the budget. It is what a buyer, a lender
// or an appraiser asks for, and the calendar-year pages cannot give it without
// pasting two years together. Reached from the Report Center.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { StatPill } from "@/app/components/Pill";
import { DownloadMenu } from "@/app/components/DownloadMenu";
import { groupStatementOptions } from "@/lib/financials/operating-statements/propertyGroups";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import { ReprojTable, HeaderSelect, SegToggle, money, sum, type ViewOpts, type Reprojection } from "../reprojections/ReprojTable";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
type Available = { key: string; propertyCode: string; entityName: string; name: string; years?: number[]; latest: { year: number; month: number } | null };
type T12 = { reprojection: Reprojection; labels: string[]; span: string; missing: string[] };

const endKey = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;
const endLabel = (k: string) => { const [y, m] = k.split("-").map(Number); return `${MONTHS[m - 1]} ${y}`; };

export default function T12Page() {
  const [available, setAvailable] = useState<Available[]>([]);
  const [key, setKey] = useState("");
  const [end, setEnd] = useState("");
  const [data, setData] = useState<T12 | null>(null);
  const [loading, setLoading] = useState(false);
  const [psf, setPsf] = useState(false);
  const [hideEmpty, setHideEmpty] = useState(true);
  const [showGL, setShowGL] = useState(false);

  useEffect(() => {
    fetch("/api/financials/t12").then((r) => r.json()).then((j) => {
      const av: Available[] = j.available ?? [];
      setAvailable(av);
      const params = new URLSearchParams(window.location.search);
      const want = params.get("key") ?? params.get("property");
      const pick = (want && av.find((a) => a.key === want || a.propertyCode === want)) || av.find((a) => a.latest) || av[0];
      if (pick) setKey(pick.key);
    }).catch(() => {});
  }, []);

  const cur = available.find((a) => a.key === key);
  // The ends on offer: the last 24 months up to the month this property is
  // posted through. A new property defaults to its latest.
  const ends = useMemo(() => {
    const l = cur?.latest;
    if (!l) return [];
    return Array.from({ length: 24 }, (_, i) => {
      const idx = l.year * 12 + (l.month - 1) - i;
      return endKey(Math.floor(idx / 12), (idx % 12) + 1);
    });
  }, [cur]);
  useEffect(() => { if (ends.length && !ends.includes(end)) setEnd(ends[0]); }, [ends, end]);

  const load = useCallback(async () => {
    if (!key || !end) return;
    setLoading(true);
    try {
      const j = await fetch(`/api/financials/t12?key=${encodeURIComponent(key)}&end=${end}`).then((r) => r.json());
      setData(j.t12 ?? null);
    } finally {
      setLoading(false);
    }
  }, [key, end]);
  useEffect(() => { load(); }, [load]);

  const sqft = PROPERTY_DEFS.find((p) => p.id === key)?.sqft ?? 0;
  const view: ViewOpts = { psf, sqft, hideEmpty, showGL, through: 12, mode: "actuals", labels: data?.labels, totalLabel: "T-12", plain: true };
  const r = data?.reprojection;
  const pills = r ? [
    { key: "rev", label: "T-12 Revenue", value: money(sum(r.rollups.totalRevenues.actual), psf, sqft) },
    { key: "opex", label: "T-12 Operating Expenses", value: money(sum(r.rollups.totalOperatingExpenses.actual), psf, sqft) },
    { key: "noi", label: "T-12 NOI", value: money(sum(r.rollups.netOperatingIncome.actual), psf, sqft) },
    { key: "cf", label: "T-12 Cash Flow", value: money(sum(r.rollups.cashFlowAfterDebtService.actual), psf, sqft) },
  ] : [];

  return (
    <main style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <h1>T-12</h1>

      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", minWidth: 0 }}>
            <HeaderSelect value={end} onChange={setEnd} displayLabel={end ? `Through ${endLabel(end)}` : "—"} ariaLabel="Twelve months ending" muted>
              {ends.map((k) => <option key={k} value={k}>Twelve months ending {endLabel(k)}</option>)}
            </HeaderSelect>
            <HeaderSelect value={key} onChange={setKey} displayLabel={cur ? `${cur.propertyCode} — ${cur.name}` : "—"} ariaLabel="Property">
              {groupStatementOptions(available.map((a) => ({ ...a, years: a.latest ? [a.latest.year] : [] }))).map((grp) => (
                <optgroup key={grp.label} label={grp.label}>
                  {grp.items.map((a) => <option key={a.key} value={a.key}>{a.propertyCode} — {a.name}{a.years.length ? "" : " (no GL)"}</option>)}
                </optgroup>
              ))}
            </HeaderSelect>
          </div>
          {data && (
            <DownloadMenu items={[
              { label: "Excel (.xlsx)", description: `T-12 actuals, ${data.span}`, href: `/api/financials/t12/download?key=${encodeURIComponent(key)}&end=${end}` },
            ]} />
          )}
        </div>

        <div style={{ marginTop: 6, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div className="muted small">
            {data ? <>Actuals only, {data.span} — every month off the GL, nothing from the budget.</> : cur && !cur.latest ? "No GL uploaded for this property yet." : null}
          </div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <SegToggle label="View" leftLabel="Total" rightLabel="$/SF" leftActive={!psf} onLeft={() => setPsf(false)} onRight={() => setPsf(true)} disabled={sqft <= 0} />
            <SegToggle label="Empty rows" leftLabel="Hide" rightLabel="Show" leftActive={hideEmpty} onLeft={() => setHideEmpty(true)} onRight={() => setHideEmpty(false)} />
            <SegToggle label="GL" leftLabel="Hide" rightLabel="Show" leftActive={!showGL} onLeft={() => setShowGL(false)} onRight={() => setShowGL(true)} />
          </div>
        </div>

        {pills.length > 0 && (
          <div className="pills">
            {pills.map((p) => <StatPill key={p.key} label={p.label} value={p.value} />)}
          </div>
        )}
      </div>

      {/* A month no GL covers reads $0 — say which, so a short T-12 is never
          mistaken for a real one. */}
      {data && data.missing.length > 0 && (
        <div className="card" style={{ padding: "9px 14px", borderLeft: "4px solid #b45309", background: "rgba(217,119,6,0.06)", fontSize: 13 }}>
          <b style={{ color: "#b45309" }}>{data.missing.length} month{data.missing.length === 1 ? "" : "s"} not imported</b>
          <span className="muted"> — {data.missing.join(", ")} read $0 until that GL is uploaded, so this T-12 is short.</span>
        </div>
      )}

      {loading && <LoadingState status="Loading twelve months of actuals…" columns={4} rows={4} />}
      {!loading && !data && <div className="card"><div className="muted small">Select a property.</div></div>}
      {!loading && r && <ReprojTable data={r} view={view} noteFor={() => null} osHref={`/financials/operating-statements?key=${encodeURIComponent(key)}`} />}
    </main>
  );
}

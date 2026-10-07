"use client";
import LoadingState from "@/app/components/LoadingState";

// Reprojections — the blended full-year forecast: actuals for the months we
// have, budget for the rest. Mirrors the Operating Budgets page chrome (header
// card + title selectors, the same toggles, KPI pills, group headers, section
// + subtotal cards) so it reads as the budget with the elapsed months replaced
// by real GL actuals (shaded green) and the rest projected from budget.

import React, { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { StatPill } from "@/app/components/Pill";
import { DownloadMenu } from "@/app/components/DownloadMenu";
import { ReprojTable, HeaderSelect, SegToggle, MONTHS, ACTUAL_TINT, money, varColor, sum, type Mode, type ViewOpts, type Reprojection, type OnDrill } from "./ReprojTable";
import { LineDetailModal } from "../operating-statements/LineDetailModal";
import { groupStatementOptions, groupByRentRoll } from "@/lib/financials/operating-statements/propertyGroups";
import { PROPERTY_DEFS } from "@/lib/properties/data";

type Available = { key: string; propertyCode: string; entityName: string; name: string; years: number[] };

export default function ReprojectionsPage() {
  const [available, setAvailable] = useState<Available[]>([]);
  const [key, setKey] = useState("");
  const [year, setYear] = useState(0);
  const [data, setData] = useState<Reprojection | null>(null);
  const [budgetYear, setBudgetYear] = useState<number | null>(null);
  const [budgetFallback, setBudgetFallback] = useState(false);
  const [hasGl, setHasGl] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [noteSources, setNoteSources] = useState<Record<string, "user" | "ai">>({});
  const [loading, setLoading] = useState(false);
  const [psf, setPsf] = useState(false);
  const [hideEmpty, setHideEmpty] = useState(true);
  const [showGL, setShowGL] = useState(false);
  // "reproject" = actuals blended with budget for the rest of the year (+ Ann
  // Bud / Var columns). "actuals" = a clean full-year-actuals statement: every
  // month's real GL figure in its own column + a Full Year total, no budget.
  const [mode, setMode] = useState<Mode>("reproject");
  // A posted month (or the year to date) clicked open on its GL transactions —
  // the operating statements' own drill-down, so nobody has to leave the page.
  const [detail, setDetail] = useState<Parameters<OnDrill>[0] | null>(null);

  useEffect(() => {
    fetch("/api/financials/reprojections").then((r) => r.json()).then((j) => {
      const av: Available[] = j.available ?? [];
      setAvailable(av);
      // Deep link from the Statements/Budgets pages: ?key (or ?property) & year.
      const params = new URLSearchParams(window.location.search);
      const wantKey = params.get("key");
      const wantProp = params.get("property");
      const wantYear = params.get("year");
      // Deep-linked "Full Year" entry point from Operating Statements.
      if (params.get("mode") === "actuals") setMode("actuals");
      const match = wantKey ? av.find((a) => a.key === wantKey) : wantProp ? av.find((a) => a.propertyCode === wantProp) : null;
      if (match) {
        setKey(match.key);
        setYear(wantYear ? Number(wantYear) : match.years[0] ?? new Date().getFullYear());
        return;
      }
      const withGl = av.find((a) => a.years.length);
      if (withGl) { setKey(withGl.key); setYear(withGl.years[0]); }
      else if (av[0]) { setKey(av[0].key); setYear(new Date().getFullYear()); }
    }).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    if (!key || !year) return;
    setLoading(true);
    try {
      const j = await fetch(`/api/financials/reprojections?key=${encodeURIComponent(key)}&year=${year}`).then((r) => r.json());
      setData(j.reprojection ?? null);
      setBudgetYear(j.budgetYear ?? null);
      setBudgetFallback(!!j.budgetFallback);
      setHasGl(!!j.hasGl);
      setNotes(j.notes ?? {});
      setNoteSources(j.noteSources ?? {});
    } finally {
      setLoading(false);
    }
  }, [key, year]);
  useEffect(() => { load(); }, [load]);

  const cur = available.find((a) => a.key === key);

  /**
   * The portfolio groups worth downloading whole, in the order the rent roll
   * lists them, each with how many properties it would produce.
   *
   * Only groups that have something in them — a menu item promising "All NI
   * LLC" and yielding an error is worse than no item. "Other Properties" is
   * left out: it is the leftovers bucket, not a portfolio anyone reports on.
   */
  const groupDownloads = useMemo(() => {
    return groupByRentRoll(available)
      .filter((g) => g.label !== "Other Properties" && g.items.length > 0)
      .map((g) => ({ label: g.label, count: g.items.length }));
  }, [available]);
  const yearOptions = cur?.years.length ? cur.years : [year || new Date().getFullYear()];
  const sqft = PROPERTY_DEFS.find((p) => p.id === key)?.sqft ?? 0;
  const through = data?.actualThroughMonth ?? 0;
  const view: ViewOpts = { psf, sqft, hideEmpty, showGL, through, mode };
  const actuals = mode === "actuals";
  const osHref = key && year ? `/financials/operating-statements?key=${encodeURIComponent(key)}&year=${year}` : "#";
  const budgetHref = cur && year ? `/financials/budgets?property=${encodeURIComponent(cur.propertyCode)}&year=${year}` : "#";
  const noteFor = (lineKey: string) => (notes[lineKey] ? { note: notes[lineKey], ai: noteSources[lineKey] === "ai" } : null);
  const crossLink: React.CSSProperties = { fontSize: 12, padding: "5px 11px", fontWeight: 700, textDecoration: "none" };

  const pills = data ? (actuals ? [
    { key: "rev", label: "Actual Revenue", value: money(sum(data.rollups.totalRevenues.actual)) },
    { key: "noi", label: "Actual NOI", value: money(sum(data.rollups.netOperatingIncome.actual)) },
    { key: "cf", label: "Actual Cash Flow", value: money(sum(data.rollups.cashFlowAfterDebtService.actual)) },
    { key: "thru", label: through >= 12 ? "Full Year" : "Actuals Through", value: through > 0 ? (through >= 12 ? "Jan–Dec" : `Jan–${MONTHS[through - 1]}`) : "—" },
  ] : [
    { key: "rev", label: "Reprojected Revenue", value: money(data.rollups.totalRevenues.reprojTotal) },
    { key: "noi", label: "Reprojected NOI", value: money(data.rollups.netOperatingIncome.reprojTotal) },
    { key: "cf", label: "Reprojected Cash Flow", value: money(data.rollups.cashFlowAfterDebtService.reprojTotal) },
    { key: "noivar", label: "NOI vs Budget", value: money(data.rollups.netOperatingIncome.variance ?? 0), accent: varColor(data.rollups.netOperatingIncome.variance) },
    { key: "thru", label: "Actuals Through", value: through > 0 ? MONTHS[through - 1] : "—" },
  ]) : [];

  return (
    <main style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <h1>{actuals ? "Full-Year Actuals" : "Reprojections"}</h1>

      {/* Header card — title selectors + meta + toggles + KPI pills, like Budgets. */}
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", minWidth: 0 }}>
            <HeaderSelect value={String(year)} onChange={(v) => setYear(Number(v))} displayLabel={String(year)} ariaLabel="Year" muted>
              {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
            </HeaderSelect>
            <HeaderSelect value={key} onChange={setKey} displayLabel={cur ? `${cur.propertyCode} — ${cur.name}` : "—"} ariaLabel="Property">
              {groupStatementOptions(available).map((grp) => (
                <optgroup key={grp.label} label={grp.label}>
                  {grp.items.map((a) => <option key={a.key} value={a.key}>{a.propertyCode} — {a.name}{a.years.length ? "" : " (no GL)"}</option>)}
                </optgroup>
              ))}
            </HeaderSelect>
          </div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {data && (
              <DownloadMenu
                items={[
                  { label: "Excel (.xlsx)", description: "Full-year blended reprojection by month", href: `/api/financials/reprojections/download?key=${encodeURIComponent(key)}&year=${year}` },
                  { label: "PDF", description: "Presentation-ready reprojection summary", href: `/api/financials/reprojections/download/pdf?key=${encodeURIComponent(key)}&year=${year}` },
                  // A whole portfolio group in one workbook, a sheet per
                  // property — the alternative was opening each building and
                  // pasting the tabs together. Same sheet writer as the single
                  // download above, so the figures cannot differ.
                  ...(groupDownloads.map((g) => ({
                    label: `All ${g.label} (.xlsx)`,
                    description: `${g.count} propert${g.count === 1 ? "y" : "ies"}, one sheet each`,
                    href: `/api/financials/reprojections/download/group?group=${encodeURIComponent(g.label)}&year=${year}`,
                  }))),
                ]}
              />
            )}
            <a className="btn" href={osHref} style={crossLink} title="Open this property's Operating Statement">Operating Statements →</a>
            <a className="btn" href={budgetHref} style={crossLink} title="Open this property's Operating Budget">Budget →</a>
          </div>
        </div>

        {!actuals && (
          <div style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11 }}>
            <span style={{ width: 12, height: 12, background: ACTUAL_TINT, border: "1px solid rgba(21,128,61,0.4)", borderRadius: 2, display: "inline-block" }} /> Actual
            <span style={{ width: 12, height: 12, border: "1px solid var(--border)", borderRadius: 2, display: "inline-block", marginLeft: 8 }} /> Budget
            <span className="muted" style={{ marginLeft: 12 }}>📝 hover a line&apos;s note for the variance explanation (click → Operating Statements)</span>
          </div>
        )}

        <div style={{ marginTop: 6, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div className="muted small">
            {actuals ? (
              <>
                Every month&apos;s actual GL figure {through > 0 ? <>(Jan–{MONTHS[Math.min(through, 12) - 1]})</> : "(none yet)"} + a Full Year total.
                {through < 12 && through > 0 && <> {MONTHS[through]}–Dec not yet imported.</>}
                {!hasGl && <> No GL uploaded for this property/year yet.</>}
              </>
            ) : (
              <>
                Blends actuals {through > 0 ? <>(Jan–{MONTHS[through - 1]})</> : "(none yet)"} with budget{through < 12 ? <> ({MONTHS[Math.min(through, 11)]}–Dec)</> : ""} for the full year.
                {budgetYear ? <> Budget: FY {budgetYear}{budgetFallback ? " (nearest)" : ""}.</> : <> No budget for this property.</>}
                {!hasGl && <> No GL uploaded — projecting from budget.</>}
              </>
            )}
          </div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <SegToggle label="Show" leftLabel="Reproject" rightLabel="Actuals" leftActive={!actuals} onLeft={() => setMode("reproject")} onRight={() => setMode("actuals")} />
            <SegToggle label="View" leftLabel="Total" rightLabel="$/SF" leftActive={!psf} onLeft={() => setPsf(false)} onRight={() => setPsf(true)} disabled={sqft <= 0} />
            <SegToggle label="Empty rows" leftLabel="Hide" rightLabel="Show" leftActive={hideEmpty} onLeft={() => setHideEmpty(true)} onRight={() => setHideEmpty(false)} />
            <SegToggle label="GL" leftLabel="Hide" rightLabel="Show" leftActive={!showGL} onLeft={() => setShowGL(false)} onRight={() => setShowGL(true)} />
          </div>
        </div>

        {pills.length > 0 && (
          <div className="pills">
            {pills.map((p) => <StatPill key={p.key} label={p.label} value={p.value} accent={p.accent} />)}
          </div>
        )}
      </div>

      {loading && <LoadingState status="Loading full-year figures…" columns={4} rows={4} />}
      {!loading && !data && <div className="card"><div className="muted small">Select a property and year.</div></div>}
      {!loading && data && <ReprojTable data={data} view={view} noteFor={noteFor} osHref={osHref} onDrill={setDetail} />}
      {detail && cur && (
        <LineDetailModal viewKey={key} property={cur.propertyCode} year={year} period={detail.period} monthLabel={detail.monthLabel}
          line={{ mask: detail.mask, label: detail.label, sign: detail.sign }} initialTab="gl" initialScope={detail.scope} onClose={() => setDetail(null)} />
      )}
    </main>
  );
}


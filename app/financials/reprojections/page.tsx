"use client";

// Reprojections — the blended full-year forecast: actuals for the months we
// have, budget for the rest. Mirrors the Operating Budgets page chrome (header
// card + title selectors, the same toggles, KPI pills, group headers, section
// + subtotal cards) so it reads as the budget with the elapsed months replaced
// by real GL actuals (shaded green) and the rest projected from budget.

import React, { Fragment, useCallback, useEffect, useState } from "react";
import { StatPill } from "@/app/components/Pill";
import { DownloadMenu } from "@/app/components/DownloadMenu";
import { AccountListCard } from "@/app/components/AccountListCard";
import { groupStatementOptions } from "@/lib/financials/operating-statements/propertyGroups";
import { PROPERTY_DEFS } from "@/lib/properties/data";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const BRAND = "#0b4a7d";
const MONTH_TINT = "rgba(15,23,42,0.035)";
const ACTUAL_TINT = "rgba(21,128,61,0.10)";
const ACTUAL_EDGE = "2px solid rgba(21,128,61,0.5)";

// line + 12 months + Full Year + Ann Bud + Var = 100%
const COL = { line: 17, month: 5, full: 9, bud: 7, varc: 7 };
// Actuals-only mode drops the Ann Bud + Var columns: line + 12 months + Total.
const COL_ACT = { line: 17, month: 5, full: 23 };

type Mode = "reproject" | "actuals";
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

type Totals = { actual: number[]; budget: number[]; blended: number[]; reprojTotal: number; budgetTotal: number; variance: number | null };
type Line = { label: string; mask: string } & Totals;
type Section = { name: string; role: string; lines: Line[]; subtotal: Totals };
type Reprojection = {
  propertyCode: string; propertyName: string; year: number; actualThroughMonth: number;
  sections: Section[];
  rollups: Record<"totalRevenues" | "totalOperatingExpenses" | "netOperatingIncome" | "capital" | "cashFlowBeforeDebtService" | "totalDebtService" | "cashFlowAfterDebtService", Totals>;
  unbudgetedAccounts: { account: string; actualTotal: number; name?: string | null }[];
};
type Available = { key: string; propertyCode: string; entityName: string; name: string; years: number[] };

const isZero = (v: number) => Math.abs(v) < 0.5;
function money(n: number, psf = false, sqft = 0): string {
  if (psf && sqft > 0) {
    const v = n / sqft;
    if (isZero(v)) return "—";
    return `${v < 0 ? "-" : ""}$${Math.abs(v).toFixed(2)}`;
  }
  if (isZero(n)) return "—";
  return `${n < 0 ? "-" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
}
function fmtVarPct(v: number | null, budget: number): string {
  if (v == null || Math.abs(budget) < 0.5) return "";
  const p = (v / Math.abs(budget)) * 100;
  return `${p > 0 ? "+" : ""}${p.toFixed(1)}%`;
}
const varColor = (v: number | null) => (v == null ? "var(--muted)" : v >= 0 ? "#15803d" : "#b91c1c");

// ── Budget-matching chrome ───────────────────────────────────────────────────
function HeaderSelect({ value, onChange, displayLabel, ariaLabel, muted, children }: {
  value: string; onChange: (v: string) => void; displayLabel: string; ariaLabel: string; muted?: boolean; children: React.ReactNode;
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

const segBase: React.CSSProperties = { fontSize: 11, fontWeight: 700, padding: "4px 10px", border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", cursor: "pointer", letterSpacing: "0.04em", textTransform: "uppercase" };
const segActive: React.CSSProperties = { background: BRAND, color: "#fff", borderColor: BRAND };
function SegToggle({ label, leftLabel, rightLabel, leftActive, onLeft, onRight, disabled }: {
  label: string; leftLabel: string; rightLabel: string; leftActive: boolean; onLeft: () => void; onRight: () => void; disabled?: boolean;
}) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span className="muted small" style={{ fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>{label}</span>
      <div style={{ display: "inline-flex", borderRadius: 6, overflow: "hidden", opacity: disabled ? 0.5 : 1 }}>
        <button type="button" disabled={disabled} onClick={() => !disabled && onLeft()} style={{ ...segBase, borderRadius: "6px 0 0 6px", ...(leftActive ? segActive : {}) }}>{leftLabel}</button>
        <button type="button" disabled={disabled} onClick={() => !disabled && onRight()} style={{ ...segBase, borderLeft: "none", borderRadius: "0 6px 6px 0", ...(leftActive ? {} : segActive) }}>{rightLabel}</button>
      </div>
    </div>
  );
}

function GroupHeader({ label }: { label: string }) {
  return (
    <div style={{ marginTop: 4, paddingBottom: 6, borderBottom: `2px solid ${BRAND}`, fontSize: 18, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: BRAND }}>{label}</div>
  );
}

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

      {loading && <div className="card"><div className="muted small">Loading…</div></div>}
      {!loading && !data && <div className="card"><div className="muted small">Select a property and year.</div></div>}
      {!loading && data && <ReprojTable data={data} view={view} noteFor={noteFor} osHref={osHref} />}
    </main>
  );
}

type ViewOpts = { psf: boolean; sqft: number; hideEmpty: boolean; showGL: boolean; through: number; mode: Mode };

function lineEmpty(t: Totals, mode: Mode): boolean {
  if (mode === "actuals") return isZero(sum(t.actual));
  return isZero(t.reprojTotal) && isZero(t.budgetTotal);
}

type NoteFor = (lineKey: string) => { note: string; ai: boolean } | null;

function ReprojTable({ data, view, noteFor, osHref }: { data: Reprojection; view: ViewOpts; noteFor: NoteFor; osHref: string }) {
  const r = data.rollups;
  const byRole = (roles: string[]) => data.sections.filter((s) => roles.includes(s.role));
  const revenueSecs = byRole(["revenue", "reimbursement"]);
  const expenseSecs = byRole(["reimbursable-expense", "non-reimbursable-expense", "residential-expense"]);
  const capitalSecs = byRole(["capital"]);
  const debtSecs = byRole(["debt-service"]);
  const groupHasActivity = (secs: Section[]) => secs.some((s) => s.lines.some((l) => !lineEmpty(l, view.mode)) || !lineEmpty(s.subtotal, view.mode));
  const showCapital = capitalSecs.length > 0 && (!view.hideEmpty || groupHasActivity(capitalSecs));
  const showDebt = debtSecs.length > 0 && (!view.hideEmpty || groupHasActivity(debtSecs));

  return (
    <>
      <GroupHeader label="Revenues" />
      {revenueSecs.map((s) => <SectionCard key={s.name} sec={s} view={view} noteFor={noteFor} osHref={osHref} />)}
      <SubtotalCard label="Total Revenues" t={r.totalRevenues} view={view} />

      <GroupHeader label="Operating Expenses" />
      {expenseSecs.map((s) => <SectionCard key={s.name} sec={s} view={view} noteFor={noteFor} osHref={osHref} />)}
      <SubtotalCard label="Total Operating Expenses" t={r.totalOperatingExpenses} view={view} />
      <SubtotalCard label="Net Operating Income" t={r.netOperatingIncome} view={view} strong />

      {showCapital && <GroupHeader label="Capital Improvements" />}
      {showCapital && capitalSecs.map((s) => <SectionCard key={s.name} sec={s} view={view} noteFor={noteFor} osHref={osHref} hideSubtotal />)}
      {showDebt ? (
        <>
          <SubtotalCard label="Cash Flow Before Debt Service" t={r.cashFlowBeforeDebtService} view={view} strong />
          <GroupHeader label="Debt Service" />
          {debtSecs.map((s) => <SectionCard key={s.name} sec={s} view={view} noteFor={noteFor} osHref={osHref} />)}
          <SubtotalCard label="Total Debt Service" t={r.totalDebtService} view={view} />
          <SubtotalCard label="Cash Flow After Debt Service" t={r.cashFlowAfterDebtService} view={view} strong />
        </>
      ) : (
        <SubtotalCard label="Cash Flow" t={r.cashFlowBeforeDebtService} view={view} strong />
      )}

      {data.unbudgetedAccounts.length > 0 && (
        <AccountListCard
          title="Unbudgeted Actuals — not in any reprojection line"
          description="GL accounts with activity that don't map to a budget/statement line — surfaced so the full-year reprojection isn't silently short."
          accent="#b45309"
          rows={data.unbudgetedAccounts.map((r) => ({ account: r.account, name: r.name, amount: r.actualTotal }))}
          format={(n) => money(n)}
        />
      )}
    </>
  );
}

function Colgroup({ through, mode }: { through: number; mode: Mode }) {
  const actuals = mode === "actuals";
  return (
    <colgroup>
      <col style={{ width: `${(actuals ? COL_ACT : COL).line}%` }} />
      {MONTHS.map((m, i) => (
        <col key={m} style={{ width: `${(actuals ? COL_ACT : COL).month}%`, background: i < through ? ACTUAL_TINT : actuals ? undefined : i % 2 === 0 ? MONTH_TINT : undefined }} />
      ))}
      <col style={{ width: `${(actuals ? COL_ACT : COL).full}%` }} />
      {!actuals && <col style={{ width: `${COL.bud}%` }} />}
      {!actuals && <col style={{ width: `${COL.varc}%` }} />}
    </colgroup>
  );
}

const td: React.CSSProperties = { textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 12.5 };

function figureCells(t: Totals, view: ViewOpts, opts: { bold?: boolean; color?: string } = {}) {
  const { psf, sqft, through, mode } = view;
  const actuals = mode === "actuals";
  // Actuals mode shows the real per-month figure and a Full Year = sum of
  // actuals; only imported months carry a value (later months read blank).
  const cells = actuals ? t.actual : t.blended;
  const totalVal = actuals ? sum(t.actual) : t.reprojTotal;
  return (
    <>
      {cells.map((v, i) => (
        <td key={i} style={{
          ...td,
          fontWeight: opts.bold ? 800 : undefined,
          borderLeft: i === through && through > 0 ? ACTUAL_EDGE : undefined,
          color: opts.color ?? (v < 0 ? "#b91c1c" : i < through ? "var(--text)" : "var(--muted)"),
        }}>{actuals && i >= through ? "" : money(v, psf, sqft)}</td>
      ))}
      <td style={{ ...td, borderLeft: "1px solid var(--border)", fontSize: opts.bold ? 14 : 13, fontWeight: 900, color: opts.color ?? BRAND }}>{money(totalVal, psf, sqft)}</td>
      {!actuals && <td style={{ ...td, fontWeight: opts.bold ? 800 : undefined, color: opts.color ?? "var(--muted)" }}>{money(t.budgetTotal, psf, sqft)}</td>}
      {!actuals && (
        <td style={{ ...td, fontWeight: 800, color: opts.color ?? varColor(t.variance) }} title={fmtVarPct(t.variance, t.budgetTotal)}>
          {t.variance == null ? "—" : money(t.variance, psf, sqft)}
        </td>
      )}
    </>
  );
}

function HeaderRow({ through, mode }: { through: number; mode: Mode }) {
  const actuals = mode === "actuals";
  return (
    <tr>
      <th>Line</th>
      {MONTHS.map((m, i) => (
        <th key={m} style={{ textAlign: "right", borderLeft: i === through && through > 0 ? ACTUAL_EDGE : undefined }}>{m}</th>
      ))}
      <th style={{ textAlign: "right", borderLeft: "1px solid var(--border)", color: BRAND }}>Full Year</th>
      {!actuals && <th style={{ textAlign: "right" }}>Ann Bud</th>}
      {!actuals && <th style={{ textAlign: "right" }}>Var</th>}
    </tr>
  );
}

function SectionCard({ sec, view, noteFor, osHref, hideSubtotal }: { sec: Section; view: ViewOpts; noteFor: NoteFor; osHref: string; hideSubtotal?: boolean }) {
  const lines = view.hideEmpty ? sec.lines.filter((l) => !lineEmpty(l, view.mode)) : sec.lines;
  if (lines.length === 0 && view.hideEmpty) return null;
  return (
    <div className="card" style={{ padding: 0 }}>
      <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", background: "rgba(15,23,42,0.03)", fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase" }}>{sec.name}</div>
      <div className="tableWrap">
        <table style={{ tableLayout: "fixed", width: "100%", minWidth: 1180 }}>
          <Colgroup through={view.through} mode={view.mode} />
          <thead><HeaderRow through={view.through} mode={view.mode} /></thead>
          <tbody>
            {lines.map((l) => {
              const n = noteFor(`${sec.name}::${l.label}`);
              return (
              <tr key={l.label}>
                <td style={{ textAlign: "left" }}>
                  {l.label}
                  {n && (
                    <a href={osHref} title={`${n.ai ? "✨ AI note — " : ""}${n.note}\n\n(click → Operating Statements)`}
                      aria-label="Variance note" style={{ marginLeft: 6, textDecoration: "none", cursor: "pointer" }}>
                      {n.ai ? "✨" : "📝"}
                    </a>
                  )}
                  {view.showGL && <div className="muted" style={{ fontSize: 10.5, fontVariantNumeric: "tabular-nums", marginTop: 1 }}>{l.mask}</div>}
                </td>
                {figureCells(l, view)}
              </tr>
            );})}
            {!hideSubtotal && (
              <tr style={{ background: "rgba(11,74,125,0.06)" }}>
                <td style={{ fontWeight: 900, letterSpacing: "0.04em", textTransform: "uppercase", color: BRAND, fontSize: 12.5 }}>{sec.role === "revenue" ? "Total Revenue and Other" : `Total ${sec.name}`}</td>
                {figureCells(sec.subtotal, view, { bold: true, color: BRAND })}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SubtotalCard({ label, t, view, strong }: { label: string; t: Totals; view: ViewOpts; strong?: boolean }) {
  return (
    <div className="card" style={{ padding: 0, borderColor: BRAND, background: strong ? "rgba(11,74,125,0.06)" : "rgba(11,74,125,0.04)" }}>
      <div className="tableWrap" style={{ marginTop: 0 }}>
        <table style={{ tableLayout: "fixed", width: "100%", minWidth: 1180 }}>
          <Colgroup through={view.through} mode={view.mode} />
          <tbody>
            <tr style={{ fontWeight: 800 }}>
              <td style={{ fontSize: strong ? 14 : 13, fontWeight: 900, letterSpacing: "0.04em", textTransform: "uppercase", color: BRAND, verticalAlign: "middle", borderBottom: "none" }}>{label}</td>
              {figureCells(t, view, { bold: true, color: BRAND })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}


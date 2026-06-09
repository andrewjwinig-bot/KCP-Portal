"use client";

// Reprojections — the blended full-year forecast: actuals for the months we
// have, budget for the rest. Reads the same line ladder as Operating Statements
// and the Operating Budget, so it reads like the budget page but with the
// elapsed months replaced by real GL actuals (shaded) and the remaining months
// projected from budget.

import { useCallback, useEffect, useState } from "react";
import { PROPERTY_DEFS } from "@/lib/properties/data";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const COLOR_BRAND = "#0b4a7d";
const GROUP_DIV = "1px solid var(--border)";
const ACTUAL_TINT = "rgba(21,128,61,0.10)";

type Totals = {
  actual: number[]; budget: number[]; blended: number[];
  reprojTotal: number; budgetTotal: number; variance: number | null;
};
type Line = { label: string; mask: string } & Totals;
type Section = { name: string; role: string; lines: Line[]; subtotal: Totals };
type Reprojection = {
  propertyCode: string; propertyName: string; year: number; actualThroughMonth: number;
  sections: Section[];
  rollups: Record<"totalRevenues" | "totalOperatingExpenses" | "netOperatingIncome" | "capital" | "cashFlowBeforeDebtService" | "totalDebtService" | "cashFlowAfterDebtService", Totals>;
  unbudgetedAccounts: { account: string; actualTotal: number }[];
};
type Available = { key: string; propertyCode: string; entityName: string; name: string; years: number[] };

const isZero = (v: number) => Math.abs(v) < 0.5;
function money0(v: number, psf = false, sqft = 0): string {
  if (psf && sqft > 0) {
    const p = v / sqft;
    return isZero(p) ? "—" : `${p < 0 ? "(" : ""}$${Math.abs(p).toFixed(2)}${p < 0 ? ")" : ""}`;
  }
  if (isZero(v)) return "—";
  const s = Math.abs(Math.round(v)).toLocaleString("en-US");
  return v < 0 ? `($${s})` : `$${s}`;
}
function fmtVarPct(v: number | null, budget: number): string {
  if (v == null || Math.abs(budget) < 0.5) return "";
  const p = (v / Math.abs(budget)) * 100;
  return `${p > 0 ? "+" : ""}${p.toFixed(1)}%`;
}
const varColor = (v: number | null) => (v == null ? "var(--muted)" : v >= 0 ? "#15803d" : "#b91c1c");

const numStyle: React.CSSProperties = { textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 12, padding: "7px 8px", whiteSpace: "nowrap" };
const labelStyle: React.CSSProperties = { textAlign: "left", fontSize: 13, padding: "7px 10px" };
const headStyle: React.CSSProperties = { textAlign: "right", fontSize: 10.5, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.03em", padding: "6px 8px", whiteSpace: "nowrap" };

function HeaderSelect({ value, onChange, children, ariaLabel }: { value: string | number; onChange: (v: string) => void; children: React.ReactNode; ariaLabel: string }) {
  return (
    <select aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)}
      style={{ font: "inherit", fontSize: 14, fontWeight: 700, padding: "8px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)" }}>
      {children}
    </select>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "var(--muted)", cursor: "pointer" }}>
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
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
  const [loading, setLoading] = useState(false);
  const [psf, setPsf] = useState(false);
  const [hideEmpty, setHideEmpty] = useState(true);
  const [showGL, setShowGL] = useState(false);

  useEffect(() => {
    fetch("/api/financials/reprojections").then((r) => r.json()).then((j) => {
      const av: Available[] = j.available ?? [];
      setAvailable(av);
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
    } finally {
      setLoading(false);
    }
  }, [key, year]);
  useEffect(() => { load(); }, [load]);

  const cur = available.find((a) => a.key === key);
  const yearOptions = cur?.years.length ? cur.years : [year || new Date().getFullYear()];
  const sqft = PROPERTY_DEFS.find((p) => p.id === key)?.sqft ?? 0;
  const through = data?.actualThroughMonth ?? 0;

  const view = { psf, sqft, hideEmpty, showGL, through };

  return (
    <main style={{ display: "grid", gap: 14 }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <h1>Reprojections</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <HeaderSelect value={year} onChange={(v) => setYear(Number(v))} ariaLabel="Year">
            {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
          </HeaderSelect>
          <HeaderSelect value={key} onChange={setKey} ariaLabel="Property">
            {available.map((a) => <option key={a.key} value={a.key}>{a.propertyCode} — {a.name}{a.years.length ? "" : " (no GL)"}</option>)}
          </HeaderSelect>
        </div>
      </header>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <p className="muted small" style={{ margin: 0, maxWidth: 720 }}>
          Full-year forecast blending <b style={{ color: "#15803d" }}>actuals</b> for{" "}
          {through > 0 ? <>Jan–{MONTHS[through - 1]}</> : "no months yet"} with{" "}
          <b>budget</b>{through < 12 ? <> for {MONTHS[Math.min(through, 11)]}–Dec</> : ""}.
          {budgetYear ? <> Budget: FY {budgetYear}{budgetFallback ? " (nearest available)" : ""}.</> : <> No budget found for this property.</>}
          {!hasGl && <> No GL uploaded — showing budget as the projection until actuals are imported.</>}
        </p>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11 }}>
            <span style={{ width: 12, height: 12, background: ACTUAL_TINT, border: "1px solid rgba(21,128,61,0.4)", borderRadius: 2, display: "inline-block" }} /> Actual
            <span style={{ width: 12, height: 12, border: "1px solid var(--border)", borderRadius: 2, display: "inline-block", marginLeft: 8 }} /> Budget
          </span>
          <Toggle on={psf} onChange={setPsf} label="View $/SF" />
          <Toggle on={hideEmpty} onChange={setHideEmpty} label="Hide empty rows" />
          <Toggle on={showGL} onChange={setShowGL} label="Show GL" />
        </div>
      </div>

      {loading && <div className="card"><div className="muted small">Loading…</div></div>}
      {!loading && !data && <div className="card"><div className="muted small">Select a property and year.</div></div>}
      {!loading && data && <ReprojTable data={data} view={view} />}
    </main>
  );
}

type ViewOpts = { psf: boolean; sqft: number; hideEmpty: boolean; showGL: boolean; through: number };

function ReprojTable({ data, view }: { data: Reprojection; view: ViewOpts }) {
  const r = data.rollups;
  const byRole = (roles: string[]) => data.sections.filter((s) => roles.includes(s.role));
  const revenueSecs = byRole(["revenue", "reimbursement"]);
  const expenseSecs = byRole(["reimbursable-expense", "non-reimbursable-expense", "residential-expense"]);
  const capitalSecs = byRole(["capital"]);
  const debtSecs = byRole(["debt-service"]);
  const groupHasActivity = (secs: Section[]) => secs.some((s) => s.lines.some((l) => !lineEmpty(l)) || !lineEmpty(s.subtotal));
  const showCapital = capitalSecs.length > 0 && (!view.hideEmpty || groupHasActivity(capitalSecs));
  const showDebt = debtSecs.length > 0 && (!view.hideEmpty || groupHasActivity(debtSecs));

  return (
    <>
      <GroupHeader label="Revenues" />
      {revenueSecs.map((s) => <SectionCard key={s.name} sec={s} view={view} />)}
      <RollupCard label="Total Revenues" t={r.totalRevenues} view={view} />

      <GroupHeader label="Operating Expenses" />
      {expenseSecs.map((s) => <SectionCard key={s.name} sec={s} view={view} />)}
      <RollupCard label="Total Operating Expenses" t={r.totalOperatingExpenses} view={view} />
      <RollupCard label="Net Operating Income" t={r.netOperatingIncome} view={view} strong />

      {showCapital && <GroupHeader label="Capital" />}
      {showCapital && capitalSecs.map((s) => <SectionCard key={s.name} sec={s} view={view} hideSubtotal />)}
      {showDebt ? (
        <>
          <RollupCard label="Cash Flow Before Debt Service" t={r.cashFlowBeforeDebtService} view={view} strong />
          <GroupHeader label="Debt Service" />
          {debtSecs.map((s) => <SectionCard key={s.name} sec={s} view={view} />)}
          <RollupCard label="Total Debt Service" t={r.totalDebtService} view={view} />
          <RollupCard label="Cash Flow After Debt Service" t={r.cashFlowAfterDebtService} view={view} strong />
        </>
      ) : (
        <RollupCard label="Cash Flow" t={r.cashFlowBeforeDebtService} view={view} strong />
      )}

      {data.unbudgetedAccounts.length > 0 && <UnbudgetedCard rows={data.unbudgetedAccounts} />}
    </>
  );
}

function lineEmpty(t: Totals): boolean {
  return isZero(t.reprojTotal) && isZero(t.budgetTotal);
}

function GroupHeader({ label }: { label: string }) {
  return (
    <div style={{ marginTop: 6, fontSize: 12, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: COLOR_BRAND }}>{label}</div>
  );
}

function HeaderRow({ through }: { through: number }) {
  return (
    <tr>
      <th style={{ ...headStyle, textAlign: "left" }}>Line</th>
      {MONTHS.map((m, i) => (
        <th key={m} style={{ ...headStyle, background: i < through ? ACTUAL_TINT : undefined, borderLeft: i === through && through > 0 ? `2px solid rgba(21,128,61,0.5)` : undefined }}>{m}</th>
      ))}
      <th style={{ ...headStyle, borderLeft: GROUP_DIV, color: COLOR_BRAND }}>Full Year</th>
      <th style={headStyle}>Ann Bud</th>
      <th style={headStyle}>Var</th>
    </tr>
  );
}

function Colgroup() {
  return (
    <colgroup>
      <col style={{ width: 190 }} />
      {MONTHS.map((m) => <col key={m} style={{ width: 64 }} />)}
      <col style={{ width: 84 }} /><col style={{ width: 78 }} /><col style={{ width: 78 }} />
    </colgroup>
  );
}

function figureCells(t: Totals, view: ViewOpts, opts: { bold?: boolean; color?: string } = {}) {
  const { psf, sqft, through } = view;
  const base: React.CSSProperties = { ...numStyle, ...(opts.bold ? { fontWeight: 800 } : {}), ...(opts.color ? { color: opts.color } : {}) };
  return (
    <>
      {t.blended.map((v, i) => (
        <td key={i} style={{ ...base, background: i < through ? ACTUAL_TINT : undefined, borderLeft: i === through && through > 0 ? `2px solid rgba(21,128,61,0.5)` : undefined, color: opts.color ?? (i < through ? "var(--text)" : "var(--muted)") }}>
          {money0(v, psf, sqft)}
        </td>
      ))}
      <td style={{ ...base, borderLeft: GROUP_DIV, fontWeight: 800, color: opts.color ?? COLOR_BRAND }}>{money0(t.reprojTotal, psf, sqft)}</td>
      <td style={{ ...base, color: opts.color ?? "var(--muted)" }}>{money0(t.budgetTotal, psf, sqft)}</td>
      <td style={{ ...base, color: opts.color ?? varColor(t.variance) }} title={fmtVarPct(t.variance, t.budgetTotal)}>
        {t.variance == null ? "—" : money0(t.variance, psf, sqft)}
      </td>
    </>
  );
}

function SectionCard({ sec, view, hideSubtotal }: { sec: Section; view: ViewOpts; hideSubtotal?: boolean }) {
  const lines = view.hideEmpty ? sec.lines.filter((l) => !lineEmpty(l)) : sec.lines;
  if (lines.length === 0 && view.hideEmpty) return null;
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", background: "rgba(15,23,42,0.03)", fontSize: 11.5, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase" }}>{sec.name}</div>
      <div className="tableWrap" style={{ marginTop: 0 }}>
        <table style={{ tableLayout: "fixed", width: "100%", minWidth: 1180, borderCollapse: "collapse" }}>
          <Colgroup />
          <thead><HeaderRow through={view.through} /></thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.label}>
                <td style={labelStyle}>
                  {l.label}
                  {view.showGL && <div className="muted" style={{ fontSize: 10.5, fontVariantNumeric: "tabular-nums", marginTop: 1 }}>{l.mask}</div>}
                </td>
                {figureCells(l, view)}
              </tr>
            ))}
            {!hideSubtotal && (
              <tr style={{ background: "rgba(11,74,125,0.06)", borderTop: "2px solid rgba(11,74,125,0.25)" }}>
                <td style={{ ...labelStyle, fontWeight: 800, color: COLOR_BRAND, textTransform: "uppercase", letterSpacing: "0.03em", fontSize: 12 }}>{sec.role === "revenue" ? "Total Revenue and Other" : `Total ${sec.name}`}</td>
                {figureCells(sec.subtotal, view, { bold: true, color: COLOR_BRAND })}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RollupCard({ label, t, view, strong }: { label: string; t: Totals; view: ViewOpts; strong?: boolean }) {
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden", borderColor: COLOR_BRAND, background: strong ? "rgba(11,74,125,0.06)" : "rgba(11,74,125,0.035)" }}>
      <div className="tableWrap" style={{ marginTop: 0 }}>
        <table style={{ tableLayout: "fixed", width: "100%", minWidth: 1180, borderCollapse: "collapse" }}>
          <Colgroup />
          <tbody>
            <tr>
              <td style={{ ...labelStyle, fontSize: strong ? 14 : 12.5, fontWeight: 900, letterSpacing: "0.03em", textTransform: "uppercase", color: COLOR_BRAND }}>{label}</td>
              {figureCells(t, view, { bold: true, color: COLOR_BRAND })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UnbudgetedCard({ rows }: { rows: { account: string; actualTotal: number }[] }) {
  const total = rows.reduce((s, r) => s + r.actualTotal, 0);
  return (
    <div className="card" style={{ borderColor: "rgba(180,83,9,0.4)", background: "rgba(180,83,9,0.04)" }}>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: "#b45309", marginBottom: 6 }}>
        Unbudgeted Actuals — not in any reprojection line ({rows.length})
      </div>
      <div className="muted small" style={{ marginBottom: 8 }}>GL accounts with activity that don&apos;t map to a budget/statement line. Surfaced so the full-year reprojection isn&apos;t silently short.</div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr><th style={{ ...headStyle, textAlign: "left" }}>Account</th><th style={headStyle}>YTD Actual</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.account}>
              <td style={{ ...labelStyle, fontVariantNumeric: "tabular-nums" }}>{r.account}</td>
              <td style={numStyle}>{money0(r.actualTotal)}</td>
            </tr>
          ))}
          <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 800 }}>
            <td style={{ ...labelStyle, fontWeight: 800 }}>Total</td>
            <td style={{ ...numStyle, fontWeight: 900 }}>{money0(total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

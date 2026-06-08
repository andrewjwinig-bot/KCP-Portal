"use client";

// Operating Statements — the actuals twin of Operating Budgets. Upload a
// property's Skyline GL export; the page renders the Comparative Income
// Statement (Current Period + YTD, Actual / Budget / Variance) using the same
// section ladder as the budget. Budget columns fill in step 2 (cross-walk to
// the portal budget); for now they read blank.

import { useCallback, useEffect, useRef, useState } from "react";
import { StatPill } from "@/app/components/Pill";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import type {
  PropertyStatement,
  StatementSection,
  StatementTotals,
  SectionRole,
} from "@/lib/financials/operating-statements/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

type Available = { key: string; propertyCode: string; entityName: string; name: string; years: number[] };

function money0(v: number | null): string {
  if (v == null) return "—";
  const n = Math.round(v);
  const s = Math.abs(n).toLocaleString("en-US");
  return n < 0 ? `(${s})` : s;
}

function varColor(v: number | null): string {
  if (v == null || Math.abs(v) < 0.5) return "var(--muted)";
  return v > 0 ? "#15803d" : "#b91c1c";
}

// Big-label dropdown (label + chevron over an invisible native select) — the
// same pattern the CAM recon + budget headers use.
function HeaderSelect({
  value, onChange, displayLabel, ariaLabel, muted, children,
}: {
  value: string; onChange: (v: string) => void; displayLabel: string;
  ariaLabel: string; muted?: boolean; children: React.ReactNode;
}) {
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
      <span style={{ fontSize: muted ? 20 : 24, fontWeight: 800, color: muted ? "var(--muted)" : "inherit", whiteSpace: "nowrap" }}>{displayLabel}</span>
      <span style={{ color: "var(--muted)", fontSize: 14 }}>▾</span>
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%" }}
      >
        {children}
      </select>
    </span>
  );
}

const COLOR_BRAND = "#0b4a7d";
const GROUP_DIV = "1px solid var(--border)"; // vertical divider between Period / YTD / Annual / Notes

// Roomier, budget-matching cell metrics (larger font, more padding).
const numStyle: React.CSSProperties = { textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 14, padding: "9px 12px", whiteSpace: "nowrap", verticalAlign: "middle" };
const labelStyle: React.CSSProperties = { textAlign: "left", fontSize: 14, padding: "9px 12px", verticalAlign: "middle" };
const headStyle: React.CSSProperties = { fontSize: 12, fontWeight: 800, color: "var(--muted)", padding: "8px 12px", whiteSpace: "nowrap", textAlign: "right", verticalAlign: "bottom" };

function fmtPct(v: number | null): string {
  if (v == null) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
}
// Variance % carries the favorability sign (positive = favorable). Blank when
// there's no budget to compare against.
function varPct(variance: number | null, budget: number | null): number | null {
  if (variance == null || budget == null || Math.abs(budget) < 0.5) return null;
  return (variance / Math.abs(budget)) * 100;
}

type ViewOpts = { psf: boolean; sqft: number; hideEmpty: boolean; showGL: boolean };

// Dollar amount in the active view — total $ or $/SF.
function fmtAmt(v: number | null, psf: boolean, sqft: number): string {
  if (v == null) return "—";
  if (psf && sqft > 0) {
    const x = v / sqft;
    return `${x < 0 ? "-" : ""}$${Math.abs(x).toFixed(2)}`;
  }
  return money0(v);
}

const isZero = (v: number | null) => v == null || Math.abs(v) < 0.5;
function isLineEmpty(t: StatementTotals): boolean {
  return isZero(t.periodActual) && isZero(t.ytdActual) && isZero(t.periodBudget) && isZero(t.ytdBudget) && isZero(t.annualBudget);
}

const threshInput: React.CSSProperties = {
  width: 64, fontSize: 12, fontWeight: 700, padding: "3px 6px", textAlign: "right",
  border: "1px solid var(--border)", borderRadius: 6, background: "var(--card)", color: "var(--text)",
};

type Thresh = { dollar: number; pct: number };

// Is a single variance "high" — beyond EITHER the dollar or the percent
// threshold — and if so, favorable or unfavorable?
function cellFlag(variance: number | null, budget: number | null, th: Thresh): "fav" | "unf" | null {
  if (variance == null || budget == null) return null;
  const vp = varPct(variance, budget);
  const hot = Math.abs(variance) > th.dollar || (vp != null && Math.abs(vp) > th.pct);
  if (!hot) return null;
  return variance >= 0 ? "fav" : "unf";
}

const flagTint = (f: "fav" | "unf" | null) =>
  f === "unf" ? "rgba(185,28,28,0.13)" : f === "fav" ? "rgba(21,128,61,0.13)" : undefined;

// Does a line have any high-variance cell of the given class (month or YTD)?
function lineMatchesClass(l: StatementTotals, cls: "fav" | "unf", th: Thresh): boolean {
  return cellFlag(l.periodVariance, l.periodBudget, th) === cls || cellFlag(l.ytdVariance, l.ytdBudget, th) === cls;
}

// Count line items whose variance vs budget is "high", split favorable vs
// unfavorable, for the current month and YTD.
type VarCounts = { monthFav: number; monthUnf: number; ytdFav: number; ytdUnf: number };
function varianceCounts(s: PropertyStatement, th: Thresh): VarCounts {
  let monthFav = 0, monthUnf = 0, ytdFav = 0, ytdUnf = 0;
  for (const sec of s.sections) for (const l of sec.lines) {
    const m = cellFlag(l.periodVariance, l.periodBudget, th);
    if (m === "fav") monthFav++; else if (m === "unf") monthUnf++;
    const y = cellFlag(l.ytdVariance, l.ytdBudget, th);
    if (y === "fav") ytdFav++; else if (y === "unf") ytdUnf++;
  }
  return { monthFav, monthUnf, ytdFav, ytdUnf };
}

// Segmented two-button toggle, matching the Operating Budgets controls.
const toggleBtn: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, padding: "4px 10px",
  border: "1px solid var(--border)", background: "var(--card)",
  color: "var(--text)", cursor: "pointer", letterSpacing: "0.04em", textTransform: "uppercase",
};
const toggleActive: React.CSSProperties = { background: "#0b4a7d", color: "#fff", borderColor: "#0b4a7d" };
const toggleLabel: React.CSSProperties = { fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" };

function ViewToggle({ psf, onChange, disabled }: { psf: boolean; onChange: (v: boolean) => void; disabled: boolean }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span className="muted small" style={toggleLabel}>View</span>
      <div style={{ display: "inline-flex", borderRadius: 6, overflow: "hidden", opacity: disabled ? 0.5 : 1 }}>
        <button type="button" disabled={disabled} onClick={() => !disabled && onChange(false)} style={{ ...toggleBtn, cursor: disabled ? "not-allowed" : "pointer", borderRadius: "6px 0 0 6px", ...(psf ? {} : toggleActive) }}>Total</button>
        <button type="button" disabled={disabled} onClick={() => !disabled && onChange(true)} style={{ ...toggleBtn, cursor: disabled ? "not-allowed" : "pointer", borderLeft: "none", borderRadius: "0 6px 6px 0", ...(psf ? toggleActive : {}) }}>$/SF</button>
      </div>
    </div>
  );
}

function EmptyRowsToggle({ hide, onChange }: { hide: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span className="muted small" style={toggleLabel}>Empty rows</span>
      <div style={{ display: "inline-flex", borderRadius: 6, overflow: "hidden" }}>
        <button type="button" onClick={() => onChange(true)} style={{ ...toggleBtn, borderRadius: "6px 0 0 6px", ...(hide ? toggleActive : {}) }}>Hide</button>
        <button type="button" onClick={() => onChange(false)} style={{ ...toggleBtn, borderLeft: "none", borderRadius: "0 6px 6px 0", ...(hide ? {} : toggleActive) }}>Show</button>
      </div>
    </div>
  );
}

function GLToggle({ show, onChange }: { show: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span className="muted small" style={toggleLabel}>GL</span>
      <div style={{ display: "inline-flex", borderRadius: 6, overflow: "hidden" }}>
        <button type="button" onClick={() => onChange(false)} style={{ ...toggleBtn, borderRadius: "6px 0 0 6px", ...(show ? {} : toggleActive) }}>Hide</button>
        <button type="button" onClick={() => onChange(true)} style={{ ...toggleBtn, borderLeft: "none", borderRadius: "0 6px 6px 0", ...(show ? toggleActive : {}) }}>Show</button>
      </div>
    </div>
  );
}

export default function OperatingStatementsPage() {
  const [available, setAvailable] = useState<Available[]>([]);
  const [key, setKey] = useState("");
  const [year, setYear] = useState(0);
  const [period, setPeriod] = useState(0);
  const [maxPeriod, setMaxPeriod] = useState(12);
  const [budgetYear, setBudgetYear] = useState<number | null>(null);
  const [budgetFallback, setBudgetFallback] = useState(false);
  const [statement, setStatement] = useState<PropertyStatement | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // View toggles (mirroring the Operating Budgets page).
  const [psf, setPsf] = useState(false);
  const [hideEmpty, setHideEmpty] = useState(false);
  const [showGL, setShowGL] = useState(false);
  // Variance thresholds — a line is "high variance" if it exceeds either.
  const [varDollar, setVarDollar] = useState(5000);
  const [varPctThresh, setVarPctThresh] = useState(10);
  // Click a Favorable/Unfavorable pill to filter the statement to those lines.
  const [flagFilter, setFlagFilter] = useState<"fav" | "unf" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Load the picker payload once.
  useEffect(() => {
    fetch("/api/financials/operating-statements")
      .then((r) => r.json())
      .then((j) => {
        const list: Available[] = j.available ?? [];
        setAvailable(list);
        const withData = list.find((a) => a.years.length);
        const first = withData ?? list[0];
        if (first) {
          setKey(first.key);
          setYear(first.years[0] ?? new Date().getFullYear());
        }
      })
      .catch(() => setError("Failed to load properties."));
  }, []);

  const load = useCallback(async () => {
    if (!key || !year) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ key, year: String(year) });
      if (period) qs.set("period", String(period));
      const j = await fetch(`/api/financials/operating-statements?${qs}`).then((r) => r.json());
      setStatement(j.statement ?? null);
      setNotes(j.notes ?? {});
      setMessage(j.message ?? null);
      setBudgetYear(j.budgetYear ?? null);
      setBudgetFallback(!!j.budgetFallback);
      if (j.maxPeriodInFile) setMaxPeriod(j.maxPeriodInFile);
      if (j.statement && !period) setPeriod(j.statement.period);
    } finally {
      setLoading(false);
    }
  }, [key, year, period]);

  useEffect(() => { load(); }, [load]);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (key) fd.append("key", key);
      const j = await fetch("/api/financials/operating-statements", { method: "POST", body: fd }).then((r) => r.json());
      if (j.error) { setError(j.error); return; }
      // Refresh picker + jump to the uploaded property/year.
      const av = await fetch("/api/financials/operating-statements").then((r) => r.json());
      setAvailable(av.available ?? []);
      setKey(j.key);
      setYear(j.year);
      setPeriod(0);
    } catch {
      setError("Upload failed.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const saveNote = useCallback(async (lineKey: string, note: string) => {
    setNotes((n) => ({ ...n, [lineKey]: note }));
    await fetch("/api/financials/operating-statements", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, year, lineKey, note }),
    }).catch(() => {});
  }, [key, year]);

  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeMsg, setAnalyzeMsg] = useState<string | null>(null);
  const analyzeFlagged = useCallback(async () => {
    setAnalyzing(true);
    setAnalyzeMsg(null);
    try {
      const j = await fetch("/api/financials/operating-statements/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, year, period, dollar: varDollar, pct: varPctThresh }),
      }).then((r) => r.json());
      if (j.error) { setAnalyzeMsg(j.error); return; }
      if (j.notes) setNotes((n) => ({ ...n, ...j.notes }));
      setAnalyzeMsg(j.analyzed ? `Explained ${Object.keys(j.notes ?? {}).length} of ${j.analyzed} flagged lines.` : (j.message ?? "Nothing to analyze."));
    } catch {
      setAnalyzeMsg("Analysis failed.");
    } finally {
      setAnalyzing(false);
    }
  }, [key, year, period, varDollar, varPctThresh]);

  const cur = available.find((a) => a.key === key);
  const yearOptions = cur?.years.length ? cur.years : [year || new Date().getFullYear()];
  const sqft = PROPERTY_DEFS.find((p) => p.id === key)?.sqft ?? 0;
  const thresh: Thresh = { dollar: varDollar, pct: varPctThresh };
  const variance = statement ? varianceCounts(statement, thresh) : null;

  return (
    <main style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <h1>Operating Statements</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
          <span style={{ fontFamily: "'Arial Black', 'Arial Bold', Arial, sans-serif", fontWeight: 900, fontSize: 30, letterSpacing: "-0.5px", lineHeight: 1 }}>KORMAN</span>
          <div style={{ width: 1, height: 36, background: "#000", flexShrink: 0 }} />
          <div style={{ fontSize: 11, letterSpacing: "0.22em", lineHeight: 1.7, fontFamily: "Arial, Helvetica, sans-serif" }}><div>COMMERCIAL</div><div>PROPERTIES</div></div>
        </div>
      </header>

      {error && (
        <div className="card" style={{ borderColor: "rgba(220,38,38,0.35)", background: "rgba(220,38,38,0.04)" }}>
          <div style={{ fontWeight: 700, color: "#b91c1c" }}>Error</div>
          <div className="muted small">{error}</div>
        </div>
      )}

      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", minWidth: 0 }}>
            <HeaderSelect value={String(year)} onChange={(v) => { setYear(Number(v)); setPeriod(0); setFlagFilter(null); }} displayLabel={String(year || "—")} ariaLabel="Year" muted>
              {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
            </HeaderSelect>
            {statement && (
              <HeaderSelect value={String(period || statement.period)} onChange={(v) => setPeriod(Number(v))} displayLabel={MONTHS[(period || statement.period) - 1]} ariaLabel="Period" muted>
                {Array.from({ length: maxPeriod }, (_, i) => i + 1).map((p) => (
                  <option key={p} value={p}>{MONTHS[p - 1]} — Period {p}</option>
                ))}
              </HeaderSelect>
            )}
            <HeaderSelect value={key} onChange={(v) => { setKey(v); setPeriod(0); setFlagFilter(null); }} displayLabel={cur ? `${cur.propertyCode} — ${cur.name}` : "—"} ariaLabel="Property">
              {available.map((a) => (
                <option key={a.key} value={a.key}>{a.propertyCode} — {a.name}{a.years.length ? "" : " (no GL)"}</option>
              ))}
            </HeaderSelect>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button className="btn primary" style={{ fontSize: 13, padding: "8px 14px", fontWeight: 700 }} disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? "Uploading…" : "Upload GL"}
            </button>
            <input ref={fileRef} type="file" accept=".xls,.xlsx,.xlsm" style={{ display: "none" }} onChange={onUpload} />
          </div>
        </div>

        <div style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <p className="muted small" style={{ margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
            <span>Import the <b>Detailed General Ledger</b> Excel file (.xls or .xlsx).</span>
            <ImportInstructionsButton
              year={year || new Date().getFullYear()}
              nextPeriod={statement ? Math.min(maxPeriod + 1, 12) : 1}
            />
          </p>
          {statement && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <ViewToggle psf={psf} onChange={setPsf} disabled={sqft <= 0} />
              <EmptyRowsToggle hide={hideEmpty} onChange={setHideEmpty} />
              <GLToggle show={showGL} onChange={setShowGL} />
            </div>
          )}
        </div>

        {statement && variance && (() => {
          const cfad = statement.rollups.cashFlowAfterDebtService;
          const mPct = varPct(cfad.periodVariance, cfad.periodBudget);
          const yPct = varPct(cfad.ytdVariance, cfad.ytdBudget);
          const mon = MONTHS[statement.period - 1];
          const pctAccent = (v: number | null) => (v == null ? undefined : v >= 0 ? "#15803d" : "#b91c1c");
          return (
            <>
              <div className="pills" style={{ marginTop: 12 }}>
                <StatPill label={`Cash Flow After Debt · ${mon} vs Budget`} value={fmtPct(mPct)} accent={pctAccent(mPct)} />
                <StatPill label="Cash Flow After Debt · YTD vs Budget" value={fmtPct(yPct)} accent={pctAccent(yPct)} />
                <ClickablePill active={flagFilter === "unf"} activeColor="#b91c1c" onClick={() => setFlagFilter((f) => (f === "unf" ? null : "unf"))} title="Click to show only unfavorable lines">
                  <StatPill label="Lines Unfavorable · YTD" value={variance.ytdUnf} sub={`${variance.monthUnf} in ${mon}`} accent={variance.ytdUnf > 0 ? "#b91c1c" : undefined} />
                </ClickablePill>
                <ClickablePill active={flagFilter === "fav"} activeColor="#15803d" onClick={() => setFlagFilter((f) => (f === "fav" ? null : "fav"))} title="Click to show only favorable lines">
                  <StatPill label="Lines Favorable · YTD" value={variance.ytdFav} sub={`${variance.monthFav} in ${mon}`} accent={variance.ytdFav > 0 ? "#15803d" : undefined} />
                </ClickablePill>
              </div>
              <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button type="button" className="btn" disabled={analyzing} onClick={analyzeFlagged}
                    title="Use AI to explain each flagged line and auto-fill its note (from budget detail + GL transactions)"
                    style={{ fontSize: 12, padding: "5px 12px", fontWeight: 700 }}>
                    {analyzing ? "Analyzing…" : "✨ Auto-explain flagged lines"}
                  </button>
                  {analyzeMsg && <span className="muted small">{analyzeMsg}</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }} className="muted small">
                  <span style={{ fontWeight: 700 }}>Flag lines over</span>
                  <span>$</span>
                  <input type="number" min={0} value={varDollar} onChange={(e) => setVarDollar(Math.max(0, Number(e.target.value) || 0))} style={threshInput} />
                  <span>or</span>
                  <input type="number" min={0} value={varPctThresh} onChange={(e) => setVarPctThresh(Math.max(0, Number(e.target.value) || 0))} style={threshInput} />
                  <span>%</span>
                </div>
              </div>
            </>
          );
        })()}
      </div>

      {loading && <div className="card"><div className="muted small">Loading…</div></div>}

      {!loading && !statement && (
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 4 }}>No statement yet</div>
          <div className="muted small">{message ?? "Upload this property's Skyline GL export to generate its operating statement."}</div>
        </div>
      )}

      {!loading && statement && <StatementTable s={statement} viewKey={key} budgetYear={budgetYear} budgetFallback={budgetFallback} notes={notes} onSaveNote={saveNote} view={{ psf, sqft, hideEmpty, showGL }} thresh={thresh} flagFilter={flagFilter} onClearFilter={() => setFlagFilter(null)} />}
    </main>
  );
}

// ── Statement (one card per section, like the Budgets page) ──────────────────

type NoteFns = { notes: Record<string, string>; onSaveNote: (lineKey: string, note: string) => void };
const lineKeyOf = (sectionName: string, label: string) => `${sectionName}::${label}`;

// Shared fixed-width columns so every section/subtotal card lines up.
function StatementColgroup() {
  return (
    <colgroup>
      <col style={{ width: "22%" }} />
      <col style={{ width: "9%" }} /><col style={{ width: "9%" }} /><col style={{ width: "7%" }} />
      <col style={{ width: "9%" }} /><col style={{ width: "9%" }} /><col style={{ width: "7%" }} />
      <col style={{ width: "9%" }} />
      <col style={{ width: "19%" }} />
    </colgroup>
  );
}

// Group header bar above a band of section cards — matches the Budgets page.
function GroupHeader({ label }: { label: string }) {
  return (
    <div style={{ marginTop: 4, paddingBottom: 6, borderBottom: `2px solid ${COLOR_BRAND}`, fontSize: 18, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: COLOR_BRAND }}>
      {label}
    </div>
  );
}

function HeaderRow({ monthLabel }: { monthLabel: string }) {
  return (
    <tr>
      <th style={{ ...headStyle, textAlign: "left" }}>Line</th>
      <th style={{ ...headStyle, borderLeft: GROUP_DIV, color: COLOR_BRAND }}>{monthLabel} Act</th>
      <th style={{ ...headStyle, color: COLOR_BRAND }}>{monthLabel} Bud</th>
      <th style={{ ...headStyle, color: COLOR_BRAND }}>Var %</th>
      <th style={{ ...headStyle, borderLeft: GROUP_DIV }}>YTD Act</th>
      <th style={headStyle}>YTD Bud</th>
      <th style={headStyle}>YTD Var %</th>
      <th style={{ ...headStyle, borderLeft: GROUP_DIV }}>Annual</th>
      <th style={{ ...headStyle, borderLeft: GROUP_DIV, textAlign: "left" }}>Notes</th>
    </tr>
  );
}

function StatementTable({ s, viewKey, budgetYear, budgetFallback, notes, onSaveNote, view, thresh, flagFilter, onClearFilter }: {
  s: PropertyStatement; viewKey: string; budgetYear: number | null; budgetFallback: boolean; view: ViewOpts;
  thresh: Thresh; flagFilter: "fav" | "unf" | null; onClearFilter: () => void;
} & NoteFns) {
  const byRole = (roles: SectionRole[]) => s.sections.filter((x) => roles.includes(x.role));
  const revenueSecs = byRole(["revenue", "reimbursement"]);
  const expenseSecs = byRole(["reimbursable-expense", "non-reimbursable-expense", "residential-expense"]);
  const capitalSecs = byRole(["capital"]);
  const debtSecs = byRole(["debt-service"]);
  const r = s.rollups;
  const nf: NoteFns = { notes, onSaveNote };
  const monthLabel = MONTHS[s.period - 1];
  // Line drill-down — Budget detail ⇄ GL transactions, opened from a cell.
  const [detail, setDetail] = useState<{ mask: string; label: string; sign: 1 | -1; tab: "gl" | "budget"; scope: "month" | "ytd" | "annual" } | null>(null);
  const openDetail = (sec: StatementSection, l: { mask: string; label: string }, tab: "gl" | "budget", scope: "month" | "ytd" | "annual") =>
    setDetail({ mask: l.mask, label: l.label, sign: sec.role === "revenue" || sec.role === "reimbursement" ? -1 : 1, tab, scope });
  const detailModal = detail && (
    <LineDetailModal viewKey={viewKey} property={s.propertyCode} year={s.year} period={s.period} monthLabel={monthLabel} line={detail} initialTab={detail.tab} initialScope={detail.scope} onClose={() => setDetail(null)} />
  );

  const footerCard = (
    <div className="card">
      {budgetFallback && budgetYear != null && (
        <div style={{ marginBottom: 10, fontSize: 12, color: "#b45309", fontWeight: 600 }}>
          Budget columns use the {budgetYear} budget — no {s.year} budget is loaded for this property.
        </div>
      )}
      {s.unmappedAccounts.length > 0 && (
        <div style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(180,83,9,0.06)", border: "1px solid rgba(180,83,9,0.3)" }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em", color: "#b45309" }}>
            Trial-balance tie-out — {s.unmappedAccounts.length} GL account{s.unmappedAccounts.length === 1 ? "" : "s"} not on the statement
          </div>
          <div className="muted small" style={{ marginTop: 4, lineHeight: 1.6 }}>
            These carry a YTD balance but map to no statement line (depreciation, interest, balance-sheet, deferred costs, rounding). Expected for non-operating accounts; review if an operating account appears here.
          </div>
          <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {s.unmappedAccounts.slice(0, 24).map((u) => (
              <span key={u.account} className="muted" style={{ fontSize: 11, fontVariantNumeric: "tabular-nums", color: "#7c2d12" }}>{u.account}: {money0(u.ytdActual)}</span>
            ))}
          </div>
        </div>
      )}
      <p className="small muted" style={{ marginTop: s.unmappedAccounts.length > 0 ? 12 : 0 }}>
        Actual = GL Debit − Credit (revenue shown positive). Variance % is favorable when positive (revenue over budget / expense under budget). Budget columns line up to the {budgetYear ?? s.year} portal budget via the same GL account masks.
      </p>
    </div>
  );

  // Filter mode — show only the flagged lines of the clicked class, grouped by
  // their section (no subtotals, rollups or group headers).
  if (flagFilter) {
    const matchSecs = s.sections.filter((sec) => sec.lines.some((l) => lineMatchesClass(l, flagFilter, thresh)));
    const count = matchSecs.reduce((n, sec) => n + sec.lines.filter((l) => lineMatchesClass(l, flagFilter, thresh)).length, 0);
    const color = flagFilter === "unf" ? "#b91c1c" : "#15803d";
    const word = flagFilter === "unf" ? "unfavorable" : "favorable";
    return (
      <>
        <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", borderColor: color, background: flagFilter === "unf" ? "rgba(185,28,28,0.05)" : "rgba(21,128,61,0.05)" }}>
          <span style={{ fontWeight: 700, color }}>
            Showing {count} {word} line{count === 1 ? "" : "s"} — variance beyond ${thresh.dollar.toLocaleString()} or {thresh.pct}% of budget
          </span>
          <button type="button" className="btn" onClick={onClearFilter} style={{ fontSize: 13, padding: "6px 12px", fontWeight: 700 }}>Clear filter</button>
        </div>
        {matchSecs.length === 0
          ? <div className="card"><div className="muted small">No {word} lines beyond the threshold.</div></div>
          : matchSecs.map((sec) => <SectionCard key={sec.name} sec={sec} nf={nf} monthLabel={monthLabel} view={view} thresh={thresh} onOpenDetail={openDetail} filterClass={flagFilter} />)}
        {footerCard}
        {detailModal}
      </>
    );
  }

  const sc = (sec: StatementSection, hideSubtotal?: boolean) => (
    <SectionCard key={sec.name} sec={sec} nf={nf} monthLabel={monthLabel} view={view} thresh={thresh} onOpenDetail={openDetail} hideSubtotal={hideSubtotal} />
  );

  return (
    <>
      <GroupHeader label="Revenues" />
      {revenueSecs.map((sec) => sc(sec))}
      <RollupCard label="Total Revenues" t={r.totalRevenues} view={view} />

      <GroupHeader label="Operating Expenses" />
      {expenseSecs.map((sec) => sc(sec))}
      <RollupCard label="Total Operating Expenses" t={r.totalOperatingExpenses} view={view} />
      <RollupCard label="Net Operating Income" t={r.netOperatingIncome} view={view} strong />

      {capitalSecs.length > 0 && <GroupHeader label="Capital" />}
      {capitalSecs.map((sec) => sc(sec, true))}
      <RollupCard label="Cash Flow Before Debt Service" t={r.cashFlowBeforeDebtService} view={view} strong />

      {debtSecs.length > 0 && <GroupHeader label="Debt Service" />}
      {debtSecs.map((sec) => sc(sec))}
      {debtSecs.length > 0 && <RollupCard label="Total Debt Service" t={r.totalDebtService} view={view} />}
      <RollupCard label="Cash Flow After Debt Service" t={r.cashFlowAfterDebtService} view={view} strong />

      {footerCard}
      {detailModal}
    </>
  );
}

// Section subtotal label — mirrors the workbook ("Total Revenue and Other"
// for the revenue section; "Total <name>" otherwise).
const subtotalLabel = (sec: StatementSection) =>
  sec.role === "revenue" ? "Total Revenue and Other" : `Total ${sec.name}`;

function SectionCard({ sec, nf, monthLabel, view, thresh, onOpenDetail, filterClass, hideSubtotal }: { sec: StatementSection; nf: NoteFns; monthLabel: string; view: ViewOpts; thresh: Thresh; onOpenDetail: (sec: StatementSection, l: { mask: string; label: string }, tab: "gl" | "budget", scope: "month" | "ytd" | "annual") => void; filterClass?: "fav" | "unf"; hideSubtotal?: boolean }) {
  const lines = filterClass
    ? sec.lines.filter((l) => lineMatchesClass(l, filterClass, thresh))
    : view.hideEmpty ? sec.lines.filter((l) => !isLineEmpty(l)) : sec.lines;
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      {/* Neutral section header bar, matching the Budgets page. */}
      <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", background: "rgba(15,23,42,0.03)", fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase" }}>
        {sec.name}
      </div>
      <div className="tableWrap" style={{ marginTop: 0 }}>
        <table style={{ tableLayout: "fixed", width: "100%", minWidth: 1000 }}>
          <StatementColgroup />
          <thead><HeaderRow monthLabel={monthLabel} /></thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.label}>
                <td style={labelStyle}>
                  <button type="button" onClick={() => onOpenDetail(sec, l, "gl", "ytd")} title="View the GL transactions behind this line"
                    style={{ all: "unset", cursor: "pointer", color: "#0b4a7d", textDecorationLine: "underline", textDecorationColor: "rgba(11,74,125,0.35)", textUnderlineOffset: 2 }}>
                    {l.label}
                  </button>
                  {view.showGL && <div className="muted" style={{ fontSize: 11, fontVariantNumeric: "tabular-nums", marginTop: 1 }}>{l.mask}</div>}
                </td>
                {figureCells(l, { psf: view.psf, sqft: view.sqft, flag: thresh, drill: (tab, scope) => onOpenDetail(sec, l, tab, scope) })}
                <NoteCell lineKey={lineKeyOf(sec.name, l.label)} {...nf} />
              </tr>
            ))}
            {!hideSubtotal && !filterClass && (
              <tr style={{ background: "rgba(11,74,125,0.06)", borderTop: "2px solid rgba(11,74,125,0.30)" }}>
                <td style={{ ...labelStyle, fontWeight: 800, color: COLOR_BRAND, textTransform: "uppercase", letterSpacing: "0.04em", fontSize: 13.5 }}>{subtotalLabel(sec)}</td>
                {figureCells(sec.subtotal, { bold: true, color: COLOR_BRAND, psf: view.psf, sqft: view.sqft })}
                <td style={{ borderLeft: GROUP_DIV }} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RollupCard({ label, t, view, strong }: { label: string; t: StatementTotals; view: ViewOpts; strong?: boolean }) {
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden", borderColor: COLOR_BRAND, background: strong ? "rgba(11,74,125,0.06)" : "rgba(11,74,125,0.035)" }}>
      <div className="tableWrap" style={{ marginTop: 0 }}>
        <table style={{ tableLayout: "fixed", width: "100%", minWidth: 1000 }}>
          <StatementColgroup />
          <tbody>
            <tr>
              <td style={{ ...labelStyle, fontSize: strong ? 15 : 13.5, fontWeight: 900, letterSpacing: "0.04em", textTransform: "uppercase", color: COLOR_BRAND, borderBottom: "none" }}>{label}</td>
              {figureCells(t, { bold: true, color: COLOR_BRAND, noBorder: true, psf: view.psf, sqft: view.sqft })}
              <td style={{ borderLeft: GROUP_DIV, borderBottom: "none" }} />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** The seven figure cells (Period A/B/Var% · YTD A/B/Var% · Annual). When
 *  `flag` (the thresholds) is supplied, the month/YTD Var % cells that are
 *  high-variance get a green (favorable) / red (unfavorable) highlight. */
function figureCells(t: StatementTotals, opts: { bold?: boolean; color?: string; noBorder?: boolean; psf?: boolean; sqft?: number; flag?: Thresh; drill?: (tab: "gl" | "budget", scope: "month" | "ytd" | "annual") => void } = {}) {
  const { bold, color, noBorder, psf = false, sqft = 0, flag, drill } = opts;
  const base: React.CSSProperties = { ...numStyle, ...(bold ? { fontWeight: 800 } : {}), ...(color ? { color } : {}), ...(noBorder ? { borderBottom: "none" } : {}) };
  const pV = varPct(t.periodVariance, t.periodBudget);
  const yV = varPct(t.ytdVariance, t.ytdBudget);
  const amt = (v: number | null) => fmtAmt(v, psf, sqft);
  const mFlag = flag ? cellFlag(t.periodVariance, t.periodBudget, flag) : null;
  const yFlag = flag ? cellFlag(t.ytdVariance, t.ytdBudget, flag) : null;
  const varCell = (pct: number | null, f: "fav" | "unf" | null): React.CSSProperties =>
    ({ ...base, color: color ?? varColor(pct), ...(f ? { background: flagTint(f), fontWeight: 800 } : {}) });
  // Actual cells drill into GL transactions; Budget/Annual cells into the
  // budget detail. Clickable only on real line rows (drill provided).
  const click = (tab: "gl" | "budget", scope: "month" | "ytd" | "annual"): React.HTMLAttributes<HTMLTableCellElement> =>
    drill ? { onClick: () => drill(tab, scope), title: tab === "gl" ? "GL transactions" : "Budget detail" } : {};
  const ptr = drill ? { cursor: "pointer" as const } : {};
  return (
    <>
      <td {...click("gl", "month")} style={{ ...base, ...ptr, borderLeft: GROUP_DIV }}>{amt(t.periodActual)}</td>
      <td {...click("budget", "month")} style={{ ...base, ...ptr, color: color ?? "var(--muted)" }}>{amt(t.periodBudget)}</td>
      <td style={varCell(pV, mFlag)}>{fmtPct(pV)}</td>
      <td {...click("gl", "ytd")} style={{ ...base, ...ptr, borderLeft: GROUP_DIV }}>{amt(t.ytdActual)}</td>
      <td {...click("budget", "ytd")} style={{ ...base, ...ptr, color: color ?? "var(--muted)" }}>{amt(t.ytdBudget)}</td>
      <td style={varCell(yV, yFlag)}>{fmtPct(yV)}</td>
      <td {...click("budget", "annual")} style={{ ...base, ...ptr, borderLeft: GROUP_DIV, color: color ?? "var(--muted)" }}>{amt(t.annualBudget)}</td>
    </>
  );
}

// A pill wrapper that's clickable (filter toggle), showing an outline when active.
function ClickablePill({ active, activeColor, onClick, title, children }: { active: boolean; activeColor: string; onClick: () => void; title?: string; children: React.ReactNode }) {
  return (
    <div role="button" tabIndex={0} title={title} onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      style={{ display: "flex", flex: "1 1 0", minWidth: 0, cursor: "pointer", borderRadius: 12, outline: active ? `2px solid ${activeColor}` : "2px solid transparent", outlineOffset: 2 }}>
      {children}
    </div>
  );
}

function NoteCell({ lineKey, notes, onSaveNote }: { lineKey: string } & NoteFns) {
  const value = notes[lineKey] ?? "";
  const [text, setText] = useState(value);
  useEffect(() => { setText(value); }, [value]);
  return (
    <td style={{ ...labelStyle, borderLeft: GROUP_DIV, padding: "4px 8px" }}>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => { e.currentTarget.style.borderColor = "transparent"; e.currentTarget.style.background = "transparent"; if (text !== value) onSaveNote(lineKey, text); }}
        onFocus={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--card)"; }}
        placeholder="Add a note…"
        style={{ width: "100%", border: "1px solid transparent", borderRadius: 6, background: "transparent", font: "inherit", fontSize: 13, padding: "4px 6px", color: "var(--text)" }}
      />
    </td>
  );
}

// ── GL transaction drill-down ────────────────────────────────────────────────

type TxRow = { account: string; date: string | null; description: string; ref: string; amount: number; month: number };

function money2(v: number): string {
  const s = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v < 0 ? `(${s})` : s;
}
function fmtTxDate(iso: string | null): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[2]}/${m[3]}/${m[1].slice(2)}` : iso;
}

type BudRow = { label: string; glAccount: string; month: number; ytd: number; annual: number };

function LineDetailModal({ viewKey, property, year, period, monthLabel, line, initialTab, initialScope, onClose }: {
  viewKey: string; property: string; year: number; period: number; monthLabel: string;
  line: { mask: string; label: string; sign: 1 | -1 };
  initialTab: "gl" | "budget"; initialScope: "month" | "ytd" | "annual"; onClose: () => void;
}) {
  const [tab, setTab] = useState<"gl" | "budget">(initialTab);
  // GL has no "annual" scope (the file is YTD); clamp it to YTD.
  const [scope, setScope] = useState<"month" | "ytd" | "annual">(initialTab === "gl" && initialScope === "annual" ? "ytd" : initialScope);
  const [gl, setGl] = useState<{ transactions: TxRow[]; total: number; count: number; accounts?: string[] } | null>(null);
  const [bud, setBud] = useState<{ rows: BudRow[]; budgetYear: number | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const effScope: "month" | "ytd" | "annual" = tab === "gl" && scope === "annual" ? "ytd" : scope;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    setLoading(true);
    if (tab === "gl") {
      const qs = new URLSearchParams({ key: viewKey, year: String(year), mask: line.mask, period: String(period), scope: effScope === "month" ? "month" : "ytd", sign: String(line.sign) });
      fetch(`/api/financials/operating-statements/transactions?${qs}`)
        .then((r) => r.json()).then(setGl).catch(() => setGl({ transactions: [], total: 0, count: 0 })).finally(() => setLoading(false));
    } else {
      const qs = new URLSearchParams({ property, year: String(year), mask: line.mask, period: String(period) });
      fetch(`/api/financials/operating-statements/budget-detail?${qs}`)
        .then((r) => r.json()).then(setBud).catch(() => setBud({ rows: [], budgetYear: null })).finally(() => setLoading(false));
    }
  }, [tab, effScope, viewKey, property, year, period, line.mask, line.sign]);

  const th: React.CSSProperties = { textAlign: "left", fontSize: 11, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em", padding: "6px 10px", position: "sticky", top: 0, background: "var(--card)" };
  const tdc: React.CSSProperties = { padding: "6px 10px", fontSize: 13, borderTop: "1px solid var(--border)", verticalAlign: "top" };
  const seg = (active: boolean): React.CSSProperties => ({ ...toggleBtn, ...(active ? toggleActive : {}) });
  const tabBtn = (active: boolean): React.CSSProperties => ({ fontSize: 13, fontWeight: 700, padding: "6px 12px", border: "none", borderBottom: `2px solid ${active ? COLOR_BRAND : "transparent"}`, background: "none", color: active ? COLOR_BRAND : "var(--muted)", cursor: "pointer" });
  const scopeWord = effScope === "month" ? monthLabel : effScope === "annual" ? "Annual" : `YTD through ${monthLabel}`;

  const budRows = bud?.rows ?? [];
  const budAmt = (r: BudRow) => effScope === "month" ? r.month : effScope === "annual" ? r.annual : r.ytd;
  const budTotal = budRows.reduce((s, r) => s + budAmt(r), 0);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "48px 20px", overflow: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--card)", borderRadius: 12, maxWidth: 820, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.35)", display: "flex", flexDirection: "column", maxHeight: "82vh" }}>
        <div style={{ padding: "16px 18px 0", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)" }}>Line Detail</div>
              <div style={{ fontSize: 17, fontWeight: 800 }}>{line.label}</div>
              <div className="muted small" style={{ marginTop: 2 }}><code style={{ fontSize: 11 }}>{line.mask}</code></div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ display: "inline-flex", borderRadius: 6, overflow: "hidden" }}>
                <button type="button" onClick={() => setScope("month")} style={{ ...seg(effScope === "month"), borderRadius: "6px 0 0 6px" }}>{monthLabel}</button>
                <button type="button" onClick={() => setScope("ytd")} style={{ ...seg(effScope === "ytd"), borderLeft: "none", ...(tab === "gl" ? { borderRadius: "0 6px 6px 0" } : {}) }}>YTD</button>
                {tab === "budget" && <button type="button" onClick={() => setScope("annual")} style={{ ...seg(effScope === "annual"), borderLeft: "none", borderRadius: "0 6px 6px 0" }}>Annual</button>}
              </div>
              <button type="button" className="btn" onClick={onClose} style={{ padding: "6px 12px", fontSize: 13, fontWeight: 700 }}>Close</button>
            </div>
          </div>
          <div style={{ display: "flex", gap: 4, marginTop: 10 }}>
            <button type="button" onClick={() => setTab("budget")} style={tabBtn(tab === "budget")}>Budget detail</button>
            <button type="button" onClick={() => setTab("gl")} style={tabBtn(tab === "gl")}>GL transactions</button>
          </div>
        </div>

        <div style={{ overflow: "auto", flex: 1 }}>
          {loading ? (
            <div className="muted small" style={{ padding: 18 }}>Loading…</div>
          ) : tab === "gl" ? (
            !gl || gl.count === 0 ? (
              <div className="muted small" style={{ padding: 18 }}>No transactions for this line in {scopeWord}.</div>
            ) : (() => {
              // Standout drivers — transactions that are a large share of the
              // line's activity (≥ a third of the total absolute, or the single
              // biggest when it's a meaningful slice). Highlighted so the items
              // worth investigating jump out.
              const totalAbs = gl.transactions.reduce((s, t) => s + Math.abs(t.amount), 0);
              const maxAbs = Math.max(0, ...gl.transactions.map((t) => Math.abs(t.amount)));
              const isDriver = (amt: number) => totalAbs > 0 && (Math.abs(amt) >= totalAbs / 3 || (gl.transactions.length >= 3 && Math.abs(amt) === maxAbs && Math.abs(amt) >= 0.2 * totalAbs));
              return (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><th style={th}>Date</th><th style={th}>Description</th><th style={th}>Ref</th><th style={th}>Acct</th><th style={{ ...th, textAlign: "right" }}>Amount</th></tr></thead>
                <tbody>
                  {gl.transactions.map((t, i) => {
                    const driver = isDriver(t.amount);
                    return (
                    <tr key={i} style={driver ? { background: "rgba(180,83,9,0.10)" } : undefined}>
                      <td style={{ ...tdc, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{fmtTxDate(t.date)}</td>
                      <td style={tdc}>{driver && <span title="Major driver of this line" style={{ color: "#b45309", fontWeight: 800, marginRight: 5 }}>▲</span>}{t.description}</td>
                      <td style={{ ...tdc, whiteSpace: "nowrap", color: "var(--muted)" }}>{t.ref}</td>
                      <td style={{ ...tdc, whiteSpace: "nowrap", color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>{t.account}</td>
                      <td style={{ ...tdc, textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", fontWeight: driver ? 800 : undefined, color: t.amount < 0 ? "#b91c1c" : undefined }}>{money2(t.amount)}</td>
                    </tr>
                  );})}
                </tbody>
                <tfoot><tr>
                  <td colSpan={4} style={{ ...tdc, fontWeight: 800, borderTop: "2px solid var(--border)" }}>Total · {gl.count} transaction{gl.count === 1 ? "" : "s"}</td>
                  <td style={{ ...tdc, textAlign: "right", fontWeight: 900, fontVariantNumeric: "tabular-nums", borderTop: "2px solid var(--border)" }}>{money2(gl.total)}</td>
                </tr></tfoot>
              </table>
              );
            })()
          ) : budRows.length === 0 ? (
            <div className="muted small" style={{ padding: 18 }}>No budget lines map to this statement line{bud?.budgetYear ? ` in the ${bud.budgetYear} budget` : ""}.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={th}>Budget Line</th><th style={th}>Acct</th><th style={{ ...th, textAlign: "right" }}>{scopeWord} Budget</th></tr></thead>
              <tbody>
                {budRows.map((r, i) => (
                  <tr key={i}>
                    <td style={tdc}>{r.label}</td>
                    <td style={{ ...tdc, whiteSpace: "nowrap", color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>{r.glAccount}</td>
                    <td style={{ ...tdc, textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{money2(budAmt(r))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr>
                <td colSpan={2} style={{ ...tdc, fontWeight: 800, borderTop: "2px solid var(--border)" }}>Total budget{bud?.budgetYear ? ` (FY ${bud.budgetYear})` : ""}</td>
                <td style={{ ...tdc, textAlign: "right", fontWeight: 900, fontVariantNumeric: "tabular-nums", borderTop: "2px solid var(--border)" }}>{money2(budTotal)}</td>
              </tr></tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Import instructions (Skyline → Portal), mirroring the Rent Roll page ──────

function fmtMDY(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

function ImportInstructionsButton({ year, nextPeriod }: { year: number; nextPeriod: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        title="How to export the Detailed General Ledger from Skyline and import it here"
        aria-label="Import instructions"
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 16, height: 16, padding: 0, fontSize: 10, fontWeight: 800, lineHeight: 1,
          background: "rgba(11,74,125,0.10)", color: "#0b4a7d",
          border: "1px solid rgba(11,74,125,0.30)", borderRadius: "50%", cursor: "pointer",
        }}
      >
        i
      </button>
      {open && <ImportInstructionsModal onClose={() => setOpen(false)} year={year} nextPeriod={nextPeriod} />}
    </>
  );
}

function ImportInstructionsModal({ onClose, year, nextPeriod }: { onClose: () => void; year: number; nextPeriod: number }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const sectionLabelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)",
  };
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 100, background: "rgba(15,23,42,0.55)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "60px 20px", overflow: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--card)", borderRadius: 12, maxWidth: 640, width: "100%", padding: 22,
          boxShadow: "0 20px 60px rgba(0,0,0,0.35)", display: "flex", flexDirection: "column", gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={sectionLabelStyle}>Detailed General Ledger Import Instructions</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>Export from Skyline → Import here</div>
          </div>
          <button onClick={onClose} className="btn" style={{ padding: "6px 12px", fontSize: 13, fontWeight: 700 }}>Close</button>
        </div>

        {/* Step 1: Skyline export */}
        <div>
          <div style={sectionLabelStyle}>1. Export Detailed General Ledger from Skyline</div>
          <ol style={{ marginTop: 8, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6, fontSize: 14 }}>
            <li>Skyline: <b>General Ledger → Reports → Detailed General Ledger</b>.</li>
            <li>{(() => {
              const start = new Date(year, 0, 1);
              const end = new Date(year, nextPeriod, 0);
              const label = end.toLocaleDateString("en-US", { month: "long", year: "numeric" });
              return <>Select <b>Beginning Date</b> (<b>{fmtMDY(start)}</b>) and <b>End Date</b> (<b>{fmtMDY(end)}</b>) — year-to-date through <b>{label}</b>, so the report carries each month&rsquo;s totals.</>;
            })()}</li>
            <li>From the Detailed General Ledger report, select <b>Export</b> in the upper left.</li>
            <li>Select <b>Microsoft Excel (97-2003) (.xls)</b> — the selection from the top.</li>
            <li>Hit <b>Save</b> and save to <b>Data\Accounting\{year} Year End\Reports to Eisner\Monthly GLs</b>. File name is not important.</li>
          </ol>
        </div>

        {/* Step 2: Portal import */}
        <div>
          <div style={sectionLabelStyle}>2. Import Detailed General Ledger into Portal</div>
          <ol style={{ marginTop: 8, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6, fontSize: 14 }}>
            <li>Select <b>Upload GL</b> in the upper right of the Operating Statements page.</li>
            <li>Select the saved Excel file from above and hit <b>Open</b>.</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

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

// Count line items whose variance vs budget is "high" — beyond EITHER the
// dollar or the percent threshold — split favorable vs unfavorable, for the
// current month and YTD. `flagged` maps a line key → its YTD (else month)
// classification so the table can mark it.
type VarCounts = { monthFav: number; monthUnf: number; ytdFav: number; ytdUnf: number; flagged: Record<string, "fav" | "unf"> };
function varianceCounts(s: PropertyStatement, dollarThresh: number, pctThresh: number): VarCounts {
  let monthFav = 0, monthUnf = 0, ytdFav = 0, ytdUnf = 0;
  const flagged: Record<string, "fav" | "unf"> = {};
  const hot = (v: number | null, budget: number | null) => {
    if (v == null || budget == null) return false;
    const vp = varPct(v, budget);
    return Math.abs(v) > dollarThresh || (vp != null && Math.abs(vp) > pctThresh);
  };
  for (const sec of s.sections) for (const l of sec.lines) {
    const key = `${sec.name}::${l.label}`;
    if (hot(l.periodVariance, l.periodBudget)) {
      const fav = (l.periodVariance ?? 0) >= 0;
      if (fav) monthFav++; else monthUnf++;
      flagged[key] = fav ? "fav" : "unf";
    }
    if (hot(l.ytdVariance, l.ytdBudget)) {
      const fav = (l.ytdVariance ?? 0) >= 0;
      if (fav) ytdFav++; else ytdUnf++;
      flagged[key] = fav ? "fav" : "unf"; // YTD classification wins for the marker
    }
  }
  return { monthFav, monthUnf, ytdFav, ytdUnf, flagged };
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

  const cur = available.find((a) => a.key === key);
  const yearOptions = cur?.years.length ? cur.years : [year || new Date().getFullYear()];
  const sqft = PROPERTY_DEFS.find((p) => p.id === key)?.sqft ?? 0;
  const variance = statement ? varianceCounts(statement, varDollar, varPctThresh) : null;

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
            <HeaderSelect value={String(year)} onChange={(v) => { setYear(Number(v)); setPeriod(0); }} displayLabel={String(year || "—")} ariaLabel="Year" muted>
              {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
            </HeaderSelect>
            {statement && (
              <HeaderSelect value={String(period || statement.period)} onChange={(v) => setPeriod(Number(v))} displayLabel={MONTHS[(period || statement.period) - 1]} ariaLabel="Period" muted>
                {Array.from({ length: maxPeriod }, (_, i) => i + 1).map((p) => (
                  <option key={p} value={p}>{MONTHS[p - 1]} — Period {p}</option>
                ))}
              </HeaderSelect>
            )}
            <HeaderSelect value={key} onChange={(v) => { setKey(v); setPeriod(0); }} displayLabel={cur ? `${cur.propertyCode} — ${cur.name}` : "—"} ariaLabel="Property">
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
                <StatPill label="Lines Unfavorable · YTD" value={variance.ytdUnf} sub={`${variance.monthUnf} in ${mon}`} accent={variance.ytdUnf > 0 ? "#b91c1c" : undefined} />
                <StatPill label="Lines Favorable · YTD" value={variance.ytdFav} sub={`${variance.monthFav} in ${mon}`} accent={variance.ytdFav > 0 ? "#15803d" : undefined} />
              </div>
              <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 6 }} className="muted small">
                <span style={{ fontWeight: 700 }}>Flag lines over</span>
                <span>$</span>
                <input type="number" min={0} value={varDollar} onChange={(e) => setVarDollar(Math.max(0, Number(e.target.value) || 0))} style={threshInput} />
                <span>or</span>
                <input type="number" min={0} value={varPctThresh} onChange={(e) => setVarPctThresh(Math.max(0, Number(e.target.value) || 0))} style={threshInput} />
                <span>%</span>
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

      {!loading && statement && <StatementTable s={statement} budgetYear={budgetYear} budgetFallback={budgetFallback} notes={notes} onSaveNote={saveNote} view={{ psf, sqft, hideEmpty, showGL }} flagged={variance?.flagged ?? {}} />}
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

function StatementTable({ s, budgetYear, budgetFallback, notes, onSaveNote, view, flagged }: {
  s: PropertyStatement; budgetYear: number | null; budgetFallback: boolean; view: ViewOpts; flagged: Record<string, "fav" | "unf">;
} & NoteFns) {
  const byRole = (roles: SectionRole[]) => s.sections.filter((x) => roles.includes(x.role));
  const revenueSecs = byRole(["revenue", "reimbursement"]);
  const expenseSecs = byRole(["reimbursable-expense", "non-reimbursable-expense", "residential-expense"]);
  const capitalSecs = byRole(["capital"]);
  const debtSecs = byRole(["debt-service"]);
  const r = s.rollups;
  const nf: NoteFns = { notes, onSaveNote };
  const monthLabel = MONTHS[s.period - 1];
  const sc = (sec: StatementSection, hideSubtotal?: boolean) => (
    <SectionCard key={sec.name} sec={sec} nf={nf} monthLabel={monthLabel} view={view} flagged={flagged} hideSubtotal={hideSubtotal} />
  );

  return (
    <>
      <div className="card">
        <div style={{ fontSize: 18, fontWeight: 800 }}>{s.propertyCode} — {s.propertyName}</div>
        <div className="muted small">{s.entityName} · Comparative Income Statement · {monthLabel} {s.year}</div>
        {budgetFallback && budgetYear != null && (
          <div style={{ marginTop: 6, fontSize: 12, color: "#b45309", fontWeight: 600 }}>
            Budget columns use the {budgetYear} budget — no {s.year} budget is loaded for this property.
          </div>
        )}
      </div>

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

      <div className="card">
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
    </>
  );
}

// Section subtotal label — mirrors the workbook ("Total Revenue and Other"
// for the revenue section; "Total <name>" otherwise).
const subtotalLabel = (sec: StatementSection) =>
  sec.role === "revenue" ? "Total Revenue and Other" : `Total ${sec.name}`;

function SectionCard({ sec, nf, monthLabel, view, flagged, hideSubtotal }: { sec: StatementSection; nf: NoteFns; monthLabel: string; view: ViewOpts; flagged: Record<string, "fav" | "unf">; hideSubtotal?: boolean }) {
  const lines = view.hideEmpty ? sec.lines.filter((l) => !isLineEmpty(l)) : sec.lines;
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
            {lines.map((l) => {
              const flag = flagged[lineKeyOf(sec.name, l.label)];
              return (
                <tr key={l.label}>
                  <td style={labelStyle}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {flag && <span title={`High variance vs budget (${flag === "unf" ? "unfavorable" : "favorable"})`} style={{ width: 8, height: 8, borderRadius: 999, flexShrink: 0, background: flag === "unf" ? "#b91c1c" : "#15803d" }} />}
                      <span>{l.label}</span>
                    </div>
                    {view.showGL && <div className="muted" style={{ fontSize: 11, fontVariantNumeric: "tabular-nums", marginTop: 1 }}>{l.mask}</div>}
                  </td>
                  {figureCells(l, { psf: view.psf, sqft: view.sqft })}
                  <NoteCell lineKey={lineKeyOf(sec.name, l.label)} {...nf} />
                </tr>
              );
            })}
            {!hideSubtotal && (
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

/** The seven figure cells (Period A/B/Var% · YTD A/B/Var% · Annual). */
function figureCells(t: StatementTotals, opts: { bold?: boolean; color?: string; noBorder?: boolean; psf?: boolean; sqft?: number } = {}) {
  const { bold, color, noBorder, psf = false, sqft = 0 } = opts;
  const base: React.CSSProperties = { ...numStyle, ...(bold ? { fontWeight: 800 } : {}), ...(color ? { color } : {}), ...(noBorder ? { borderBottom: "none" } : {}) };
  const pV = varPct(t.periodVariance, t.periodBudget);
  const yV = varPct(t.ytdVariance, t.ytdBudget);
  const amt = (v: number | null) => fmtAmt(v, psf, sqft);
  return (
    <>
      <td style={{ ...base, borderLeft: GROUP_DIV }}>{amt(t.periodActual)}</td>
      <td style={{ ...base, color: color ?? "var(--muted)" }}>{amt(t.periodBudget)}</td>
      <td style={{ ...base, color: color ?? varColor(pV) }}>{fmtPct(pV)}</td>
      <td style={{ ...base, borderLeft: GROUP_DIV }}>{amt(t.ytdActual)}</td>
      <td style={{ ...base, color: color ?? "var(--muted)" }}>{amt(t.ytdBudget)}</td>
      <td style={{ ...base, color: color ?? varColor(yV) }}>{fmtPct(yV)}</td>
      <td style={{ ...base, borderLeft: GROUP_DIV, color: color ?? "var(--muted)" }}>{amt(t.annualBudget)}</td>
    </>
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
            <li>Hit <b>Save</b> and save to a location where the file can be accessed outside of Skyline (e.g. Desktop). File name is not important.</li>
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

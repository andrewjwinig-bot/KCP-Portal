"use client";

// Operating Statements — the actuals twin of Operating Budgets. Upload a
// property's Skyline GL export; the page renders the Comparative Income
// Statement (Current Period + YTD, Actual / Budget / Variance) using the same
// section ladder as the budget. Budget columns fill in step 2 (cross-walk to
// the portal budget); for now they read blank.

import { useCallback, useEffect, useRef, useState } from "react";
import { StatPill } from "@/app/components/Pill";
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

const th: React.CSSProperties = { textAlign: "right", padding: "6px 10px", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" };
const td: React.CSSProperties = { textAlign: "right", padding: "5px 10px", fontSize: 13.5, whiteSpace: "nowrap" };
const SEP = "2px solid var(--border)";

const ROLE_COLOR: Partial<Record<SectionRole, string>> = {
  revenue: "#15803d",
  reimbursement: "#0f766e",
  "reimbursable-expense": "#854d0e",
  "non-reimbursable-expense": "#854d0e",
  "residential-expense": "#854d0e",
  capital: "#6d28d9",
  "debt-service": "#0b4a7d",
};

export default function OperatingStatementsPage() {
  const [available, setAvailable] = useState<Available[]>([]);
  const [key, setKey] = useState("");
  const [year, setYear] = useState(0);
  const [period, setPeriod] = useState(0);
  const [maxPeriod, setMaxPeriod] = useState(12);
  const [budgetYear, setBudgetYear] = useState<number | null>(null);
  const [budgetFallback, setBudgetFallback] = useState(false);
  const [statement, setStatement] = useState<PropertyStatement | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const cur = available.find((a) => a.key === key);
  const yearOptions = cur?.years.length ? cur.years : [year || new Date().getFullYear()];

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
            <HeaderSelect value={key} onChange={(v) => { setKey(v); setPeriod(0); }} displayLabel={cur ? `${cur.propertyCode} — ${cur.name}` : "—"} ariaLabel="Property">
              {available.map((a) => (
                <option key={a.key} value={a.key}>{a.propertyCode} — {a.name}{a.years.length ? "" : " (no GL)"}</option>
              ))}
            </HeaderSelect>
            {statement && (
              <HeaderSelect value={String(period || statement.period)} onChange={(v) => setPeriod(Number(v))} displayLabel={`Period ${period || statement.period}`} ariaLabel="Period" muted>
                {Array.from({ length: maxPeriod }, (_, i) => i + 1).map((p) => (
                  <option key={p} value={p}>Period {p} — {MONTHS[p - 1]}</option>
                ))}
              </HeaderSelect>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button className="btn primary" style={{ fontSize: 13, padding: "8px 14px", fontWeight: 700 }} disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? "Uploading…" : "Upload GL"}
            </button>
            <input ref={fileRef} type="file" accept=".xls,.xlsx,.xlsm" style={{ display: "none" }} onChange={onUpload} />
          </div>
        </div>

        <p className="muted small" style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
          <span>Import the <b>Detailed General Ledger</b> Excel file (.xls or .xlsx).</span>
          <ImportInstructionsButton
            year={year || new Date().getFullYear()}
            nextPeriod={statement ? Math.min(maxPeriod + 1, 12) : 1}
          />
        </p>

        {statement && (
          <div className="pills" style={{ marginTop: 12 }}>
            <StatPill label="Total Revenues (YTD)" value={money0(statement.rollups.totalRevenues.ytdActual)} />
            <StatPill label="Operating Expenses (YTD)" value={money0(statement.rollups.totalOperatingExpenses.ytdActual)} />
            <StatPill label="NOI (YTD)" value={money0(statement.rollups.netOperatingIncome.ytdActual)} accent={statement.rollups.netOperatingIncome.ytdActual >= 0 ? "#15803d" : "#b91c1c"} />
            <StatPill label="Cash Flow After Debt (YTD)" value={money0(statement.rollups.cashFlowAfterDebtService.ytdActual)} accent={statement.rollups.cashFlowAfterDebtService.ytdActual >= 0 ? "#15803d" : "#b91c1c"} />
          </div>
        )}
      </div>

      {loading && <div className="card"><div className="muted small">Loading…</div></div>}

      {!loading && !statement && (
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 4 }}>No statement yet</div>
          <div className="muted small">{message ?? "Upload this property's Skyline GL export to generate its operating statement."}</div>
        </div>
      )}

      {!loading && statement && <StatementTable s={statement} budgetYear={budgetYear} budgetFallback={budgetFallback} />}
    </main>
  );
}

// ── Statement table ──────────────────────────────────────────────────────────

function StatementTable({ s, budgetYear, budgetFallback }: { s: PropertyStatement; budgetYear: number | null; budgetFallback: boolean }) {
  const byRole = (roles: SectionRole[]) => s.sections.filter((x) => roles.includes(x.role));
  const revenueSecs = byRole(["revenue", "reimbursement"]);
  const expenseSecs = byRole(["reimbursable-expense", "non-reimbursable-expense", "residential-expense"]);
  const capitalSecs = byRole(["capital"]);
  const debtSecs = byRole(["debt-service"]);
  const r = s.rollups;

  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <div style={{ fontSize: 17, fontWeight: 800 }}>{s.propertyCode} — {s.propertyName}</div>
      <div className="muted small">{s.entityName} · Comparative Income Statement · {MONTHS[s.period - 1]} {s.year}</div>
      {budgetFallback && budgetYear != null && (
        <div style={{ marginTop: 6, fontSize: 12, color: "#b45309", fontWeight: 600 }}>
          Budget columns use the {budgetYear} budget — no {s.year} budget is loaded for this property.
        </div>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12, minWidth: 920 }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: "left" }} />
            <th style={{ ...th, textAlign: "left" }} />
            <th colSpan={3} style={{ ...th, textAlign: "center", borderLeft: SEP }}>Current Period</th>
            <th colSpan={3} style={{ ...th, textAlign: "center", borderLeft: SEP }}>Year-To-Date</th>
            <th style={{ ...th, borderLeft: SEP }}>Ann.</th>
          </tr>
          <tr>
            <th style={{ ...th, textAlign: "left" }}>Acct</th>
            <th style={{ ...th, textAlign: "left" }}>Description</th>
            <th style={{ ...th, borderLeft: SEP }}>Actual</th>
            <th style={th}>Budget</th>
            <th style={th}>Var</th>
            <th style={{ ...th, borderLeft: SEP }}>Actual</th>
            <th style={th}>Budget</th>
            <th style={th}>Var</th>
            <th style={{ ...th, borderLeft: SEP }}>Budget</th>
          </tr>
        </thead>
        <tbody>
          {revenueSecs.map((sec) => <Section key={sec.name} sec={sec} />)}
          <Rollup label="Total Revenues" t={r.totalRevenues} />
          {expenseSecs.map((sec) => <Section key={sec.name} sec={sec} />)}
          <Rollup label="Total Operating Expenses" t={r.totalOperatingExpenses} />
          <Rollup label="Net Operating Income" t={r.netOperatingIncome} strong />
          {capitalSecs.map((sec) => <Section key={sec.name} sec={sec} hideSubtotal />)}
          <Rollup label="Cash Flow Before Debt Service" t={r.cashFlowBeforeDebtService} strong />
          {debtSecs.map((sec) => <Section key={sec.name} sec={sec} />)}
          {debtSecs.length > 0 && <Rollup label="Total Debt Service" t={r.totalDebtService} />}
          <Rollup label="Cash Flow After Debt Service" t={r.cashFlowAfterDebtService} strong />
        </tbody>
      </table>

      {s.unmappedAccounts.length > 0 && (
        <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: 8, background: "rgba(180,83,9,0.06)", border: "1px solid rgba(180,83,9,0.3)" }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em", color: "#b45309" }}>
            Trial-balance tie-out — {s.unmappedAccounts.length} GL account{s.unmappedAccounts.length === 1 ? "" : "s"} not on the statement
          </div>
          <div className="muted small" style={{ marginTop: 4, lineHeight: 1.6 }}>
            These carry a YTD balance but map to no statement line (depreciation, interest, balance-sheet, deferred costs, rounding). Expected for non-operating accounts; review if an operating account appears here.
          </div>
          <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {s.unmappedAccounts.slice(0, 24).map((u) => (
              <code key={u.account} style={{ fontSize: 11, color: "#7c2d12" }}>{u.account}: {money0(u.ytdActual)}</code>
            ))}
          </div>
        </div>
      )}

      <p className="small muted" style={{ marginTop: 10 }}>
        Actual = GL Debit − Credit (revenue shown positive). Variance is favorable when positive (revenue over budget / expense under budget). Budget columns line up to the {budgetYear ?? s.year} portal budget via the same GL account masks.
      </p>
    </div>
  );
}

function figureCells(t: StatementTotals) {
  return (
    <>
      <td style={{ ...td, borderLeft: SEP }}>{money0(t.periodActual)}</td>
      <td style={{ ...td, color: "var(--muted)" }}>{money0(t.periodBudget)}</td>
      <td style={{ ...td, color: varColor(t.periodVariance) }}>{money0(t.periodVariance)}</td>
      <td style={{ ...td, borderLeft: SEP }}>{money0(t.ytdActual)}</td>
      <td style={{ ...td, color: "var(--muted)" }}>{money0(t.ytdBudget)}</td>
      <td style={{ ...td, color: varColor(t.ytdVariance) }}>{money0(t.ytdVariance)}</td>
      <td style={{ ...td, borderLeft: SEP, color: "var(--muted)" }}>{money0(t.annualBudget)}</td>
    </>
  );
}

function Section({ sec, hideSubtotal }: { sec: StatementSection; hideSubtotal?: boolean }) {
  return (
    <>
      <tr>
        <td colSpan={9} style={{ padding: "10px 10px 3px", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: ROLE_COLOR[sec.role] ?? "var(--muted)" }}>{sec.name}</td>
      </tr>
      {sec.lines.map((l) => (
        <tr key={l.label} style={{ borderBottom: "1px solid var(--border)" }}>
          <td style={{ ...td, textAlign: "left" }}><code style={{ fontSize: 11, color: "var(--muted)" }}>{l.mask}</code></td>
          <td style={{ ...td, textAlign: "left" }}>{l.label}</td>
          {figureCells(l)}
        </tr>
      ))}
      {!hideSubtotal && (
        <tr style={{ fontWeight: 700, borderBottom: "1px solid var(--border)" }}>
          <td style={td} />
          <td style={{ ...td, textAlign: "left" }}>Total {sec.name}</td>
          {figureCells(sec.subtotal)}
        </tr>
      )}
    </>
  );
}

function Rollup({ label, t, strong }: { label: string; t: StatementTotals; strong?: boolean }) {
  return (
    <tr style={{ fontWeight: 800, borderTop: strong ? SEP : "1px solid var(--border)", borderBottom: strong ? SEP : undefined, background: strong ? "var(--hover, rgba(0,0,0,0.02))" : undefined }}>
      <td style={td} />
      <td style={{ ...td, textAlign: "left" }}>{label}</td>
      {figureCells(t)}
    </tr>
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

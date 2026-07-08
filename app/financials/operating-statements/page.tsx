"use client";

// Operating Statements — the actuals twin of Operating Budgets. Upload a
// property's Skyline GL export; the page renders the Comparative Income
// Statement (Current Period + YTD, Actual / Budget / Variance) using the same
// section ladder as the budget. Budget columns fill in step 2 (cross-walk to
// the portal budget); for now they read blank.

import { useCallback, useEffect, useRef, useState } from "react";
import { useUser } from "@/app/components/UserProvider";
import { DownloadMenu } from "@/app/components/DownloadMenu";
import { StatPill } from "@/app/components/Pill";
import { LastImported } from "@/app/components/LastImported";
import { AccountListCard } from "@/app/components/AccountListCard";
import { groupStatementOptions } from "@/lib/financials/operating-statements/propertyGroups";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import type {
  PropertyStatement,
  StatementSection,
  StatementTotals,
  SectionRole,
} from "@/lib/financials/operating-statements/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

type Available = { key: string; propertyCode: string; entityName: string; name: string; years: number[]; latest?: { year: number; period: number } | null };

/** Compact "most recent period imported" suffix for the property dropdown,
 *  e.g. " (01-26)" for January 2026, or " (no GL)" when nothing is uploaded. */
function importedSuffix(a: Available): string {
  if (!a.latest) return " (no GL)";
  return ` (${String(a.latest.period).padStart(2, "0")}-${String(a.latest.year).slice(2)})`;
}

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
// Compact signed dollar for KPI pills: $5.2K, -$1.3M, $850.
function fmtVarK(v: number | null): string {
  if (v == null) return "—";
  const sign = v < 0 ? "-" : "";
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${sign}$${(a / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) return `${sign}$${(a / 1_000).toFixed(1)}K`;
  return `${sign}$${Math.round(a)}`;
}
// "$5.2K (+3.4%)" — dollar variance with the % in parens (either alone if the
// other is missing).
function fmtVarValue(v: number | null, pct: number | null): string {
  if (v == null) return fmtPct(pct);
  if (pct == null) return fmtVarK(v);
  return `${fmtVarK(v)} (${fmtPct(pct)})`;
}
// Same as fmtVarValue, but renders the trailing (percent) at normal weight so
// the dollar variance stays bold and the % reads as a lighter qualifier.
function fmtVarValueNode(v: number | null, pct: number | null): React.ReactNode {
  if (v == null) return fmtPct(pct);
  if (pct == null) return fmtVarK(v);
  return <>{fmtVarK(v)} <span style={{ fontWeight: 400 }}>({fmtPct(pct)})</span></>;
}
// Variance % carries the favorability sign (positive = favorable). Blank when
// there's no budget to compare against.
function varPct(variance: number | null, budget: number | null): number | null {
  if (variance == null || budget == null || Math.abs(budget) < 0.5) return null;
  return (variance / Math.abs(budget)) * 100;
}

type VarMode = "pct" | "dollar";
type ViewOpts = { psf: boolean; sqft: number; hideEmpty: boolean; showGL: boolean; varMode: VarMode };

// Dollar amount in the active view — total $ or $/SF.
function fmtAmt(v: number | null, psf: boolean, sqft: number): string {
  if (v == null) return "—";
  if (psf && sqft > 0) {
    const x = v / sqft;
    return `${x < 0 ? "-" : ""}$${Math.abs(x).toFixed(2)}`;
  }
  return money0(v);
}

// Signed dollar variance for the Var column ($-mode), respecting the $/SF view.
// Favorable (positive) carries a leading "+", matching the "+%" convention.
function fmtVarAmt(v: number | null, psf: boolean, sqft: number): string {
  if (v == null) return "—";
  if (Math.abs(v) < 0.5) return psf && sqft > 0 ? "$0.00" : "$0";
  if (psf && sqft > 0) {
    const x = v / sqft;
    return `${x < 0 ? "-" : "+"}$${Math.abs(x).toFixed(2)}`;
  }
  return `${v < 0 ? "-" : "+"}$${Math.abs(Math.round(v)).toLocaleString("en-US")}`;
}

const isZero = (v: number | null) => v == null || Math.abs(v) < 0.5;
// "Empty" for the Hide-empty toggle = no YTD activity on either side. A line
// can carry a future annual budget (e.g. Parking Lot Maintenance budgeted later
// in the year) and still be hidden until something hits YTD actual or YTD budget.
function isLineEmpty(t: StatementTotals): boolean {
  return isZero(t.ytdActual) && isZero(t.ytdBudget);
}

const threshInput: React.CSSProperties = {
  width: 64, fontSize: 12, fontWeight: 700, padding: "3px 6px", textAlign: "right",
  border: "1px solid var(--border)", borderRadius: 6, background: "var(--card)", color: "var(--text)",
};

type Thresh = { dollar: number; pct: number; min: number };

// Is a single variance "high" — beyond EITHER the dollar or the percent
// threshold — and if so, favorable or unfavorable? A minimum-dollar floor keeps
// trivially small variances (e.g. $6 vs $3 = 100%) from flagging.
function cellFlag(variance: number | null, budget: number | null, th: Thresh): "fav" | "unf" | null {
  if (variance == null || budget == null) return null;
  if (Math.abs(variance) < (th.min ?? 0)) return null;
  const vp = varPct(variance, budget);
  const hot = Math.abs(variance) > th.dollar || (vp != null && Math.abs(vp) > th.pct);
  if (!hot) return null;
  return variance >= 0 ? "fav" : "unf";
}

const flagTint = (f: "fav" | "unf" | null) =>
  f === "unf" ? "rgba(185,28,28,0.13)" : f === "fav" ? "rgba(21,128,61,0.13)" : undefined;

// Does a line have a high-variance cell of the given class for the current
// month? (Matches the month-based favorable/unfavorable pills.)
function lineMatchesClass(l: StatementTotals, cls: "fav" | "unf", th: Thresh): boolean {
  return cellFlag(l.periodVariance, l.periodBudget, th) === cls;
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

// A single segmented two-button control. Rendered as a labeled row (label left,
// buttons right) so a stack of them reads like a settings menu.
function ToggleRow({ label, left, right, active, onLeft, onRight, disabled }: {
  label: string; left: string; right: string; active: "left" | "right";
  onLeft: () => void; onRight: () => void; disabled?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, width: "100%" }}>
      <span className="muted small" style={toggleLabel}>{label}</span>
      <div style={{ display: "inline-flex", borderRadius: 6, overflow: "hidden", opacity: disabled ? 0.5 : 1 }}>
        <button type="button" disabled={disabled} onClick={() => !disabled && onLeft()} style={{ ...toggleBtn, cursor: disabled ? "not-allowed" : "pointer", borderRadius: "6px 0 0 6px", ...(active === "left" ? toggleActive : {}) }}>{left}</button>
        <button type="button" disabled={disabled} onClick={() => !disabled && onRight()} style={{ ...toggleBtn, cursor: disabled ? "not-allowed" : "pointer", borderLeft: "none", borderRadius: "0 6px 6px 0", ...(active === "right" ? toggleActive : {}) }}>{right}</button>
      </div>
    </div>
  );
}

// Consolidated "View ▾" popover — the four display toggles (Amounts, Variance,
// Empty rows, GL) in one menu instead of cluttering the toolbar. Closes on
// outside click or Escape, mirroring the Download menu.
function ViewMenu({ psf, setPsf, psfDisabled, varMode, setVarMode, hideEmpty, setHideEmpty, showGL, setShowGL }: {
  psf: boolean; setPsf: (v: boolean) => void; psfDisabled: boolean;
  varMode: VarMode; setVarMode: (v: VarMode) => void;
  hideEmpty: boolean; setHideEmpty: (v: boolean) => void;
  showGL: boolean; setShowGL: (v: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDocClick); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="btn"
        style={{ fontSize: 13, padding: "8px 14px", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6 }}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        Display
        <span aria-hidden style={{ fontSize: 10, opacity: 0.75, lineHeight: 1 }}>▾</span>
      </button>
      {open && (
        <div role="menu" style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 40, minWidth: 250,
          background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10,
          boxShadow: "0 8px 24px rgba(15,23,42,0.18)", padding: 14, display: "flex", flexDirection: "column", gap: 12,
        }}>
          <ToggleRow label="Amounts" left="Total" right="$/SF" active={psf ? "right" : "left"} onLeft={() => setPsf(false)} onRight={() => setPsf(true)} disabled={psfDisabled} />
          <ToggleRow label="Variance" left="%" right="$" active={varMode === "dollar" ? "right" : "left"} onLeft={() => setVarMode("pct")} onRight={() => setVarMode("dollar")} />
          <ToggleRow label="Empty rows" left="Hide" right="Show" active={hideEmpty ? "left" : "right"} onLeft={() => setHideEmpty(true)} onRight={() => setHideEmpty(false)} />
          <ToggleRow label="GL accounts" left="Hide" right="Show" active={showGL ? "right" : "left"} onLeft={() => setShowGL(false)} onRight={() => setShowGL(true)} />
        </div>
      )}
    </div>
  );
}

export default function OperatingStatementsPage() {
  const { user } = useUser();
  const [available, setAvailable] = useState<Available[]>([]);
  const [key, setKey] = useState("");
  const [year, setYear] = useState(0);
  const [period, setPeriod] = useState(0);
  const [maxPeriod, setMaxPeriod] = useState(12);
  const [budgetYear, setBudgetYear] = useState<number | null>(null);
  const [budgetFallback, setBudgetFallback] = useState(false);
  const [statement, setStatement] = useState<PropertyStatement | null>(null);
  const [lastImport, setLastImport] = useState<{ at: string; by: string | null } | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [operatingCash, setOperatingCash] = useState<number | null>(null);
  const [noteSources, setNoteSources] = useState<Record<string, "user" | "ai">>({});
  const [noteMeta, setNoteMeta] = useState<Record<string, { editedAt: string; editedBy: string }>>({});
  const [dismissedFlags, setDismissedFlags] = useState<Set<string>>(new Set()); // "?" flags dismissed this session
  const [debtCheck, setDebtCheck] = useState<{ scheduled: number; posted: number; missing: boolean } | null>(null);
  const [allocatedGA, setAllocatedGA] = useState<{ pct: number; periodShare: number; ytdShare: number; poolPeriod: number; poolYtd: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped after an upload to force a statement reload even when the
  // property/year/period are unchanged (e.g. re-importing the current view).
  const [reloadNonce, setReloadNonce] = useState(0);
  type UploadResult = { name: string; ok: boolean; key?: string; year?: number; month?: number; accounts?: number; error?: string; allocatedGlReady?: boolean; tasksCompleted?: string[] };
  const [uploadResults, setUploadResults] = useState<UploadResult[] | null>(null);
  // Background auto-explain progress after an import (audits the new GLs).
  const [autoExplain, setAutoExplain] = useState<{ done: number; total: number } | null>(null);
  // View toggles (mirroring the Operating Budgets page).
  const [psf, setPsf] = useState(false);
  const [hideEmpty, setHideEmpty] = useState(true);
  const [showGL, setShowGL] = useState(false);
  const [varMode, setVarMode] = useState<VarMode>("pct");
  // Variance thresholds — a line is "high variance" if it exceeds either.
  const [varDollar, setVarDollar] = useState(5000);
  const [varPctThresh, setVarPctThresh] = useState(10);
  const [varFloor, setVarFloor] = useState(500); // ignore variances smaller than this
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
        // Deep link from the Reprojections/Budgets pages: ?key (or ?property) & year.
        const params = new URLSearchParams(window.location.search);
        const wantKey = params.get("key");
        const wantProp = params.get("property");
        const wantYear = params.get("year");
        const wantPeriod = params.get("period");
        const match = wantKey ? list.find((a) => a.key === wantKey) : wantProp ? list.find((a) => a.propertyCode === wantProp) : null;
        if (match) {
          setKey(match.key);
          setYear(wantYear ? Number(wantYear) : match.years[0] ?? new Date().getFullYear());
          if (wantPeriod) { const p = Number(wantPeriod); if (p >= 1 && p <= 12) setPeriod(p); }
          return;
        }
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
      setLastImport(j.uploadedAt ? { at: j.uploadedAt, by: j.uploadedBy ?? null } : null);
      setDebtCheck(j.debtCheck ?? null);
      setAllocatedGA(j.allocatedGA ?? null);
      setNotes(j.notes ?? {});
      setDismissedFlags(new Set()); // server already filtered dismissed flags
      setOperatingCash(j.operatingCash ?? null);
      setNoteSources(j.noteSources ?? {});
      setNoteMeta(j.noteMeta ?? {});
      setMessage(j.message ?? null);
      setBudgetYear(j.budgetYear ?? null);
      setBudgetFallback(!!j.budgetFallback);
      if (j.maxPeriodInFile) setMaxPeriod(j.maxPeriodInFile);
      if (j.statement && !period) setPeriod(j.statement.period);
    } finally {
      setLoading(false);
    }
  }, [key, year, period, reloadNonce]);

  useEffect(() => { load(); }, [load]);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    setError(null);
    setUploadResults(null);
    const results: UploadResult[] = [];
    let last: { key: string; year: number } | null = null;
    // Each GL's header identifies its own property; for a single file we still
    // pass the selected key as a fallback (e.g. a header missing the code).
    for (const file of files) {
      try {
        const fd = new FormData();
        fd.append("file", file);
        if (files.length === 1 && key) fd.append("key", key);
        fd.append("uploadedBy", user.label);
        const j = await fetch("/api/financials/operating-statements", { method: "POST", body: fd }).then((r) => r.json());
        if (j.error) { results.push({ name: file.name, ok: false, error: j.error }); }
        else {
          last = { key: j.key, year: j.year };
          results.push({ name: file.name, ok: true, key: j.key, year: j.year, month: j.maxPeriodInFile, accounts: j.accounts, allocatedGlReady: j.allocatedGlReady, tasksCompleted: j.tasksCompleted });
        }
      } catch {
        results.push({ name: file.name, ok: false, error: "Upload failed" });
      }
    }
    try {
      const av = await fetch("/api/financials/operating-statements").then((r) => r.json());
      setAvailable(av.available ?? []);
    } catch { /* ignore refresh errors */ }
    if (last) { setKey(last.key); setYear(last.year); setPeriod(0); }
    // Force the statement to reload so the new GL shows without a manual
    // refresh — even when re-importing the property/year already on screen.
    setReloadNonce((n) => n + 1);
    setUploadResults(results);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";

    // Auto-audit the newly-imported GL(s): run Auto-explain for each uploaded
    // property's month in the background, so the Flags to Investigate report is
    // annotated without opening each property by hand.
    const toExplain = results.filter((r) => r.ok && r.key && r.year && r.month).map((r) => ({ key: r.key!, year: r.year!, period: r.month! }));
    if (toExplain.length) {
      setAutoExplain({ done: 0, total: toExplain.length });
      (async () => {
        for (let i = 0; i < toExplain.length; i++) {
          try {
            await fetch("/api/financials/operating-statements/analyze", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify(toExplain[i]),
            });
          } catch { /* skip; keep going */ }
          setAutoExplain({ done: i + 1, total: toExplain.length });
        }
        setAutoExplain((s) => (s ? { ...s, done: s.total } : s));
        setReloadNonce((n) => n + 1); // reload current statement so new notes show
        setTimeout(() => setAutoExplain(null), 8000);
      })();
    }
  }

  // Auto-dismiss the upload result banner after a few seconds.
  useEffect(() => {
    if (!uploadResults) return;
    const t = setTimeout(() => setUploadResults(null), 12000);
    return () => clearTimeout(t);
  }, [uploadResults]);

  const saveNote = useCallback(async (lineKey: string, note: string) => {
    setNotes((n) => ({ ...n, [lineKey]: note }));
    // A hand-edited note is now the user's — drop any AI flag on it.
    setNoteSources((s) => ({ ...s, [lineKey]: "user" }));
    setNoteMeta((m) => ({ ...m, [lineKey]: { editedAt: new Date().toISOString(), editedBy: user.label } }));
    await fetch("/api/financials/operating-statements", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, year, period: period || statement?.period, lineKey, note, editedBy: user.label }),
      keepalive: true, // survive a page refresh/navigation mid-save
    }).catch(() => {});
  }, [key, year, period, statement?.period, user.label]);

  const onDismissFlag = useCallback((lineKey: string) => {
    setDismissedFlags((s) => new Set(s).add(lineKey)); // hide immediately
    fetch("/api/financials/operating-statements/dismiss-flag", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, year, period: period || statement?.period, lineKey, dismissed: true }),
      keepalive: true,
    })
      .then((res) => { if (!res.ok) throw new Error("save failed"); })
      .catch(() => {
        // Persisting the dismissal failed — restore the "?" so the UI reflects
        // what's actually saved (otherwise it looks dismissed until a refresh
        // brings it back, which reads as the state "resetting").
        setDismissedFlags((s) => { const n = new Set(s); n.delete(lineKey); return n; });
      });
  }, [key, year, period, statement?.period]);

  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeMsg, setAnalyzeMsg] = useState<string | null>(null);
  const analyzeFlagged = useCallback(async () => {
    setAnalyzing(true);
    setAnalyzeMsg(null);
    try {
      const j = await fetch("/api/financials/operating-statements/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, year, period, dollar: varDollar, pct: varPctThresh, min: varFloor }),
      }).then((r) => r.json());
      if (j.error) { setAnalyzeMsg(j.error); return; }
      if (j.notes) {
        setNotes((n) => ({ ...n, ...j.notes }));
        const aiKeys = Object.keys(j.notes as Record<string, string>);
        setNoteSources((s) => { const next = { ...s }; for (const k of aiKeys) next[k] = "ai"; return next; });
        const now = new Date().toISOString();
        setNoteMeta((m) => { const next = { ...m }; for (const k of aiKeys) next[k] = { editedAt: now, editedBy: "Auto-explain" }; return next; });
      }
      setAnalyzeMsg(j.analyzed ? `Explained ${Object.keys(j.notes ?? {}).length} of ${j.analyzed} flagged lines.` : (j.message ?? "Nothing to analyze."));
    } catch {
      setAnalyzeMsg("Analysis failed.");
    } finally {
      setAnalyzing(false);
    }
  }, [key, year, period, varDollar, varPctThresh, varFloor]);

  // Monthly brief — a short AI narrative of how the property is tracking.
  const [brief, setBrief] = useState<string | null>(null);
  const [briefing, setBriefing] = useState(false);
  const briefPeriod = period || statement?.period || 0;
  useEffect(() => {
    setBrief(null);
    if (!key || !year || !briefPeriod) return;
    let alive = true;
    fetch(`/api/financials/operating-statements/brief?key=${encodeURIComponent(key)}&year=${year}&period=${briefPeriod}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) setBrief(j?.brief ?? null); })
      .catch(() => {});
    return () => { alive = false; };
  }, [key, year, briefPeriod]);
  const generateBrief = useCallback(async () => {
    setBriefing(true);
    try {
      const j = await fetch("/api/financials/operating-statements/brief", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, year, period: briefPeriod }),
      }).then((r) => r.json());
      if (j.brief) setBrief(j.brief);
      else if (j.error) alert(j.error);
    } catch { alert("Couldn't generate the brief."); }
    finally { setBriefing(false); }
  }, [key, year, briefPeriod]);

  const cur = available.find((a) => a.key === key);
  const yearOptions = cur?.years.length ? cur.years : [year || new Date().getFullYear()];
  const sqft = PROPERTY_DEFS.find((p) => p.id === key)?.sqft ?? 0;

  // Prior-month posting reminder: a property's GL should be posted through the
  // prior calendar month. If this property's newest GL is behind that, nudge to
  // post + upload it, so an un-posted month is visible right on the page.
  const nowP = new Date();
  const expectedPost = nowP.getMonth() === 0
    ? { year: nowP.getFullYear() - 1, period: 12 }             // January → prior Dec
    : { year: nowP.getFullYear(), period: nowP.getMonth() };   // else prior month (getMonth() is already 1-behind, 1-indexed)
  const latestPost = cur?.latest ?? null;
  const behindPosting = !!cur && (
    !latestPost ||
    latestPost.year < expectedPost.year ||
    (latestPost.year === expectedPost.year && latestPost.period < expectedPost.period)
  );

  // When viewing the 2000 G&A statement, surface whether its allocated
  // invoices still need to be generated/processed — the same GL feeds both, so
  // the statement nudges you over to run the allocation.
  const isGandA = cur?.propertyCode === "2000";
  const [pendingAlloc, setPendingAlloc] = useState<{ statementMonth: string; alreadyProcessed: boolean; uploadedAt: string } | null>(null);
  useEffect(() => {
    if (!isGandA) { setPendingAlloc(null); return; }
    let alive = true;
    fetch("/api/allocation/pending-gl")
      .then((r) => r.json())
      .then((j) => { if (alive) setPendingAlloc(j.pending ?? null); })
      .catch(() => {});
    return () => { alive = false; };
  }, [isGandA]);

  const thresh: Thresh = { dollar: varDollar, pct: varPctThresh, min: varFloor };
  const variance = statement ? varianceCounts(statement, thresh) : null;

  return (
    <main style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Operating Statements</h1>
        </div>
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

      {uploadResults && (() => {
        const okCount = uploadResults.filter((r) => r.ok).length;
        const allOk = okCount === uploadResults.length;
        const accent = allOk ? "#15803d" : okCount > 0 ? "#b45309" : "#b91c1c";
        return (
          <div className="card" style={{ borderColor: `${accent}66`, background: `${accent}0d` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ fontWeight: 800, color: accent }}>
                {uploadResults.length === 1
                  ? (allOk ? "Upload complete" : "Upload failed")
                  : `Uploaded ${okCount} of ${uploadResults.length} files`}
              </div>
              <button onClick={() => setUploadResults(null)} aria-label="Dismiss" style={{ background: "none", border: "none", cursor: "pointer", color: accent, fontSize: 18, lineHeight: 1, fontWeight: 700, padding: "0 4px" }}>×</button>
            </div>
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
              {uploadResults.map((r, i) => {
                const up = r.ok ? available.find((a) => a.key === r.key) : null;
                const label = up ? `${up.propertyCode} — ${up.name}` : r.key ?? "";
                const through = r.month ? ` through ${MONTHS[r.month - 1]}` : "";
                return (
                  <div key={i} className="small" style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                    <span style={{ color: r.ok ? "#15803d" : "#b91c1c", fontWeight: 800 }}>{r.ok ? "✓" : "✗"}</span>
                    <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--muted)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>{r.name}</span>
                    <span>{r.ok ? `${label} · ${r.year}${through} · ${r.accounts} accounts` : r.error}</span>
                  </div>
                );
              })}
            </div>
            {uploadResults.some((r) => r.allocatedGlReady) && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${accent}33`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700, color: "#15803d" }}>✅ 2000 G&amp;A GL — the Allocated Expense Invoicer is ready to generate its invoices from this file.</span>
                <a href="/allocated-invoicer" className="btn primary" style={{ fontSize: 12, padding: "6px 12px", fontWeight: 700, textDecoration: "none" }}>Go to Allocated Invoicer →</a>
              </div>
            )}
            {(() => {
              const TASK_LABELS: Record<string, string> = { "m-post": "Post PM and AP", "m-close": "Close Prior Month", "m-opstmt": "Operating Statements" };
              const done = Array.from(new Set(uploadResults.flatMap((r) => r.tasksCompleted ?? [])));
              return done.length ? (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${accent}33`, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700, color: "#15803d" }}>✓ Checked off for this month:</span>
                  <span className="muted small">{done.map((id) => TASK_LABELS[id] ?? id).join(" · ")}</span>
                  <a href="/tracker" className="btn" style={{ fontSize: 12, padding: "5px 11px", fontWeight: 700, textDecoration: "none" }}>Tracker →</a>
                </div>
              ) : null;
            })()}
            {allOk && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${accent}22`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span className="muted small" style={{ fontWeight: 600 }}>↔ This GL also feeds <b>Cash Analysis</b> and <b>Operating Expense History</b> — no re-import needed.</span>
                <a href="/financials/cash-analysis" className="btn" style={{ fontSize: 12, padding: "5px 11px", fontWeight: 700, textDecoration: "none" }}>Cash Analysis →</a>
              </div>
            )}
          </div>
        );
      })()}

      {autoExplain && (
        <div className="card" style={{ borderColor: "rgba(109,40,217,0.4)", background: "rgba(109,40,217,0.06)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 18 }}>✨</span>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontWeight: 800, color: "#6d28d9" }}>
              {autoExplain.done < autoExplain.total ? `Auto-explaining flagged lines… ${autoExplain.done}/${autoExplain.total}` : "✓ Flagged lines explained"}
            </div>
            <div className="muted small" style={{ marginTop: 2 }}>Auditing the imported GL{autoExplain.total === 1 ? "" : "s"} so the Flags to Investigate report is ready.</div>
          </div>
          <a href="/financials/operating-statements/review" className="btn primary" style={{ fontSize: 12, padding: "6px 12px", fontWeight: 700, textDecoration: "none", flexShrink: 0 }}>Flags to Investigate →</a>
        </div>
      )}

      {behindPosting && (
        <div className="card" style={{ borderColor: "rgba(180,83,9,0.45)", background: "rgba(217,119,6,0.08)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 20 }}>⏰</span>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontWeight: 800, color: "#b45309" }}>
                Time to post {MONTHS[expectedPost.period - 1]} {expectedPost.year}
              </div>
              <div className="muted small" style={{ marginTop: 2 }}>
                <b>{cur?.propertyCode} — {cur?.name}</b>{" "}
                {latestPost
                  ? <>is posted through <b>{MONTHS[latestPost.period - 1]} {latestPost.year}</b>. </>
                  : <>has <b>no GL imported yet</b>. </>}
                Run <b>Post PM and AP</b> then <b>Close Prior Month</b> in Skyline, then upload the GL here.
              </div>
            </div>
            <button className="btn primary" style={{ fontSize: 13, padding: "8px 14px", fontWeight: 700, flexShrink: 0 }} disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? "Uploading…" : "Upload GL"}
            </button>
          </div>
        </div>
      )}

      {isGandA && pendingAlloc && !pendingAlloc.alreadyProcessed && (
        <div className="card" style={{ borderColor: "rgba(22,163,74,0.5)", background: "rgba(22,163,74,0.07)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 20 }}>🧾</span>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontWeight: 800, color: "#15803d" }}>
                Allocated invoices for {pendingAlloc.statementMonth} are ready to process
              </div>
              <div className="muted small" style={{ marginTop: 2 }}>
                This is the same 2000 G&amp;A GL the Allocated Expense Invoicer runs on. Generate the property invoices there, then send.
              </div>
            </div>
            <a href="/allocated-invoicer" className="btn primary" style={{ fontSize: 13, padding: "8px 14px", fontWeight: 700, textDecoration: "none", flexShrink: 0 }}>
              Go to Allocated Invoicer →
            </a>
          </div>
        </div>
      )}

      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", minWidth: 0 }}>
            {/* Property + Year are always rendered and kept first so the
                conditional Period select (below) never reflows them. */}
            <HeaderSelect value={key} onChange={(v) => { setKey(v); setPeriod(0); setFlagFilter(null); }} displayLabel={cur ? `${cur.propertyCode} — ${cur.name}` : "—"} ariaLabel="Property">
              {groupStatementOptions(available).map((grp) => (
                <optgroup key={grp.label} label={grp.label}>
                  {grp.items.map((a) => (
                    <option key={a.key} value={a.key}>{a.propertyCode} — {a.name}{importedSuffix(a)}</option>
                  ))}
                </optgroup>
              ))}
            </HeaderSelect>
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
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button className="btn primary" title="Upload one or more GL files — each file's header identifies its property" style={{ fontSize: 13, padding: "8px 14px", fontWeight: 700 }} disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? "Uploading…" : "Upload GL"}
            </button>
            <input ref={fileRef} type="file" accept=".xls,.xlsx,.xlsm" multiple style={{ display: "none" }} onChange={onUpload} />
            {statement && (
              <ViewMenu
                psf={psf} setPsf={setPsf} psfDisabled={sqft <= 0}
                varMode={varMode} setVarMode={setVarMode}
                hideEmpty={hideEmpty} setHideEmpty={setHideEmpty}
                showGL={showGL} setShowGL={setShowGL}
              />
            )}
            {cur && statement && (
              <DownloadMenu
                disabled={!statement}
                items={[
                  { label: "Excel (.xlsx)", description: "Full Period + YTD statement with budget & variance", href: `/api/financials/operating-statements/download?key=${encodeURIComponent(key)}&year=${year}${period ? `&period=${period}` : ""}` },
                  { label: "PDF", description: "Presentation-ready single-property statement", href: `/api/financials/operating-statements/download/pdf?key=${encodeURIComponent(key)}&year=${year}${period ? `&period=${period}` : ""}` },
                ]}
              />
            )}
            {cur && (
              <DownloadMenu
                label="Open"
                variant="default"
                items={[
                  { label: "Reprojection", description: `${cur.propertyCode}'s full-year reprojection`, href: `/financials/reprojections?key=${encodeURIComponent(key)}${year ? `&year=${year}` : ""}` },
                  { label: "Budget", description: `${cur.propertyCode}'s operating budget`, href: `/financials/budgets?property=${encodeURIComponent(cur.propertyCode)}${year ? `&year=${year}` : ""}` },
                ]}
              />
            )}
          </div>
        </div>

        <div style={{ marginTop: 8 }}>
          <p className="muted small" style={{ margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
            <span>Import <b>Detailed General Ledger</b> Excel file (.xls or .xlsx). Able to select multiple at once.</span>
            <ImportInstructionsButton
              year={year || new Date().getFullYear()}
              nextPeriod={statement ? Math.min(maxPeriod + 1, 12) : 1}
            />
          </p>
          {cur && <LastImported at={lastImport?.at} by={lastImport?.by} label={`${cur.name} GL last imported`} />}
        </div>

        {statement && variance && (() => {
          const noi = statement.rollups.netOperatingIncome;
          const mPct = varPct(noi.periodVariance, noi.periodBudget);
          const yPct = varPct(noi.ytdVariance, noi.ytdBudget);
          const mon = MONTHS[statement.period - 1];
          const pctAccent = (v: number | null) => (v == null ? undefined : v >= 0 ? "#15803d" : "#b91c1c");
          return (
            <>
              <div className="pills" style={{ marginTop: 12 }}>
                {operatingCash != null && <StatPill label={`Starting Cash · ${mon} (Per GL)`} value={`$${money0(operatingCash)}`} accent="#0b4a7d" />}
                <StatPill label={`Net Operating Income · ${mon} vs Budget`} value={fmtVarValueNode(noi.periodVariance, mPct)} accent={pctAccent(mPct)} />
                <StatPill label="Net Operating Income · YTD vs Budget" value={fmtVarValueNode(noi.ytdVariance, yPct)} accent={pctAccent(yPct)} />
                <ClickablePill active={flagFilter === "unf"} activeColor="#b91c1c" onClick={() => setFlagFilter((f) => (f === "unf" ? null : "unf"))} title={`Click to show only unfavorable lines in ${mon}`}>
                  <StatPill label={`Lines Unfavorable · ${mon}`} value={variance.monthUnf} accent={variance.monthUnf > 0 ? "#b91c1c" : undefined} />
                </ClickablePill>
                <ClickablePill active={flagFilter === "fav"} activeColor="#15803d" onClick={() => setFlagFilter((f) => (f === "fav" ? null : "fav"))} title={`Click to show only favorable lines in ${mon}`}>
                  <StatPill label={`Lines Favorable · ${mon}`} value={variance.monthFav} accent={variance.monthFav > 0 ? "#15803d" : undefined} />
                </ClickablePill>
              </div>
              <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" className="btn ai" disabled={analyzing} onClick={analyzeFlagged}
                    title="Use AI to explain each flagged line and auto-fill its note (from budget detail + GL transactions)"
                    style={{ fontSize: 12, padding: "5px 12px", fontWeight: 700 }}>
                    {analyzing ? "Analyzing…" : "✨ Auto-explain flagged lines"}
                  </button>
                  <button type="button" className="btn ai" disabled={briefing} onClick={generateBrief}
                    title="Generate a short AI monthly brief — how this property is tracking vs budget, the drivers, and what to watch"
                    style={{ fontSize: 12, padding: "5px 12px", fontWeight: 700 }}>
                    {briefing ? "Writing…" : brief ? "✨ Regenerate brief" : "✨ Monthly brief"}
                  </button>
                  {analyzeMsg && <span className="muted small">{analyzeMsg}</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }} className="muted small">
                  <span style={{ fontWeight: 700 }}>Flag Lines Over</span>
                  <span>$</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={varDollar.toLocaleString("en-US")}
                    onChange={(e) => setVarDollar(Math.max(0, Number(e.target.value.replace(/[^\d]/g, "")) || 0))}
                    style={threshInput}
                  />
                  <span>or</span>
                  <input type="number" min={0} value={varPctThresh} onChange={(e) => setVarPctThresh(Math.max(0, Number(e.target.value) || 0))} style={threshInput} />
                  <span>%</span>
                  <span style={{ marginLeft: 6, fontWeight: 700 }}>· min $</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    title="Ignore variances smaller than this, even if the percentage is large"
                    value={varFloor.toLocaleString("en-US")}
                    onChange={(e) => setVarFloor(Math.max(0, Number(e.target.value.replace(/[^\d]/g, "")) || 0))}
                    style={threshInput}
                  />
                </div>
              </div>
            </>
          );
        })()}
      </div>

      {!loading && statement && brief && (
        <div className="card" style={{ borderColor: "rgba(109,40,217,0.35)", background: "rgba(109,40,217,0.05)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "#6d28d9", display: "flex", alignItems: "center", gap: 6 }}>
              ✨ Monthly Brief · {cur?.name} · {MONTHS[(briefPeriod || 1) - 1]} {year}
            </div>
            <span className="muted small" style={{ fontStyle: "italic" }}>AI-generated · review before relying on it</span>
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{brief}</div>
        </div>
      )}

      {loading && <div className="card"><div className="muted small">Loading…</div></div>}

      {!loading && !statement && (
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 4 }}>No statement yet</div>
          <div className="muted small">{message ?? "Upload this property's Skyline GL export to generate its operating statement."}</div>
        </div>
      )}

      {!loading && statement && debtCheck?.missing && (
        <div style={{ margin: "0 0 12px", padding: "10px 14px", borderRadius: 10, background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.35)", color: "#b91c1c", fontSize: 13, fontWeight: 600 }}>
          ⚠ This property has a loan (scheduled P&amp;I ${money0(debtCheck.scheduled)}/mo) but <b>$0 debt service posted</b> this month — the mortgage charge may be missing. Re-post the charge or re-upload the GL.
        </div>
      )}
      {!loading && statement && allocatedGA && (() => {
        const mon = MONTHS[statement.period - 1];
        return (
          <div className="card" style={{ borderColor: "rgba(180,83,9,0.4)", background: "rgba(217,119,6,0.06)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "#b45309" }}>
                G&amp;A / Admin Allocation · Non-Reimbursable
              </div>
              <span className="muted small" style={{ fontWeight: 700 }}>Memo — not in totals</span>
            </div>
            <div className="pills" style={{ marginTop: 10 }}>
              <StatPill label={`Allocated Share · ${mon}`} value={`$${money0(allocatedGA.periodShare)}`} accent="#b45309" />
              <StatPill label="Allocated Share · YTD" value={`$${money0(allocatedGA.ytdShare)}`} accent="#b45309" />
              <StatPill label="Your Basis (9303)" value={`${(allocatedGA.pct * 100).toFixed(2)}%`} />
              <StatPill label={`2000 G&A Pool · ${mon}`} value={`$${money0(allocatedGA.poolPeriod)}`} />
            </div>
            <p className="small muted" style={{ marginTop: 10, marginBottom: 0 }}>
              This property&rsquo;s share of the <b>2000 G&amp;A pool</b> ({(allocatedGA.pct * 100).toFixed(2)}% of ${money0(allocatedGA.poolPeriod)} for {mon}).
              It&rsquo;s a <b>pending memo</b> — it posts to this property&rsquo;s own GL, and folds into the totals above, only once the <a href="/allocated-invoicer" style={{ color: "#0b4a7d", fontWeight: 600 }}>allocated invoice</a> is processed. Shown here so the coming overhead is visible.
            </p>
          </div>
        );
      })()}
      {!loading && statement && <StatementTable s={statement} viewKey={key} budgetYear={budgetYear} budgetFallback={budgetFallback} notes={notes} noteSources={noteSources} noteMeta={noteMeta} editorLabel={user.label} onSaveNote={saveNote} dismissedFlags={dismissedFlags} onDismissFlag={onDismissFlag} view={{ psf, sqft, hideEmpty, showGL, varMode }} thresh={thresh} flagFilter={flagFilter} onClearFilter={() => setFlagFilter(null)} />}
    </main>
  );
}

// ── Statement (one card per section, like the Budgets page) ──────────────────

type NoteFns = { notes: Record<string, string>; noteSources: Record<string, "user" | "ai">; noteMeta: Record<string, { editedAt: string; editedBy: string }>; editorLabel: string; onSaveNote: (lineKey: string, note: string) => void; dismissedFlags: Set<string>; onDismissFlag: (lineKey: string) => void };

// "Jun 1, 2026 at 10:19 AM" — matches the rent roll's last-imported stamp.
function fmtNoteEdited(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  return `${date} at ${time}`;
}
const lineKeyOf = (sectionName: string, label: string) => `${sectionName}::${label}`;

// Shared fixed-width columns so every section/subtotal card lines up.
function StatementColgroup() {
  return (
    <colgroup>
      <col style={{ width: "20%" }} />
      <col style={{ width: "8%" }} /><col style={{ width: "8%" }} /><col style={{ width: "8%" }} />
      <col style={{ width: "8%" }} /><col style={{ width: "8%" }} /><col style={{ width: "8%" }} />
      <col style={{ width: "8%" }} />
      <col style={{ width: "24%" }} />
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

function HeaderRow({ monthLabel, varMode }: { monthLabel: string; varMode: VarMode }) {
  const varSuffix = varMode === "dollar" ? "Var $" : "Var %";
  return (
    <tr>
      <th style={{ ...headStyle, textAlign: "left" }}>Line</th>
      <th style={{ ...headStyle, borderLeft: GROUP_DIV, color: COLOR_BRAND }}>{monthLabel} Act</th>
      <th style={{ ...headStyle, color: COLOR_BRAND }}>{monthLabel} Bud</th>
      <th style={{ ...headStyle, color: COLOR_BRAND }}>{varSuffix}</th>
      <th style={{ ...headStyle, borderLeft: GROUP_DIV }}>YTD Act</th>
      <th style={headStyle}>YTD Bud</th>
      <th style={headStyle}>YTD {varSuffix}</th>
      <th style={{ ...headStyle, borderLeft: GROUP_DIV }}>Ann Bud</th>
      <th style={{ ...headStyle, borderLeft: GROUP_DIV, textAlign: "left" }}>Notes</th>
    </tr>
  );
}

function StatementTable({ s, viewKey, budgetYear, budgetFallback, notes, noteSources, noteMeta, editorLabel, onSaveNote, dismissedFlags, onDismissFlag, view, thresh, flagFilter, onClearFilter }: {
  s: PropertyStatement; viewKey: string; budgetYear: number | null; budgetFallback: boolean; view: ViewOpts;
  thresh: Thresh; flagFilter: "fav" | "unf" | null; onClearFilter: () => void;
} & NoteFns) {
  const byRole = (roles: SectionRole[]) => s.sections.filter((x) => roles.includes(x.role));
  const revenueSecs = byRole(["revenue", "reimbursement"]);
  const expenseSecs = byRole(["reimbursable-expense", "non-reimbursable-expense", "residential-expense"]);
  const capitalSecs = byRole(["capital"]);
  const debtSecs = byRole(["debt-service"]);
  const r = s.rollups;
  // Capital / Debt Service are often all-zero (no capital spend, no mortgage
  // in the GL yet). With Hide Empty Rows on, drop the whole group — header,
  // section, and its rollup — until something non-zero appears.
  const groupHasActivity = (secs: StatementSection[]) =>
    secs.some((sec) => sec.lines.some((l) => !isLineEmpty(l)) || !isLineEmpty(sec.subtotal));
  const showCapital = capitalSecs.length > 0 && (!view.hideEmpty || groupHasActivity(capitalSecs));
  const showDebt = debtSecs.length > 0 && (!view.hideEmpty || groupHasActivity(debtSecs));
  const nf: NoteFns = { notes, noteSources, noteMeta, editorLabel, onSaveNote, dismissedFlags, onDismissFlag };
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
        <AccountListCard
          title="Non-operating accounts — not on the operating statement"
          description="Balance-sheet & offset accounts carrying a YTD balance but no P&L line — e.g. Prepaid Insurance (the offset to Insurance expense), Cash, depreciation, interest, deferred costs. Expected here; review only if a true operating account appears."
          accent="#b45309"
          rows={s.unmappedAccounts.map((u) => ({ account: u.account, name: u.name, amount: u.ytdActual }))}
          format={(n) => (Math.abs(n) < 0.5 ? "$0" : `${n < 0 ? "-" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`)}
        />
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

      {showCapital && <GroupHeader label="Capital" />}
      {showCapital && capitalSecs.map((sec) => sc(sec, true))}

      {/* No debt service → a single "Cash Flow" line (nothing is deducted, so
          before/after are identical), matching the budget page. With debt, show
          the full before → Debt Service → after waterfall. */}
      {showDebt ? (
        <>
          <RollupCard label="Cash Flow Before Debt Service" t={r.cashFlowBeforeDebtService} view={view} strong />
          <GroupHeader label="Debt Service" />
          {debtSecs.map((sec) => sc(sec))}
          <RollupCard label="Total Debt Service" t={r.totalDebtService} view={view} />
          <RollupCard label="Cash Flow After Debt Service" t={r.cashFlowAfterDebtService} view={view} strong />
        </>
      ) : (
        <RollupCard label="Cash Flow" t={r.cashFlowBeforeDebtService} view={view} strong />
      )}

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
          <thead><HeaderRow monthLabel={monthLabel} varMode={view.varMode} /></thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.label}>
                <td style={labelStyle}>
                  {l.label}
                  {l.flags?.length && !nf.dismissedFlags.has(lineKeyOf(sec.name, l.label)) ? (
                    <button
                      type="button"
                      onClick={() => nf.onDismissFlag(lineKeyOf(sec.name, l.label))}
                      title={`Looks off this month — ${l.flags.join("; ")}. Click to dismiss once you've confirmed it's correct.`}
                      style={{ marginLeft: 6, display: "inline-flex", alignItems: "center", justifyContent: "center", width: 16, height: 16, borderRadius: "50%", background: "rgba(180,83,9,0.12)", border: "1px solid rgba(180,83,9,0.45)", color: "#b45309", fontSize: 10, fontWeight: 800, cursor: "pointer", verticalAlign: "middle", padding: 0, fontFamily: "inherit" }}
                    >?</button>
                  ) : null}
                  {view.showGL && <div className="muted" style={{ fontSize: 11, fontVariantNumeric: "tabular-nums", marginTop: 1 }}>{l.mask}</div>}
                </td>
                {figureCells(l, { psf: view.psf, sqft: view.sqft, varMode: view.varMode, flag: thresh, drill: (tab, scope) => onOpenDetail(sec, l, tab, scope) })}
                <NoteCell lineKey={lineKeyOf(sec.name, l.label)} {...nf} />
              </tr>
            ))}
            {!hideSubtotal && !filterClass && (
              <tr style={{ background: "rgba(11,74,125,0.06)", borderTop: "2px solid rgba(11,74,125,0.30)" }}>
                <td style={{ ...labelStyle, fontWeight: 800, color: COLOR_BRAND, textTransform: "uppercase", letterSpacing: "0.04em", fontSize: 13.5 }}>{subtotalLabel(sec)}</td>
                {figureCells(sec.subtotal, { bold: true, color: COLOR_BRAND, psf: view.psf, sqft: view.sqft, varMode: view.varMode })}
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
              {figureCells(t, { bold: true, color: COLOR_BRAND, noBorder: true, psf: view.psf, sqft: view.sqft, varMode: view.varMode })}
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
function figureCells(t: StatementTotals, opts: { bold?: boolean; color?: string; noBorder?: boolean; psf?: boolean; sqft?: number; varMode?: VarMode; flag?: Thresh; drill?: (tab: "gl" | "budget", scope: "month" | "ytd" | "annual") => void } = {}) {
  const { bold, color, noBorder, psf = false, sqft = 0, varMode = "pct", flag, drill } = opts;
  const base: React.CSSProperties = { ...numStyle, ...(bold ? { fontWeight: 800 } : {}), ...(color ? { color } : {}), ...(noBorder ? { borderBottom: "none" } : {}) };
  const pV = varPct(t.periodVariance, t.periodBudget);
  const yV = varPct(t.ytdVariance, t.ytdBudget);
  const amt = (v: number | null) => fmtAmt(v, psf, sqft);
  const mFlag = flag ? cellFlag(t.periodVariance, t.periodBudget, flag) : null;
  const yFlag = flag ? cellFlag(t.ytdVariance, t.ytdBudget, flag) : null;
  // The Var column shows either the % (default) or the signed $ variance. Color
  // tracks favorability — sign of the $ variance matches the sign of the %.
  const varText = (variance: number | null, pct: number | null) =>
    varMode === "dollar" ? fmtVarAmt(variance, psf, sqft) : fmtPct(pct);
  const varCell = (colorVal: number | null, f: "fav" | "unf" | null): React.CSSProperties =>
    ({ ...base, color: color ?? varColor(colorVal), ...(f ? { background: flagTint(f), fontWeight: 800 } : {}) });
  // Actual cells drill into GL transactions; Budget/Annual cells into the
  // budget detail. Clickable only on real line rows (drill provided) AND when
  // the cell holds activity — a $0 cell has nothing to drill into.
  const click = (tab: "gl" | "budget", scope: "month" | "ytd" | "annual", value: number | null): React.HTMLAttributes<HTMLTableCellElement> =>
    drill && value != null && Math.abs(value) >= 0.005
      ? { onClick: () => drill(tab, scope), title: tab === "gl" ? "Click for GL transactions" : "Click for budget detail", className: "os-cell" }
      : {};
  return (
    <>
      <td {...click("gl", "month", t.periodActual)} style={{ ...base, borderLeft: GROUP_DIV }}>{amt(t.periodActual)}</td>
      <td {...click("budget", "month", t.periodBudget)} style={{ ...base, color: color ?? "var(--muted)" }}>{amt(t.periodBudget)}</td>
      <td style={varCell(varMode === "dollar" ? t.periodVariance : pV, mFlag)}>{varText(t.periodVariance, pV)}</td>
      <td {...click("gl", "ytd", t.ytdActual)} style={{ ...base, borderLeft: GROUP_DIV }}>{amt(t.ytdActual)}</td>
      <td {...click("budget", "ytd", t.ytdBudget)} style={{ ...base, color: color ?? "var(--muted)" }}>{amt(t.ytdBudget)}</td>
      <td style={varCell(varMode === "dollar" ? t.ytdVariance : yV, yFlag)}>{varText(t.ytdVariance, yV)}</td>
      <td {...click("budget", "annual", t.annualBudget)} style={{ ...base, borderLeft: GROUP_DIV, color: color ?? "var(--muted)" }}>{amt(t.annualBudget)}</td>
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

function NoteCell({ lineKey, notes, noteSources, noteMeta, editorLabel, onSaveNote }: { lineKey: string } & NoteFns) {
  const value = notes[lineKey] ?? "";
  const isAi = !!value && noteSources[lineKey] === "ai";
  const [open, setOpen] = useState(false);
  return (
    <td style={{ ...labelStyle, borderLeft: GROUP_DIV, padding: "4px 8px" }}>
      <button
        type="button"
        className="os-cell"
        onClick={() => setOpen(true)}
        title={value ? (isAi ? "AI-generated note" : "Note") : "Add a note"}
        style={{
          width: "100%", textAlign: "left", border: "1px solid transparent", borderRadius: 6,
          background: "transparent", font: "inherit", fontSize: 13, padding: "4px 6px",
          color: value ? "var(--text)" : "var(--muted)", cursor: "pointer",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block",
        }}
      >
        {isAi && <span aria-label="AI-generated" style={{ marginRight: 4 }}>✨</span>}
        {value || "Add a note…"}
      </button>
      {open && (
        <NoteModal
          lineKey={lineKey}
          initial={value}
          isAi={isAi}
          meta={noteMeta[lineKey]}
          editorLabel={editorLabel}
          onPersist={(t) => onSaveNote(lineKey, t)}
          onClose={() => setOpen(false)}
        />
      )}
    </td>
  );
}

// Full-text note viewer/editor — the cell only shows one truncated line, so
// clicking opens this modal to read and edit the whole note. Auto-saves: the
// note is persisted as you type (debounced) and flushed on close / page
// refresh, so an edit is never lost by closing or reloading.
function NoteModal({ lineKey, initial, isAi, meta, editorLabel, onPersist, onClose }: {
  lineKey: string; initial: string; isAi?: boolean; meta?: { editedAt: string; editedBy: string }; editorLabel: string; onPersist: (t: string) => void; onClose: () => void;
}) {
  const [text, setText] = useState(initial);
  const label = lineKey.split("::").pop() || "Note";
  const savedRef = useRef(initial.trim());
  const textRef = useRef(text);
  textRef.current = text;
  // Track the live edit stamp so the footer updates after an in-modal save.
  const [liveMeta, setLiveMeta] = useState<{ editedAt: string; editedBy: string } | null>(null);
  const persist = useCallback((t: string) => {
    const v = t.trim();
    if (v !== savedRef.current) { savedRef.current = v; onPersist(v); setLiveMeta({ editedAt: new Date().toISOString(), editedBy: editorLabel }); }
  }, [onPersist, editorLabel]);
  // Debounced auto-save while typing.
  useEffect(() => {
    const id = setTimeout(() => persist(textRef.current), 500);
    return () => clearTimeout(id);
  }, [text, persist]);
  // Flush on page refresh/navigation and on unmount (close).
  useEffect(() => {
    const flush = () => persist(textRef.current);
    window.addEventListener("beforeunload", flush);
    return () => { window.removeEventListener("beforeunload", flush); persist(textRef.current); };
  }, [persist]);
  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: "min(560px, 100%)" }}>
        <div className="modalHeader">
          <div>
            <div className="modalTitle" style={{ fontSize: 20 }}>{isAi && <span aria-label="AI-generated">✨ </span>}Note</div>
            <div className="muted small" style={{ marginTop: 2 }}>{label}{isAi ? " · AI-generated — edit to mark as yours" : ""} · saves automatically</div>
          </div>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus
          rows={6}
          placeholder="Explain the variance…"
          style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 10, background: "var(--card)", font: "inherit", fontSize: 14, lineHeight: 1.5, padding: "10px 12px", color: "var(--text)", resize: "vertical" }}
        />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 12 }}>
          <span className="muted small">
            {(() => {
              const m = liveMeta ?? meta;
              return m ? <>Last edited {fmtNoteEdited(m.editedAt)} by <b style={{ color: "var(--text)" }}>{m.editedBy}</b></> : null;
            })()}
          </span>
          <button className="btn primary" onClick={() => { persist(textRef.current); onClose(); }}>Done</button>
        </div>
      </div>
    </div>
  );
}

// ── GL transaction drill-down ────────────────────────────────────────────────

type TxRow = { account: string; unit?: string | null; tenant?: string | null; groupKey?: string; date: string | null; description: string; ref: string; amount: number; month: number };
type TenantGroup = { groupKey: string; account: string; unit: string | null; tenant: string | null; amount: number; count: number };

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

// Per-tenant rent roster (from the budget workbook) — same shape + colors as
// the Operating Budgets "Rental Summary by Month" modal.
type RentCat = "in-place" | "renewal" | "new" | "vacant";
type RentEntry = { unitRef: string; tenantName: string; category: RentCat; monthCategories?: RentCat[]; months: number[]; total: number; leaseFrom?: string; leaseTo?: string };
type RentDetailClient = { entries: RentEntry[]; total: number };
const RENT_TINT: Record<RentCat, string> = {
  "in-place": "rgba(21,128,61,0.55)",
  "renewal":  "rgba(132,204,22,0.45)",
  "new":      "rgba(217,249,157,0.65)",
  "vacant":   "transparent",
};
const RENT_LABEL: Record<RentCat, string> = { "in-place": "In-Place", "renewal": "Renewal", "new": "New Lease", "vacant": "Vacant" };
const RENT_ORDER: RentCat[] = ["in-place", "renewal", "new", "vacant"];

// The Rental Summary by Month roster, copied from the Operating Budgets modal:
// suite × month with renewal/new-lease color tints, a legend, rent-bump
// underline, and monthly + annual totals.
function RentRosterTable({ detail, throughMonth }: { detail: RentDetailClient; throughMonth: number }) {
  const fmt = (n: number) => (n === 0 ? "—" : `$${Math.round(n).toLocaleString("en-US")}`);
  // Only show YTD months — no future months. Slice every row to the period.
  const m = Math.min(12, Math.max(1, throughMonth));
  const shownMonths = MONTHS.slice(0, m);
  const ytd = (e: RentEntry) => e.months.slice(0, m).reduce((s, v) => s + (v ?? 0), 0);
  const ordered = [...detail.entries].sort((a, b) => a.unitRef.localeCompare(b.unitRef, undefined, { numeric: true }));
  const monthlyTotals = Array.from({ length: m }, (_, i) => detail.entries.reduce((s, e) => s + (e.months[i] ?? 0), 0));
  const total = detail.entries.reduce((s, e) => s + ytd(e), 0);
  const totalByCategory = (cat: RentCat) =>
    detail.entries.reduce((s, e) => { let d = 0; for (let j = 0; j < m; j++) if ((e.monthCategories?.[j] ?? e.category) === cat) d += e.months[j] ?? 0; return s + d; }, 0);
  const cell: React.CSSProperties = { padding: "5px 8px", fontSize: 11.5, fontVariantNumeric: "tabular-nums", borderTop: "1px solid var(--border)" };
  const hcell: React.CSSProperties = { padding: "5px 8px", fontSize: 10.5, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em", textAlign: "right" };
  const minW = m >= 10 ? 1040 : Math.max(560, 220 + m * 70);
  return (
    <div style={{ padding: "12px 4px 0" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)" }}>
          Rental Summary by Month — {ordered.length} suite{ordered.length === 1 ? "" : "s"} · {fmt(total)} {m < 12 ? `through ${shownMonths[m - 1]}` : "annual"}
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {RENT_ORDER.map((cat) => {
            if (cat === "vacant") return null;
            const dollars = totalByCategory(cat);
            if (dollars === 0) return null;
            const p = total > 0 ? (dollars / total) * 100 : 0;
            return (
              <span key={cat} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11 }}>
                <span style={{ display: "inline-block", width: 12, height: 12, background: RENT_TINT[cat], border: "1px solid rgba(22,163,74,0.35)", borderRadius: 2 }} />
                <span className="muted small">{RENT_LABEL[cat]}: {fmt(dollars)} ({p >= 10 ? `${Math.round(p)}%` : `${p.toFixed(1)}%`})</span>
              </span>
            );
          })}
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ tableLayout: "fixed", width: "100%", minWidth: minW, borderCollapse: "collapse" }}>
          <colgroup>
            <col style={{ width: 64 }} /><col style={{ width: 150 }} />
            {shownMonths.map((mo) => <col key={mo} />)}
            <col style={{ width: 76 }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ ...hcell, textAlign: "left" }}>Suite</th>
              <th style={{ ...hcell, textAlign: "left" }}>Tenant</th>
              {shownMonths.map((mo) => <th key={mo} style={hcell}>{mo}</th>)}
              <th style={hcell}>YTD</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((e, idx) => {
              const isVacant = e.category === "vacant";
              const tip = [e.tenantName, e.leaseFrom && e.leaseTo ? `Lease: ${e.leaseFrom} – ${e.leaseTo}` : e.leaseTo ? `Expires: ${e.leaseTo}` : e.leaseFrom ? `Starts: ${e.leaseFrom}` : ""].filter(Boolean).join("\n");
              const isBump = (j: number) => j > 0 && (e.months[j] ?? 0) > (e.months[j - 1] ?? 0) && (e.months[j - 1] ?? 0) > 0;
              return (
                <tr key={idx}>
                  <td style={{ ...cell, whiteSpace: "nowrap" }} title={tip}>{e.unitRef}</td>
                  <td style={{ ...cell, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: isVacant ? "var(--muted)" : undefined, fontStyle: isVacant ? "italic" : undefined }} title={tip}>{e.tenantName}</td>
                  {e.months.slice(0, m).map((mv, j) => {
                    const cat = e.monthCategories?.[j] ?? e.category;
                    return (
                      <td key={j} style={{ ...cell, textAlign: "right", background: mv > 0 ? RENT_TINT[cat] : undefined, color: cat === "vacant" ? "var(--muted)" : undefined, boxShadow: isBump(j) ? "inset 0 -2px 0 rgba(15,23,42,0.55)" : undefined }}>{fmt(mv)}</td>
                    );
                  })}
                  <td style={{ ...cell, textAlign: "right", fontWeight: 700, color: isVacant ? "var(--muted)" : undefined }}>{fmt(ytd(e))}</td>
                </tr>
              );
            })}
            <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 800 }}>
              <td colSpan={2} style={{ ...cell, textTransform: "uppercase", letterSpacing: "0.04em", fontSize: 10.5 }}>Total</td>
              {monthlyTotals.map((mv, j) => <td key={j} style={{ ...cell, textAlign: "right", fontWeight: 800 }}>{fmt(mv)}</td>)}
              <td style={{ ...cell, textAlign: "right", fontWeight: 900 }}>{fmt(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LineDetailModal({ viewKey, property, year, period, monthLabel, line, initialTab, initialScope, onClose }: {
  viewKey: string; property: string; year: number; period: number; monthLabel: string;
  line: { mask: string; label: string; sign: 1 | -1 };
  initialTab: "gl" | "budget"; initialScope: "month" | "ytd" | "annual"; onClose: () => void;
}) {
  const [tab, setTab] = useState<"gl" | "budget">(initialTab);
  // GL has no "annual" scope (the file is YTD); clamp it to YTD.
  const [scope, setScope] = useState<"month" | "ytd" | "annual">(initialTab === "gl" && initialScope === "annual" ? "ytd" : initialScope);
  const [gl, setGl] = useState<{ transactions: TxRow[]; total: number; count: number; accounts?: string[]; byTenant?: TenantGroup[] } | null>(null);
  const [bud, setBud] = useState<{ rows: BudRow[]; budgetYear: number | null; rentDetail?: RentDetailClient | null } | null>(null);
  const [loading, setLoading] = useState(false);
  // When set, the GL list is isolated to one tenant/unit account.
  const [tenantFilter, setTenantFilter] = useState<string | null>(null);
  const effScope: "month" | "ytd" | "annual" = tab === "gl" && scope === "annual" ? "ytd" : scope;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    setLoading(true);
    setTenantFilter(null);
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

  const budAmt = (r: BudRow) => effScope === "month" ? r.month : effScope === "annual" ? r.annual : r.ytd;
  // Only show budget lines with a value in the current scope — a row that's $0
  // for the period isn't activity worth listing.
  const budRows = (bud?.rows ?? []).filter((r) => Math.abs(budAmt(r)) >= 0.005);
  const budTotal = budRows.reduce((s, r) => s + budAmt(r), 0);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "48px 20px", overflow: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--card)", borderRadius: 12, maxWidth: tab === "budget" && bud?.rentDetail && (effScope === "annual" ? 12 : period) > 7 ? 1240 : 820, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.35)", display: "flex", flexDirection: "column", maxHeight: "82vh" }}>
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
              // Hide zero-amount lines — only show transactions with activity.
              const txns = gl.transactions.filter((t) => Math.abs(t.amount) >= 0.005);
              if (txns.length === 0) return <div className="muted small" style={{ padding: 18 }}>No transactions for this line in {scopeWord}.</div>;
              // Per-tenant/unit breakdown (non-zero). Shown when the line spans
              // 2+ accounts (e.g. rental income) so each tenant can be isolated.
              const groups = (gl.byTenant ?? []).filter((g) => Math.abs(g.amount) >= 0.005);
              const multi = groups.length >= 2;
              const shown = tenantFilter ? txns.filter((t) => t.groupKey === tenantFilter) : txns;
              const glTotal = shown.reduce((s, t) => s + t.amount, 0);
              // Standout drivers — transactions that are a large share of the
              // shown activity (≥ a third of the total absolute, or the single
              // biggest when it's a meaningful slice). Highlighted so the items
              // worth investigating jump out.
              const totalAbs = shown.reduce((s, t) => s + Math.abs(t.amount), 0);
              // A transaction "drives" the line when it's a large share of the
              // shown activity — a third or more on its own, or (once there are
              // several transactions) a fifth or more. Share-based, so two
              // near-equal large items are flagged the same rather than singling
              // out only the single biggest. Needs ≥2 transactions — a lone one
              // is trivially 100% of the line, so flagging it tells you nothing.
              const isDriver = (amt: number) => shown.length >= 2 && totalAbs > 0 && (Math.abs(amt) >= totalAbs / 3 || (shown.length >= 3 && Math.abs(amt) >= 0.2 * totalAbs));
              const activeTenantName = tenantFilter ? (groups.find((g) => g.groupKey === tenantFilter)?.tenant || tenantFilter) : null;
              return (
              <div>
                {multi && (
                  <div style={{ padding: "10px 10px 0" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--muted)" }}>By tenant / unit — click to isolate</div>
                      {tenantFilter && <button type="button" onClick={() => setTenantFilter(null)} style={{ ...tabBtn(false), padding: "2px 8px", fontSize: 12 }}>Clear ✕</button>}
                    </div>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead><tr><th style={th}>Suite</th><th style={th}>Tenant</th><th style={{ ...th, textAlign: "right" }}>Txns</th><th style={{ ...th, textAlign: "right" }}>Amount</th></tr></thead>
                      <tbody>
                        {groups.map((g) => {
                          const active = tenantFilter === g.groupKey;
                          return (
                          <tr key={g.groupKey} onClick={() => setTenantFilter(active ? null : g.groupKey)} className="os-cell"
                            style={{ cursor: "pointer", background: active ? "rgba(11,74,125,0.10)" : undefined }}>
                            <td style={{ ...tdc, whiteSpace: "nowrap", color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>{g.unit || "—"}</td>
                            <td style={{ ...tdc, fontWeight: active ? 800 : undefined }}>{g.tenant || <span className="muted">— (unmatched)</span>}</td>
                            <td style={{ ...tdc, textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--muted)" }}>{g.count}</td>
                            <td style={{ ...tdc, textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", fontWeight: active ? 800 : undefined, color: g.amount < 0 ? "#b91c1c" : undefined }}>{money2(g.amount)}</td>
                          </tr>
                        );})}
                      </tbody>
                    </table>
                    <div style={{ borderTop: "2px solid var(--border)", marginTop: 10 }} />
                  </div>
                )}
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr><th style={th}>Date</th><th style={th}>Description</th>{multi && <th style={th}>Suite</th>}{multi && <th style={th}>Tenant</th>}<th style={th}>Ref</th><th style={th}>Acct</th><th style={{ ...th, textAlign: "right" }}>Amount</th></tr></thead>
                  <tbody>
                    {shown.map((t, i) => {
                      const driver = isDriver(t.amount);
                      return (
                      <tr key={i} style={driver ? { background: "rgba(180,83,9,0.10)" } : undefined}>
                        <td style={{ ...tdc, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{fmtTxDate(t.date)}</td>
                        <td style={tdc}>{driver && <span title="Major driver of this line" style={{ color: "#b45309", fontWeight: 800, marginRight: 5 }}>▲</span>}{t.description}</td>
                        {multi && <td style={{ ...tdc, whiteSpace: "nowrap", color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>{t.unit || "—"}</td>}
                        {multi && <td style={{ ...tdc, whiteSpace: "nowrap" }}>{t.tenant || <span className="muted">—</span>}</td>}
                        <td style={{ ...tdc, whiteSpace: "nowrap", color: "var(--muted)" }}>{t.ref}</td>
                        <td style={{ ...tdc, whiteSpace: "nowrap", color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>{t.account}</td>
                        <td style={{ ...tdc, textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", fontWeight: driver ? 800 : undefined, color: t.amount < 0 ? "#b91c1c" : undefined }}>{money2(t.amount)}</td>
                      </tr>
                    );})}
                  </tbody>
                  <tfoot><tr>
                    <td colSpan={multi ? 6 : 4} style={{ ...tdc, fontWeight: 800, borderTop: "2px solid var(--border)" }}>{activeTenantName ? `${activeTenantName} · ` : ""}Total · {shown.length} transaction{shown.length === 1 ? "" : "s"}</td>
                    <td style={{ ...tdc, textAlign: "right", fontWeight: 900, fontVariantNumeric: "tabular-nums", borderTop: "2px solid var(--border)" }}>{money2(glTotal)}</td>
                  </tr></tfoot>
                </table>
              </div>
              );
            })()
          ) : (
            <div>
              {bud?.rentDetail && bud.rentDetail.entries.length > 0 && <RentRosterTable detail={bud.rentDetail} throughMonth={effScope === "annual" ? 12 : period} />}
              {budRows.length === 0 ? (
                bud?.rentDetail ? null : (
                  <div className="muted small" style={{ padding: 18 }}>
                    {(bud?.rows ?? []).length === 0
                      ? `No budget lines map to this statement line${bud?.budgetYear ? ` in the ${bud.budgetYear} budget` : ""}.`
                      : `No budgeted amount in ${scopeWord}.`}
                  </div>
                )
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", marginTop: bud?.rentDetail ? 16 : 0 }}>
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
              const start = new Date(year, nextPeriod - 1, 1);  // first day of the next month to import
              const end = new Date(year, nextPeriod, 0);          // last day of that month
              const label = end.toLocaleDateString("en-US", { month: "long", year: "numeric" });
              return <>Select <b>Beginning Date</b> (<b>{fmtMDY(start)}</b>) and <b>End Date</b> (<b>{fmtMDY(end)}</b>) — just <b>{label}</b>, the next month to import.</>;
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

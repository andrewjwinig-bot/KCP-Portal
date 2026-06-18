"use client";

// Cash Sheet — the unified cash-management page (formerly "Cash Analysis"; the
// old weekly Cash Sheet was merged in). Lists every property/entity bank account
// with its cash position: monthly cash-flow buckets computed from the uploaded
// GL (account→code map ported from the legacy workbook), non-GL accounts as flat
// manual balances, and an "Est. Cash Today" column that carries each balance
// forward through the weekly AvidXchange bills for months not yet posted.
// Receipts are positive inflows; expenses/outflows negative; Net Change = the
// row sum (the change in operating cash).

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import { StatPill, Pill, Badge, TONE_RED, TONE_AMBER, TONE_GREEN } from "@/app/components/Pill";
import { LastImported } from "@/app/components/LastImported";
import { bankAccountsForCodes, weekOfLabel, parseMonthKey, type BankAccount } from "@/lib/financials/cash-sheet/util";

type Bucket = { code: number; label: string };
type Breakdown = { key: string; name: string; startingCash: number | null; netChange: number; endingCash: number | null; byBucket: Record<string, number> };
type Row = {
  key: string; propertyCode: string; name: string; group: string;
  period: number; maxPeriod: number;
  byBucket: Record<string, number>; netChange: number;
  glOpening: number | null; startingCash: number | null; openingOverridden: boolean; endingCash: number | null;
  scheduledDebt: number; debtExpected: boolean; debtPosted: boolean; debtMissing: boolean;
  latestGLMonth: number;
  estimate: { months: number; revenue: number; bills: number; mortgage: number; estimatedCash: number | null; latestEnding: number | null } | null;
  isFund?: boolean; manual?: boolean; readOnly?: boolean; mm?: boolean; sd?: boolean; bankCodes?: string[]; bankLast4?: string; excludeLast4?: string[]; breakdown?: Breakdown[];
  billsMTD?: number; weeklyBills?: { wednesday: string; amount: number }[];
  reserves?: number; reservesAuto?: number; reservesOverridden?: boolean;
  interest?: { opening: number; rate: number; amount: number; fee: number };
};
type Payload = { year: number; period: number; ytd: boolean; buckets: Bucket[]; rows: Row[]; canEdit: boolean; canEditOpening: boolean; ym: string; estimateAsOf: string | null; gapMonthLabels: string[]; latestPostedPeriod: number; lastImport: { at: string; by: string | null } | null; apImport: { at: string; by: string | null } | null; generatedAt: string };

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function money0(n: number | null): string {
  if (n == null) return "—";
  const v = Math.round(n);
  const s = Math.abs(v).toLocaleString("en-US");
  return v < 0 ? `($${s})` : `$${s}`;
}
const numCell: React.CSSProperties = { textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
// Column headers wrap so long bucket labels ("Change in Escrows") don't force a wide column.
const headWrap: React.CSSProperties = { textAlign: "right", whiteSpace: "normal", lineHeight: 1.15, verticalAlign: "bottom", minWidth: 70 };
// Opening / Ending cash are the headline numbers — give them a prominent, tinted column.
const keyCol: React.CSSProperties = { ...numCell, fontWeight: 800, fontSize: 14, background: "rgba(11,74,125,0.06)" };
function periodDates(year: number, period: number, ytd: boolean) {
  const endDay = new Date(year, period, 0).getDate(); // last day of the period month
  const end = `${MONTHS[period - 1]} ${endDay}, ${year}`;
  const open = ytd ? `Jan 1, ${year}` : `${MONTHS[period - 1]} 1, ${year}`;
  const mm = String(period).padStart(2, "0");
  const openShort = ytd ? "01-01" : `${mm}-01`;
  const endShort = `${mm}-${String(endDay).padStart(2, "0")}`;
  return { open, end, range: `${open} – ${end}`, openShort, endShort };
}
const groupHeaderCell: React.CSSProperties = {
  textAlign: "left", fontSize: 13, fontWeight: 800, textTransform: "uppercase",
  letterSpacing: "0.06em", color: "var(--text)", background: "rgba(15,23,42,0.04)",
  padding: "10px 12px", borderTop: "2px solid var(--border)",
};
// Right-aligned subtotal cells on the collapsible group header row.
const groupSubCell: React.CSSProperties = {
  ...numCell, fontWeight: 800, fontSize: 13, color: "var(--text)",
  background: "rgba(15,23,42,0.04)", padding: "10px 12px", borderTop: "2px solid var(--border)",
};
// A summary amount that opens its breakdown — looks like text, underlines on hover.
const summaryBtn = { background: "none", border: "none", padding: 0, font: "inherit", color: "inherit", cursor: "pointer", textDecoration: "none" };
const ulOn = (e: MouseEvent<HTMLElement>) => { e.currentTarget.style.textDecoration = "underline"; };
const ulOff = (e: MouseEvent<HTMLElement>) => { e.currentTarget.style.textDecoration = "none"; };
const GROUP_ORDER = ["Business Parks", "Shopping Centers", "LIK Management", "Korman Homes", "Eastwick Joint Venture", "Land & Other", "Other"];
// Explicit within-group row order (by displayed property code). Codes listed
// here lead in this order; anything else in the group trails alphabetically.
const ROW_ORDER: Record<string, string[]> = {
  "Business Parks": ["FJVIII", "FIIICO", "FNIPLX", "4000", "LK-TRUST", "4900"],
};

// Bank-account chips (from Property Info) — click to open the bank login for the
// account behind each row, matching the Cash Sheet.
function BankLinks({ accounts }: { accounts: BankAccount[] }) {
  if (!accounts.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 3 }}>
      {accounts.map((a, i) => (
        <a key={i} href={a.link} target="_blank" rel="noreferrer" title={`${a.bank} · ${a.label}`}
          style={{ fontSize: 11, fontWeight: 700, color: "#0b4a7d", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 3 }}
          onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
          onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}>
          {a.bank} {a.last4}<span aria-hidden style={{ fontSize: 9, opacity: 0.7 }}>↗</span>
        </a>
      ))}
    </div>
  );
}

export default function CashSheetPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [period, setPeriod] = useState(now.getMonth() + 1);
  const [ytd, setYtd] = useState(false);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Drill-down: the GL accounts behind one property's bucket.
  type DrillAcct = { account: string; name: string | null; amount: number };
  const [drill, setDrill] = useState<{ key: string; propName: string; code: number; label: string } | null>(null);
  const [drillData, setDrillData] = useState<{ accounts: DrillAcct[]; total: number } | null>(null);
  const [drillLoading, setDrillLoading] = useState(false);
  // Collapsible groups — remembered across visits. Collapsed groups still show
  // their subtotal on the header row.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try { return new Set(JSON.parse(localStorage.getItem("cash-sheet-collapsed") || "[]")); } catch { return new Set(); }
  });
  const toggleGroup = (g: string) => setCollapsed((s) => {
    const n = new Set(s); n.has(g) ? n.delete(g) : n.add(g);
    try { localStorage.setItem("cash-sheet-collapsed", JSON.stringify([...n])); } catch { /* ignore */ }
    return n;
  });
  // Column view: the cash-flow buckets collapse to Cash In/Out (default) or a
  // single Net column; Detail shows all 8 buckets. Remembered across visits.
  type View = "net" | "io" | "detail";
  const [view, setView] = useState<View>(() => {
    if (typeof window === "undefined") return "io";
    const v = localStorage.getItem("cash-sheet-view");
    return v === "net" || v === "detail" || v === "io" ? v : "io";
  });
  const setViewPersist = (v: View) => { setView(v); try { localStorage.setItem("cash-sheet-view", v); } catch { /* ignore */ } };
  // Editable opening-cash override (shared with the Cash Sheet) + fund breakdown modal.
  const [openDraft, setOpenDraft] = useState<Record<string, string>>({});
  const [manualDraft, setManualDraft] = useState<Record<string, string>>({});
  const [reservesDraft, setReservesDraft] = useState<Record<string, string>>({});
  const [breakdown, setBreakdown] = useState<{ name: string; rows: Breakdown[] } | null>(null);
  // Weekly AvidXchange bills drill-down (per-Wednesday detail behind a row's Avid Bills).
  const [billsModal, setBillsModal] = useState<{ name: string; weekly: { wednesday: string; amount: number }[]; total: number } | null>(null);
  // Interest-bearing accounts: clicking Receipts shows the rate calc, not a GL drill.
  const [interestModal, setInterestModal] = useState<{ name: string; opening: number; rate: number; amount: number; fee: number } | null>(null);
  // Bucket breakdown behind a summary cell (Cash In / Cash Out / Net Change) — the
  // 8 categories, each still drillable to its GL accounts, so summary views stay traceable.
  const [bucketModal, setBucketModal] = useState<{ row: Row; filter: "in" | "out" | "all" } | null>(null);
  // The "To Available" drawdown (Net view) — the reserves + un-posted bills that
  // bridge Ending Cash to Est. Available Cash.
  const [bridgeModal, setBridgeModal] = useState<{ row: Row } | null>(null);
  // Weekly AvidXchange bills — the bridge that keeps the monthly GL position
  // current between postings. Uploaded here, consumed by "Est. Cash Today".
  const apRef = useRef<HTMLInputElement | null>(null);
  const [apUploading, setApUploading] = useState(false);
  const [apSummary, setApSummary] = useState<{ wednesday: string; total: number; count: number } | null>(null);

  const openDrill = useCallback((row: Row, code: number, label: string) => {
    setDrill({ key: row.key, propName: row.name, code, label });
    setDrillData(null);
    setDrillLoading(true);
    fetch(`/api/financials/cash-analysis/drill?key=${encodeURIComponent(row.key)}&year=${year}&period=${period}&code=${code}&ytd=${ytd ? 1 : 0}`)
      .then((r) => r.json())
      .then((j) => setDrillData({ accounts: j.accounts ?? [], total: j.total ?? 0 }))
      .catch(() => setDrillData({ accounts: [], total: 0 }))
      .finally(() => setDrillLoading(false));
  }, [year, period, ytd]);

  // What a single bucket does when clicked (from a Detail cell or the breakdown
  // modal): interest accounts show the rate calc, pooled SD movement isn't
  // drillable, everything else opens the GL accounts behind it.
  const onBucketClick = useCallback((row: Row, code: number, label: string) => {
    if (code === 1 && row.interest) { setInterestModal({ name: row.name, opening: row.interest.opening, rate: row.interest.rate, amount: row.interest.amount, fee: row.interest.fee }); return; }
    if (code === 8 && row.sd) return; // pooled SD movement — no GL on this key
    openDrill(row, code, label);
  }, [openDrill]);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/financials/cash-analysis?year=${year}&period=${period}&ytd=${ytd ? 1 : 0}`)
      .then((r) => r.json())
      .then((j: Payload & { error?: string }) => { if (j.error) setError(j.error); else { setData(j); setError(null); } })
      .catch((e) => setError(e?.message ?? "Failed to load"))
      .finally(() => setLoading(false));
  }, [year, period, ytd]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setOpenDraft({}); setManualDraft({}); setReservesDraft({}); }, [year, period, ytd]);

  // Save (or clear) a row's reserve override via the Cash Sheet store, then reload.
  const saveReserves = useCallback((code: string, raw: string) => {
    const t = raw.replace(/[$,\s]/g, "");
    const value = t === "" ? null : Number(t);
    if (value != null && !Number.isFinite(value)) return;
    fetch("/api/financials/cash-sheet", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ym: data?.ym, code, kind: "reserves", value }),
    }).then((r) => { if (r.ok) load(); }).catch(() => {});
  }, [data?.ym, load]);

  // Save an opening-cash override (or clear it) via the Cash Sheet store, then reload.
  const saveOverride = useCallback((code: string, kind: "startingOverride" | "endingOverride", raw: string) => {
    const t = raw.replace(/[$,\s]/g, "");
    const value = t === "" ? null : Number(t);
    if (value != null && !Number.isFinite(value)) return;
    fetch("/api/financials/cash-sheet", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ym: data?.ym, code, kind, value }),
    }).then((r) => { if (r.ok) load(); }).catch(() => {});
  }, [data?.ym, load]);
  // GL rows override the opening (startingOverride); manual accounts store a
  // single current balance (endingOverride) — same store the Cash Sheet uses.
  const saveOpening = useCallback((row: Row, raw: string) => saveOverride(row.key, "startingOverride", raw), [saveOverride]);
  const saveManual = useCallback((row: Row, raw: string) => saveOverride(row.key, "endingOverride", raw), [saveOverride]);

  // Upload the weekly AP AutoPay Selections Reports → auto-fills the week's bills
  // (reused from the Cash Sheet), refreshing the "Est. Cash Today" bridge.
  async function onApUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length) return;
    setApUploading(true); setApSummary(null); setError(null);
    try {
      const fd = new FormData();
      for (const f of Array.from(files)) fd.append("files", f);
      const res = await fetch("/api/financials/cash-sheet/ap-upload", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "Upload failed");
      const pm = parseMonthKey(String(j.wednesday).slice(0, 7));
      if (pm && (pm.year !== year || pm.month !== period)) { setYear(pm.year); setPeriod(pm.month); }
      setApSummary({ wednesday: j.wednesday, total: j.total, count: (j.filled ?? []).length });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setApUploading(false);
      if (apRef.current) apRef.current.value = "";
    }
  }

  const buckets = data?.buckets ?? [];
  // Hide a bucket column when it's zero for every property (e.g. Change in Escrows).
  // Keep Mortgage P&I (4) visible when any loan is scheduled-but-unposted so its
  // estimate still shows even if nothing has posted to that column yet.
  const visibleBuckets = buckets.filter((b) =>
    (b.code === 4 && (data?.rows ?? []).some((r) => r.debtMissing)) ||
    (data?.rows ?? []).some((r) => (r.byBucket[b.code] ?? 0) !== 0));
  const grouped = useMemo(() => {
    const by: Record<string, Row[]> = {};
    for (const r of data?.rows ?? []) (by[r.group] = by[r.group] || []).push(r);
    for (const [g, rs] of Object.entries(by)) {
      const order = ROW_ORDER[g];
      rs.sort((a, b) => {
        if (order) {
          const ia = order.indexOf(a.propertyCode), ib = order.indexOf(b.propertyCode);
          if (ia !== -1 || ib !== -1) return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib);
        }
        return a.propertyCode.localeCompare(b.propertyCode);
      });
    }
    return GROUP_ORDER.filter((g) => by[g]?.length).map((g) => ({ group: g, rows: by[g] }));
  }, [data]);

  // The GL-actuals month for the snapshot = the latest month posted across the
  // portfolio, capped at the selected report month. GLs post a month in arrears,
  // so a June report shows MAY GL actuals (with June Avid bills bridging to now).
  // A property is "behind" only if its GL hasn't reached this month yet.
  const glMonth = data?.latestPostedPeriod ? Math.min(period, data.latestPostedPeriod) : period;
  const isBehind = (r: Row) => !r.manual && !r.readOnly && !ytd && r.maxPeriod < glMonth;

  const grand = useMemo(() => {
    const byBucket: Record<string, number> = {};
    let inflows = 0, outflows = 0, opening = 0, ending = 0, bills = 0, reserves = 0, hasOpening = false;
    for (const r of data?.rows ?? []) {
      // Behind properties are excluded from the snapshot (their row is blanked).
      if (!r.manual && !r.readOnly && !ytd && r.maxPeriod < glMonth) continue;
      for (const b of buckets) {
        const v = r.byBucket[b.code] ?? 0;
        byBucket[b.code] = (byBucket[b.code] ?? 0) + v;
        if (v > 0) inflows += v; else outflows += v;
      }
      bills += r.billsMTD ?? 0;
      reserves += r.reserves ?? 0;
      if (r.startingCash != null) { opening += r.startingCash; ending += (r.endingCash ?? 0); hasOpening = true; }
    }
    return { byBucket, inflows, outflows, net: inflows + outflows, opening, ending, bills, reserves, hasOpening };
  }, [data, buckets, period, ytd]);

  const debtMissingRows = (data?.rows ?? []).filter((r) => r.debtMissing);
  // Properties still posted through an earlier month than the snapshot month —
  // their GL needs importing so the whole sheet is one point in time.
  const laggingRows = (data?.rows ?? []).filter(isBehind);
  const laggingKeys = new Set(laggingRows.map((r) => r.key));
  const glDates = periodDates(year, glMonth, ytd); // GL-actuals month (e.g. May) for the Opening/Ending headers
  // Most recent Wednesday that bills were uploaded for — the "as of" date for the
  // Est. Available Cash column (it carries the GL forward net of those bills).
  const lastBillWed = (() => {
    let max = "";
    for (const r of data?.rows ?? []) for (const w of r.weeklyBills ?? []) if (w.amount && w.wednesday > max) max = w.wednesday;
    return max ? max.slice(5) : null; // "YYYY-MM-DD" → "MM-DD"
  })();
  const showEst = !!data?.estimateAsOf;
  const showBills = (data?.rows ?? []).some((r) => (r.billsMTD ?? 0) !== 0);
  const showReserves = !!data && (data.canEdit || (data.rows ?? []).some((r) => (r.reserves ?? 0) !== 0));
  // Est. Available Cash = projected (or current) cash less the reserve set-aside.
  const estAvail = (r: Row): number | null => {
    const base = r.estimate?.estimatedCash ?? r.endingCash;
    return base == null ? null : base - (r.reserves ?? 0);
  };
  const estAvailTotal = (data?.rows ?? []).reduce((s, r) => laggingKeys.has(r.key) ? s : s + (estAvail(r) ?? 0), 0);
  // Per-group subtotals (excluding behind rows) — shown on the collapsible group header.
  const groupTotals = (gr: Row[]) => {
    const byBucket: Record<string, number> = {};
    let opening = 0, ending = 0, bills = 0, reserves = 0, est = 0, hasOpening = false;
    for (const r of gr) {
      if (laggingKeys.has(r.key)) continue;
      for (const b of visibleBuckets) byBucket[b.code] = (byBucket[b.code] ?? 0) + (r.byBucket[b.code] ?? 0);
      bills += r.billsMTD ?? 0; reserves += r.reserves ?? 0; est += estAvail(r) ?? 0;
      if (r.startingCash != null) { opening += r.startingCash; ending += (r.endingCash ?? 0); hasOpening = true; }
    }
    return { byBucket, opening, ending, bills, reserves, est, hasOpening };
  };
  // Cash In / Cash Out / Net from a set of bucket totals (positive buckets in,
  // negative buckets out). `out` comes back negative; show its magnitude.
  const ioFrom = (bb: Record<string, number>) => {
    let cin = 0, cout = 0;
    for (const b of buckets) { const v = bb[b.code] ?? 0; if (v > 0) cin += v; else cout += v; }
    return { cin, cout, net: cin + cout };
  };
  // Middle columns vary by view: all visible buckets (detail), 2 (in/out), or 1 (net).
  const midCount = view === "detail" ? visibleBuckets.length : view === "io" ? 2 : 1;
  // In the Net view, Avid Bills + Reserves collapse into one "To Available" bridge
  // column (Est. Available − Ending Cash) — only meaningful when Est. Available shows.
  const netBridge = view === "net" && showEst;
  const showBillsCol = showBills && !netBridge;
  const showReservesCol = showReserves && !netBridge;
  const bridgeVal = (avail: number | null, ending: number | null) => (avail == null || ending == null ? null : avail - ending);
  const colCount = midCount + 3 + (showBillsCol ? 1 : 0) + (showReservesCol ? 1 : 0) + (netBridge ? 1 : 0) + (showEst ? 1 : 0); // entity + opening + middle + ending (+ bills) (+ reserves) (+ bridge) (+ est)

  return (
    <main style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: "none", width: "100%" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Cash Sheet</h1>
        <span style={{ fontSize: 20, fontWeight: 700, color: "var(--muted)", whiteSpace: "nowrap" }}>
          {ytd ? `${year} YTD` : `${MONTHS[period - 1]} ${year}`}
        </span>
      </div>

      {/* ── Controls card ─────────────────────────────────────────────────── */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {data?.canEdit && (
              <>
                <button className="btn" onClick={() => apRef.current?.click()} disabled={apUploading} style={{ whiteSpace: "nowrap", fontSize: 13, padding: "8px 16px" }} title="Import the weekly AP Selection Report (.xls, .xlsx, or .pdf) to fill bills paid">
                  {apUploading ? "Importing…" : "Import"}
                </button>
                <input ref={apRef} type="file" accept=".xls,.xlsx,.pdf" multiple style={{ display: "none" }} onChange={onApUpload} />
              </>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {!ytd && glMonth !== period && <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>{MONTHS[glMonth - 1]} GL actuals + {MONTHS[period - 1]} bills</span>}
            <select
              value={`${year}-${period}`}
              onChange={(e) => { const [y, m] = e.target.value.split("-").map(Number); setYear(y); setPeriod(m); }}
              title="View period"
              style={{ borderRadius: 999, padding: "8px 12px", fontSize: 13, fontWeight: 600, border: "1px solid rgba(11,74,125,0.3)", background: "var(--card)", color: "#0b4a7d", cursor: "pointer" }}>
              {Array.from({ length: 18 }, (_, i) => { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); return { y: d.getFullYear(), m: d.getMonth() + 1 }; }).map(({ y, m }) => (
                <option key={`${y}-${m}`} value={`${y}-${m}`}>{MONTHS[m - 1]} {y}</option>
              ))}
            </select>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 }}>
              <input type="checkbox" checked={ytd} onChange={(e) => setYtd(e.target.checked)} /> YTD
            </label>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
          <p className="muted small" style={{ margin: 0 }}>
            Import the weekly <b>AP Selection Report</b> (.xls, .xlsx, or .pdf) to fill bills paid.
          </p>
          <div style={{ display: "inline-flex", border: "1px solid rgba(11,74,125,0.3)", borderRadius: 999, overflow: "hidden" }} title="How much detail to show for cash movement">
            {([["net", "Net"], ["io", "Cash In/Out"], ["detail", "Detail"]] as const).map(([v, label]) => (
              <button key={v} type="button" onClick={() => setViewPersist(v)}
                style={{ padding: "7px 12px", fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer", background: view === v ? "#0b4a7d" : "var(--card)", color: view === v ? "#fff" : "#0b4a7d" }}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <p className="muted small" style={{ marginTop: 4 }}>
          <b>Snapshot · {ytd ? "Year to date" : MONTHS[period - 1] + " " + year}</b>
          {" "}— every property and entity bank account with its cash position.
        </p>
        <LastImported at={data?.apImport?.at} by={data?.apImport?.by} label="AP Report last imported" />
        {apSummary && (
          <div className="small" style={{ marginTop: 6, color: "#15803d", fontWeight: 700 }}>
            ✓ Filled {apSummary.count} {apSummary.count === 1 ? "property" : "properties"} · {money0(apSummary.total)} for the {weekOfLabel(apSummary.wednesday).toLowerCase()} from the AP Selection Report.
          </div>
        )}
        {error && <div style={{ color: "#b42318", fontSize: 13, marginTop: 6 }}>{error}</div>}
      </div>

      {laggingRows.length > 0 && (
        <div className="card" style={{ padding: "12px 16px", borderLeft: "3px solid #d97706" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, fontWeight: 800, color: "#b45309", fontSize: 14 }}>
            <span>⚠ Snapshot blends time periods</span><Badge>{laggingRows.length}</Badge>
          </div>
          <div className="muted small" style={{ marginBottom: 8 }}>
            Their GL isn&apos;t posted through <b>{MONTHS[glMonth - 1]} {year}</b> yet (the latest month the rest of the portfolio is on). Import their {MONTHS[glMonth - 1]} {year} GL so the whole sheet is one point in time.
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {laggingRows.map((r) => (
              <span key={r.key} title={`${r.name} — posted through ${MONTHS[r.maxPeriod - 1]} ${year}`}>
                <Pill tone={TONE_AMBER}>{r.propertyCode} · through {MONTHS[r.maxPeriod - 1]}</Pill>
              </span>
            ))}
          </div>
        </div>
      )}

      {debtMissingRows.length > 0 && (
        <div className="card" style={{ padding: "12px 16px", borderLeft: "3px solid #dc2626" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontWeight: 800, color: "#b91c1c", fontSize: 14 }}>
            <span>⚠ Mortgage P&amp;I not posted</span><Badge>{debtMissingRows.length}</Badge>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {debtMissingRows.map((r) => (
              <span key={r.key} title={`${r.name} — scheduled ${money0(r.scheduledDebt)}`}>
                <Pill tone={TONE_RED}>{r.propertyCode} · {money0(r.scheduledDebt)}</Pill>
              </span>
            ))}
          </div>
          <div className="muted small" style={{ margin: 0 }}>
            Scheduled debt service for {ytd ? "the year" : MONTHS[period - 1]} hasn&apos;t hit the GL — the charge may not be entered yet, or the GL needs re-uploading.
          </div>
        </div>
      )}

      <div className="pills" style={{ justifyContent: "flex-start" }}>
        <StatPill label={`Opening Cash · ${glDates.openShort}`} value={grand.hasOpening ? money0(grand.opening) : "—"} />
        <StatPill label="Total Cash Inflows" value={money0(grand.inflows)} accent="#15803d" />
        <StatPill label="Total Cash Outflows" value={money0(grand.outflows)} accent="#b91c1c" />
        <StatPill label={`Ending Cash · ${glDates.endShort}`} value={grand.hasOpening ? money0(grand.ending) : "—"} accent="#0b4a7d" />
        <StatPill label="Est. Available Cash" value={money0(estAvailTotal)} accent="#15803d" />
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="tableWrap" style={{ overflowX: "auto" }}>
          <table style={{ minWidth: 1100, width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", minWidth: 260 }}>Entity</th>
                <th style={{ ...keyCol, textAlign: "center" }}>Opening Cash<div style={{ fontWeight: 800, fontSize: 16, color: "var(--text)", textTransform: "none", marginTop: 1 }}>{glDates.openShort}</div></th>
                {view === "detail" ? visibleBuckets.map((b) => <th key={b.code} style={headWrap}>{b.label}</th>)
                  : view === "io" ? [<th key="in" style={headWrap}>Cash In</th>, <th key="out" style={headWrap}>Cash Out</th>]
                  : <th style={headWrap}>Net Change</th>}
                <th style={{ ...keyCol, textAlign: "center" }}>Ending Cash<div style={{ fontWeight: 800, fontSize: 16, color: "var(--text)", textTransform: "none", marginTop: 1 }}>{glDates.endShort}</div></th>
                {showBillsCol && <th style={headWrap} title={`AvidXchange bills paid in ${MONTHS[period - 1]} — click a row for the weekly detail`}>Avid Bills<div style={{ fontWeight: 700, fontSize: 13, color: "var(--text)", textTransform: "none" }}>{MONTHS[period - 1]}</div></th>}
                {showReservesCol && <th style={headWrap} title="Budgeted Big Projects reserve set aside (from the budget; type to override)">Reserves</th>}
                {netBridge && <th style={headWrap} title="Bills & reserves drawdown from Ending Cash to Est. Available Cash">To Available</th>}
                {showEst && <th style={{ ...keyCol, textAlign: "center", background: "rgba(21,128,61,0.08)" }}>Est. Available Cash<div style={{ fontWeight: 800, fontSize: 16, color: "var(--text)", textTransform: "none", marginTop: 1 }}>{lastBillWed ?? data?.estimateAsOf}</div></th>}
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <tr><td colSpan={colCount} className="muted small" style={{ padding: 18 }}>Computing from the GL…</td></tr>
              ) : grouped.length === 0 ? (
                <tr><td colSpan={colCount} className="muted small" style={{ padding: 18 }}>No GL uploaded for {year}.</td></tr>
              ) : grouped.map(({ group, rows }) => {
                const gt = groupTotals(rows);
                const isCollapsed = collapsed.has(group);
                return (
                <Fragment key={group}>
                  <tr onClick={() => toggleGroup(group)} style={{ cursor: "pointer" }} title={isCollapsed ? "Expand" : "Collapse"}>
                    <td style={groupHeaderCell}><span style={{ display: "inline-block", width: 16, color: "var(--muted)" }}>{isCollapsed ? "▸" : "▾"}</span>{group}</td>
                    <td style={groupSubCell}>{gt.hasOpening ? money0(gt.opening) : "—"}</td>
                    {view === "detail" ? visibleBuckets.map((b) => <td key={b.code} style={groupSubCell}>{gt.byBucket[b.code] ? money0(gt.byBucket[b.code]) : "—"}</td>)
                      : view === "io" ? (() => { const io = ioFrom(gt.byBucket); return [
                          <td key="in" style={groupSubCell}>{io.cin ? money0(io.cin) : "—"}</td>,
                          <td key="out" style={groupSubCell}>{io.cout ? money0(-io.cout) : "—"}</td>]; })()
                      : <td style={groupSubCell}>{ioFrom(gt.byBucket).net ? money0(ioFrom(gt.byBucket).net) : "—"}</td>}
                    <td style={groupSubCell}>{gt.hasOpening ? money0(gt.ending) : "—"}</td>
                    {showBillsCol && <td style={groupSubCell}>{gt.bills ? money0(gt.bills) : "—"}</td>}
                    {showReservesCol && <td style={groupSubCell}>{gt.reserves ? money0(gt.reserves) : "—"}</td>}
                    {netBridge && (() => { const br = bridgeVal(gt.est, gt.hasOpening ? gt.ending : null); return <td style={groupSubCell}>{br ? money0(br) : "—"}</td>; })()}
                    {showEst && <td style={{ ...groupSubCell, background: "rgba(21,128,61,0.06)" }}>{money0(gt.est)}</td>}
                  </tr>
                  {!isCollapsed && rows.map((r) => laggingKeys.has(r.key) ? (
                    // Behind the snapshot month — blanked out; import its GL to include it.
                    <tr key={r.key} style={{ background: "rgba(217,119,6,0.04)" }}>
                      <td style={{ textAlign: "left" }}>
                        <code style={{ fontSize: 12 }}>{r.propertyCode}</code>
                        <span style={{ marginLeft: 8 }}>{r.name}</span>
                        <BankLinks accounts={(r.bankCodes ? bankAccountsForCodes(r.bankCodes) : bankAccountsForCodes([r.propertyCode, r.key])).filter((a) => (!r.bankLast4 || a.last4 === r.bankLast4) && !r.excludeLast4?.includes(a.last4))} />
                      </td>
                      <td colSpan={colCount - 1} className="muted small" style={{ fontStyle: "italic", color: "#b45309" }}>
                        Posted through {MONTHS[r.maxPeriod - 1]} — import the {MONTHS[glMonth - 1]} {year} GL to include this property in the snapshot.
                      </td>
                    </tr>
                  ) : (
                    <Fragment key={r.key}>
                    <tr title={r.period < r.maxPeriod ? "" : undefined}>
                      <td style={{ textAlign: "left" }}>
                        <code style={{ fontSize: 12 }}>{r.propertyCode}</code>
                        {!r.manual && !r.readOnly && !r.sd ? (
                          <Link href={`/financials/operating-statements?key=${encodeURIComponent(r.key)}&year=${year}&period=${glMonth}`}
                            title="Open this entity's Operating Statement for this month"
                            style={{ marginLeft: 8, color: "#0b4a7d", fontWeight: 600, textDecoration: "none" }}
                            onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
                            onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}>{r.name}</Link>
                        ) : <span style={{ marginLeft: 8 }}>{r.name}</span>}
                        {r.mm && <span style={{ marginLeft: 6 }}><Pill tone={TONE_GREEN}>MM</Pill></span>}
                        {r.isFund && r.breakdown?.length ? (
                          <button type="button" onClick={() => setBreakdown({ name: r.name, rows: r.breakdown! })}
                            title="Show the buildings behind this fund account"
                            style={{ marginLeft: 6, background: "none", border: "none", padding: 0, font: "inherit", color: "var(--muted)", fontWeight: 700, cursor: "pointer", fontSize: 10 }}>▤ {r.breakdown.length}</button>
                        ) : null}
                        <BankLinks accounts={(r.bankCodes ? bankAccountsForCodes(r.bankCodes) : r.isFund && r.breakdown?.length ? bankAccountsForCodes(r.breakdown.map((b) => b.key)) : bankAccountsForCodes([r.propertyCode, r.key])).filter((a) => (!r.bankLast4 || a.last4 === r.bankLast4) && !r.excludeLast4?.includes(a.last4))} />
                      </td>
                      <td style={keyCol} title={r.readOnly ? "Auto-computed balance" : r.manual ? "Manually-entered current balance (no GL feed)" : r.openingOverridden ? "Overridden — clear to use the GL value" : (r.glOpening == null ? "No opening balance captured in this GL upload" : "Opening per GL — type to override")}>
                        {data?.canEditOpening && r.readOnly ? (
                          <input
                            inputMode="decimal" readOnly tabIndex={-1}
                            value={r.startingCash != null ? money0(r.startingCash) : "—"}
                            style={{ width: 96, textAlign: "right", fontWeight: 800, fontSize: 14, fontVariantNumeric: "tabular-nums", border: "1px solid transparent", borderRadius: 6, padding: "2px 6px", background: "transparent", color: "inherit", cursor: "default" }}
                            className="cs-edit"
                          />
                        ) : data?.canEditOpening && r.manual ? (
                          <input
                            inputMode="decimal"
                            value={manualDraft[r.key] ?? (r.startingCash != null ? money0(r.startingCash) : "")}
                            placeholder="—"
                            onChange={(e) => setManualDraft((d) => ({ ...d, [r.key]: e.target.value }))}
                            onBlur={() => saveManual(r, manualDraft[r.key] ?? "")}
                            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                            style={{ width: 96, textAlign: "right", fontWeight: 800, fontSize: 14, fontVariantNumeric: "tabular-nums", border: "1px solid transparent", borderRadius: 6, padding: "2px 6px", background: "transparent", color: r.startingCash == null ? undefined : r.startingCash >= 0 ? "#15803d" : "#b91c1c" }}
                            className="cs-edit"
                          />
                        ) : data?.canEditOpening && !r.manual ? (
                          <input
                            inputMode="decimal"
                            value={openDraft[r.key] ?? (r.openingOverridden && r.startingCash != null ? money0(r.startingCash) : "")}
                            placeholder={r.glOpening != null ? money0(r.glOpening) : "—"}
                            onChange={(e) => setOpenDraft((d) => ({ ...d, [r.key]: e.target.value }))}
                            onBlur={() => { if ((openDraft[r.key] ?? "") !== "") saveOpening(r, openDraft[r.key]); else if (r.openingOverridden) saveOpening(r, ""); }}
                            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                            style={{ width: 96, textAlign: "right", fontWeight: 800, fontSize: 14, fontVariantNumeric: "tabular-nums", border: "1px solid transparent", borderRadius: 6, padding: "2px 6px", background: "transparent", color: r.openingOverridden ? "#b45309" : "inherit" }}
                            className="cs-edit"
                          />
                        ) : money0(r.startingCash)}
                        {!r.manual && r.openingOverridden && r.glOpening != null && r.startingCash != null && (
                          <div title="Starting cash overridden with the actual bank balance" style={{ fontWeight: 600, fontSize: 10, textTransform: "none", color: "var(--muted)" }}>
                            actual · GL {money0(r.glOpening)} · <span style={{ color: Math.abs(r.startingCash - r.glOpening) < 1 ? "#15803d" : "#b45309" }}>{Math.abs(r.startingCash - r.glOpening) < 1 ? "ties" : `${money0(r.startingCash - r.glOpening)} vs GL`}</span>
                          </div>
                        )}
                      </td>
                      {view === "detail" && visibleBuckets.map((b) => {
                        const v = r.byBucket[b.code] ?? 0;
                        // Mortgage P&I scheduled but not yet posted: show the scheduled
                        // amount as an amber estimate, flagged ⚠*; not in Net Change/Ending.
                        if (!v && b.code === 4 && r.debtMissing) {
                          return (
                            <td key={b.code} style={{ ...numCell, color: "#b45309", fontWeight: 700 }}
                              title={`Estimated — scheduled mortgage P&I of ${money0(r.scheduledDebt)} has not posted to the GL yet. Shown for reference; not included in Net Change or Ending Cash until it posts.`}>
                              ⚠ {money0(-r.scheduledDebt)}*
                            </td>
                          );
                        }
                        if (!v) return <td key={b.code} style={{ ...numCell, color: "var(--muted)" }}>—</td>;
                        // Pooled SD account: the deposit movement is summed from the member
                        // properties' GLs, so there's nothing to drill on this row's own key.
                        if (b.code === 8 && r.sd) {
                          return (
                            <td key={b.code} style={{ ...numCell, color: v < 0 ? "#b91c1c" : "#15803d" }}
                              title="Net tenant-deposit movement this month (collected − refunded), pooled from the member properties' GLs">
                              {money0(v)}
                            </td>
                          );
                        }
                        // Interest-bearing account: Receipts is the accrued interest — click for the rate calc, not a GL drill.
                        const isInterest = b.code === 1 && r.interest;
                        return (
                          <td key={b.code} style={{ ...numCell, color: v < 0 ? "#b91c1c" : "#15803d" }}>
                            <button type="button"
                              onClick={() => isInterest ? setInterestModal({ name: r.name, opening: r.interest!.opening, rate: r.interest!.rate, amount: r.interest!.amount, fee: r.interest!.fee }) : openDrill(r, b.code, b.label)}
                              title={isInterest ? "Show the interest calculation" : "Show the GL accounts behind this"}
                              style={{ background: "none", border: "none", padding: 0, font: "inherit", color: "inherit", cursor: "pointer", textDecoration: "none" }}
                              onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
                              onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}>
                              {money0(v)}
                            </button>
                          </td>
                        );
                      })}
                      {view === "io" && (() => { const io = ioFrom(r.byBucket); return (<>
                        <td style={{ ...numCell, color: io.cin ? "#15803d" : "var(--muted)" }}>{io.cin ? <button type="button" onClick={() => setBucketModal({ row: r, filter: "in" })} title="Cash in — click for the category breakdown" style={summaryBtn} onMouseEnter={ulOn} onMouseLeave={ulOff}>{money0(io.cin)}</button> : "—"}</td>
                        <td style={{ ...numCell, color: io.cout ? "#b91c1c" : "var(--muted)" }}>{io.cout ? <button type="button" onClick={() => setBucketModal({ row: r, filter: "out" })} title="Cash out — click for the category breakdown" style={summaryBtn} onMouseEnter={ulOn} onMouseLeave={ulOff}>{money0(-io.cout)}</button> : "—"}</td>
                      </>); })()}
                      {view === "net" && (() => { const io = ioFrom(r.byBucket); return (
                        <td style={{ ...numCell, color: io.net > 0 ? "#15803d" : io.net < 0 ? "#b91c1c" : "var(--muted)" }}>{io.net ? <button type="button" onClick={() => setBucketModal({ row: r, filter: "all" })} title="Net cash movement — click for the category breakdown" style={summaryBtn} onMouseEnter={ulOn} onMouseLeave={ulOff}>{money0(io.net)}</button> : "—"}</td>
                      ); })()}
                      <td style={{ ...keyCol, color: r.startingCash == null || r.endingCash == null ? undefined : r.netChange > 0 ? "#15803d" : r.netChange < 0 ? "#b91c1c" : undefined }}
                        title={`Net change ${money0(r.netChange)}${r.startingCash != null ? ` (Opening ${money0(r.startingCash)})` : ""}`}>
                        {money0(r.endingCash)}
                      </td>
                      {showBillsCol && (
                        <td style={{ ...numCell, color: r.billsMTD ? "#b45309" : "var(--muted)" }}
                          title={r.billsMTD ? "AvidXchange bills paid this month — click for the weekly detail" : "No bills recorded this month"}>
                          {r.billsMTD && r.weeklyBills ? (
                            <button type="button" onClick={() => setBillsModal({ name: r.name, weekly: r.weeklyBills!, total: r.billsMTD! })}
                              style={{ background: "none", border: "none", padding: 0, font: "inherit", color: "inherit", cursor: "pointer", fontWeight: 700 }}
                              onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
                              onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}>
                              {money0(r.billsMTD)}
                            </button>
                          ) : "—"}
                        </td>
                      )}
                      {showReservesCol && (
                        <td style={numCell} title={r.reservesOverridden ? "Reserve overridden — clear to use the budget value" : "Budgeted Big Projects reserve (type to override)"}>
                          {data?.canEditOpening && !r.readOnly ? (
                            <input
                              inputMode="decimal"
                              value={reservesDraft[r.key] ?? (r.reserves ? money0(r.reserves) : "")}
                              placeholder="—"
                              onChange={(e) => setReservesDraft((d) => ({ ...d, [r.key]: e.target.value }))}
                              onBlur={() => { if ((reservesDraft[r.key] ?? "") !== "") saveReserves(r.key, reservesDraft[r.key]); else if (r.reservesOverridden) saveReserves(r.key, ""); }}
                              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                              style={{ width: 90, textAlign: "right", fontVariantNumeric: "tabular-nums", border: "1px solid transparent", borderRadius: 6, padding: "2px 4px", background: "transparent", color: r.reservesOverridden ? "#6d28d9" : "inherit" }}
                              className="cs-edit"
                            />
                          ) : (r.reserves ? money0(r.reserves) : <span className="muted">—</span>)}
                        </td>
                      )}
                      {netBridge && (() => { const br = bridgeVal(estAvail(r), r.endingCash); return (
                        <td style={{ ...numCell, color: br ? "#b91c1c" : "var(--muted)" }}>
                          {br ? (
                            <button type="button" onClick={() => setBridgeModal({ row: r })}
                              title="Reserves + un-posted bills that bridge Ending Cash to Est. Available — click for the breakdown"
                              style={summaryBtn} onMouseEnter={ulOn} onMouseLeave={ulOff}>{money0(br)}</button>
                          ) : "—"}
                        </td>
                      ); })()}
                      {showEst && (
                        <td style={{ ...keyCol, background: "rgba(21,128,61,0.08)" }}
                          title={`${r.estimate ? `From ${MONTHS[r.latestGLMonth - 1]} GL ending ${money0(r.estimate.latestEnding)}: − bills ${money0(r.estimate.bills)} (${r.estimate.months} un-posted mo)` : "GL is current"}${r.reserves ? ` − reserves ${money0(r.reserves)}` : ""}`}>
                          {estAvail(r) != null ? (r.estimate ? money0(estAvail(r)) : <span className="muted">{money0(estAvail(r))}</span>) : "—"}
                        </td>
                      )}
                    </tr>
                    </Fragment>
                  ))}
                </Fragment>
                );
              })}
            </tbody>
            {data && grouped.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 800, background: "rgba(11,74,125,0.05)" }}>
                  <td style={{ textAlign: "left" }}>Portfolio Total</td>
                  <td style={keyCol}>{grand.hasOpening ? money0(grand.opening) : "—"}</td>
                  {view === "detail" ? visibleBuckets.map((b) => <td key={b.code} style={numCell}>{money0(grand.byBucket[b.code] ?? 0)}</td>)
                    : view === "io" ? [
                        <td key="in" style={{ ...numCell, color: "#15803d" }}>{money0(grand.inflows)}</td>,
                        <td key="out" style={{ ...numCell, color: "#b91c1c" }}>{money0(-grand.outflows)}</td>]
                    : <td style={{ ...numCell, color: grand.net > 0 ? "#15803d" : grand.net < 0 ? "#b91c1c" : undefined }}>{money0(grand.net)}</td>}
                  <td style={{ ...keyCol, color: grand.net > 0 ? "#15803d" : grand.net < 0 ? "#b91c1c" : undefined }}
                    title={`Net change ${money0(grand.net)}`}>
                    {grand.hasOpening ? money0(grand.ending) : "—"}
                  </td>
                  {showBillsCol && <td style={{ ...numCell, color: grand.bills ? "#b45309" : "var(--muted)" }}>{grand.bills ? money0(grand.bills) : "—"}</td>}
                  {showReservesCol && <td style={{ ...numCell, color: grand.reserves ? "#6d28d9" : "var(--muted)" }}>{grand.reserves ? money0(grand.reserves) : "—"}</td>}
                  {netBridge && (() => { const br = bridgeVal(estAvailTotal, grand.hasOpening ? grand.ending : null); return <td style={{ ...numCell, color: br ? "#b91c1c" : "var(--muted)" }}>{br ? money0(br) : "—"}</td>; })()}
                  {showEst && <td style={{ ...keyCol, background: "rgba(21,128,61,0.10)" }}>{money0(estAvailTotal)}</td>}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <p className="muted small" style={{ margin: 0 }}>
        {showEst
          ? <><b>Est. Available Cash</b> carries each property&apos;s latest posted GL ending forward through the un-posted month(s) ({data?.gapMonthLabels.join(", ")}) — backing out that period&apos;s AvidXchange bills (which already include any mortgage paid via AP) and the <b>Reserves</b> set aside. No anticipated rent is added — it stays conservative. </>
          : "GL is current through the latest month — Ending Cash is the actual position. "}
        Tip: {view === "detail"
          ? <>click any bucket amount to see the GL accounts behind it; </>
          : <>click a <b>{view === "net" ? "Net Change" : "Cash In / Cash Out"}</b> amount for the category breakdown (each drillable to its GL accounts), or switch to <b>Detail</b> (top right) for all categories at once; </>}
        click a fund name (e.g. JV III) for its building breakdown; click an <b>Avid Bills</b> amount for the week-by-week detail. Override <b>Opening Cash</b> with a property&apos;s actual bank balance and the cell footnotes the GL value + variance, so the tie-out is right there without a separate column.
        {debtMissingRows.length > 0 && <> <span style={{ color: "#b45309", fontWeight: 700 }}>⚠ amber Mortgage P&amp;I with an asterisk (*)</span> is the scheduled debt service — an estimate shown because the actual charge has not posted to the GL yet; it is not rolled into Net Change or Ending Cash.</>}
      </p>

      {interestModal && (
        <div onClick={() => setInterestModal(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "48px 16px 32px", zIndex: 100, overflow: "auto" }}>
          <div onClick={(e) => e.stopPropagation()} className="card" style={{ maxWidth: 440, width: "100%", boxShadow: "0 24px 60px rgba(15,23,42,0.32)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{interestModal.name} — Interest</div>
              <button className="btn" onClick={() => setInterestModal(null)} style={{ padding: "6px 14px" }}>Close</button>
            </div>
            <div className="muted small" style={{ marginBottom: 12 }}>No GL feed — interest is accrued from the balance and rate. {MONTHS[period - 1]} {year}.</div>
            <div className="tableWrap">
              <table>
                <tbody>
                  <tr><td style={{ textAlign: "left" }}>Opening balance</td><td style={numCell}>{money0(interestModal.opening)}</td></tr>
                  <tr><td style={{ textAlign: "left" }}>Annual rate</td><td style={numCell}>{(interestModal.rate * 100).toFixed(2)}%</td></tr>
                  <tr><td style={{ textAlign: "left" }}>Monthly factor</td><td style={numCell}>÷ 12 = {(interestModal.rate / 12 * 100).toFixed(4)}%</td></tr>
                  <tr style={interestModal.fee ? undefined : { borderTop: "1px solid var(--border)", fontWeight: 800 }}>
                    <td style={{ textAlign: "left" }}>Interest this month</td>
                    <td style={{ ...numCell, color: "#15803d", fontWeight: interestModal.fee ? 400 : 800 }}>{money0(interestModal.amount)}</td>
                  </tr>
                  {!!interestModal.fee && (
                    <>
                      <tr><td style={{ textAlign: "left" }}>Less: Paper Statement Charge</td><td style={{ ...numCell, color: "#b91c1c" }}>{money0(-interestModal.fee)}</td></tr>
                      <tr style={{ borderTop: "1px solid var(--border)", fontWeight: 800 }}>
                        <td style={{ textAlign: "left" }}>Net to account</td>
                        <td style={{ ...numCell, color: "#15803d" }}>{money0(interestModal.amount - interestModal.fee)}</td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
            <div className="muted small" style={{ marginTop: 10 }}>
              {money0(interestModal.opening)} × {(interestModal.rate * 100).toFixed(2)}% ÷ 12 = <b>{money0(interestModal.amount)}</b> interest{interestModal.fee ? <>, less the {money0(interestModal.fee)} statement charge</> : null} — booked as Receipts From Operations{interestModal.fee ? " / Operating Expenses" : ""}.
            </div>
          </div>
        </div>
      )}

      {bucketModal && (() => {
        const r = bucketModal.row;
        const items = buckets
          .map((b) => ({ code: b.code, label: b.label, amount: r.byBucket[b.code] ?? 0 }))
          .filter((x) => x.amount !== 0 && (bucketModal.filter === "all" || (bucketModal.filter === "in" ? x.amount > 0 : x.amount < 0)));
        const total = items.reduce((s, x) => s + x.amount, 0);
        const heading = bucketModal.filter === "in" ? "Cash In" : bucketModal.filter === "out" ? "Cash Out" : "Net Change";
        return (
          <div onClick={() => setBucketModal(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "48px 16px 32px", zIndex: 100, overflow: "auto" }}>
            <div onClick={(e) => e.stopPropagation()} className="card" style={{ maxWidth: 480, width: "100%", boxShadow: "0 24px 60px rgba(15,23,42,0.32)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{r.name} — {heading}</div>
                <button className="btn" onClick={() => setBucketModal(null)} style={{ padding: "6px 14px" }}>Close</button>
              </div>
              <div className="muted small" style={{ marginBottom: 12 }}>{MONTHS[period - 1]} {year} · click a category for the GL accounts behind it.</div>
              <div className="tableWrap">
                <table>
                  <thead><tr><th style={{ textAlign: "left" }}>Category</th><th style={numCell}>Amount</th></tr></thead>
                  <tbody>
                    {items.map((x) => {
                      const drillable = !(x.code === 8 && r.sd); // pooled SD movement has no GL on this key
                      return (
                        <tr key={x.code}>
                          <td style={{ textAlign: "left" }}>
                            {drillable ? (
                              <button type="button" onClick={() => { setBucketModal(null); onBucketClick(r, x.code, x.label); }}
                                title="Show the GL accounts behind this" style={summaryBtn} onMouseEnter={ulOn} onMouseLeave={ulOff}>{x.label}</button>
                            ) : x.label}
                          </td>
                          <td style={{ ...numCell, color: x.amount < 0 ? "#b91c1c" : "#15803d" }}>{money0(x.amount)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: "1px solid var(--border)", fontWeight: 800 }}>
                      <td style={{ textAlign: "left" }}>{heading}</td>
                      <td style={{ ...numCell, color: total < 0 ? "#b91c1c" : "#15803d" }}>{money0(total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {bridgeModal && (() => {
        const r = bridgeModal.row;
        const ending = r.endingCash;
        const avail = estAvail(r);
        const reserves = r.reserves ?? 0;
        const bills = r.estimate ? r.estimate.bills : 0;
        const carry = r.estimate ? (r.estimate.latestEnding ?? 0) - (ending ?? 0) : 0; // latest posted vs snapshot ending
        return (
          <div onClick={() => setBridgeModal(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "48px 16px 32px", zIndex: 100, overflow: "auto" }}>
            <div onClick={(e) => e.stopPropagation()} className="card" style={{ maxWidth: 480, width: "100%", boxShadow: "0 24px 60px rgba(15,23,42,0.32)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{r.name} — To Est. Available</div>
                <button className="btn" onClick={() => setBridgeModal(null)} style={{ padding: "6px 14px" }}>Close</button>
              </div>
              <div className="muted small" style={{ marginBottom: 12 }}>Reserves + un-posted bills that bridge Ending Cash to Est. Available. {MONTHS[period - 1]} {year}.</div>
              <div className="tableWrap">
                <table>
                  <tbody>
                    <tr><td style={{ textAlign: "left" }}>Ending Cash</td><td style={numCell}>{money0(ending)}</td></tr>
                    {!!reserves && <tr><td style={{ textAlign: "left" }}>Less: Reserves set aside</td><td style={{ ...numCell, color: "#b91c1c" }}>{money0(-reserves)}</td></tr>}
                    {!!bills && <tr><td style={{ textAlign: "left" }}>Less: Un-posted Avid bills ({r.estimate!.months} mo)</td><td style={{ ...numCell, color: "#b91c1c" }}>{money0(-bills)}</td></tr>}
                    {!!carry && <tr><td style={{ textAlign: "left" }}>Posted-month carry-forward</td><td style={{ ...numCell, color: carry < 0 ? "#b91c1c" : "#15803d" }}>{money0(carry)}</td></tr>}
                    <tr style={{ borderTop: "1px solid var(--border)", fontWeight: 800 }}>
                      <td style={{ textAlign: "left" }}>Est. Available Cash</td>
                      <td style={{ ...numCell, color: "#15803d" }}>{money0(avail)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="muted small" style={{ marginTop: 10 }}>
                Drawdown of <b>{money0(bridgeVal(avail, ending))}</b> from Ending Cash to Est. Available Cash.
              </div>
            </div>
          </div>
        );
      })()}

      {billsModal && (
        <div onClick={() => setBillsModal(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "48px 16px 32px", zIndex: 100, overflow: "auto" }}>
          <div onClick={(e) => e.stopPropagation()} className="card" style={{ maxWidth: 460, width: "100%", boxShadow: "0 24px 60px rgba(15,23,42,0.32)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{billsModal.name} — Avid Bills</div>
              <button className="btn" onClick={() => setBillsModal(null)} style={{ padding: "6px 14px" }}>Close</button>
            </div>
            <div className="muted small" style={{ marginBottom: 12 }}>AvidXchange bills paid by week · {MONTHS[period - 1]} {year}</div>
            <div className="tableWrap">
              <table>
                <thead><tr><th style={{ textAlign: "left" }}>Week of</th><th style={numCell}>Bills Paid</th></tr></thead>
                <tbody>
                  {billsModal.weekly.map((w) => (
                    <tr key={w.wednesday}>
                      <td style={{ textAlign: "left" }}>{weekOfLabel(w.wednesday)}</td>
                      <td style={{ ...numCell, color: w.amount ? "#b45309" : "var(--muted)" }}>{w.amount ? money0(w.amount) : "—"}</td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: "1px solid var(--border)", fontWeight: 800 }}>
                    <td style={{ textAlign: "left" }}>Total</td>
                    <td style={{ ...numCell, color: "#b45309" }}>{money0(billsModal.total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {breakdown && (
        <div onClick={() => setBreakdown(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "48px 16px 32px", zIndex: 100, overflow: "auto" }}>
          <div onClick={(e) => e.stopPropagation()} className="card" style={{ maxWidth: "min(1200px, 96vw)", width: "100%", boxShadow: "0 24px 60px rgba(15,23,42,0.32)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{breakdown.name} — buildings</div>
              <button className="btn" onClick={() => setBreakdown(null)} style={{ padding: "6px 14px" }}>Close</button>
            </div>
            <div className="muted small" style={{ marginBottom: 12 }}>One bank account; the buildings below roll up into the fund line. {ytd ? "YTD through" : ""} {MONTHS[period - 1]} {year}.</div>
            <div className="tableWrap" style={{ overflowX: "auto" }}>
              <table style={{ minWidth: 1040, width: "100%" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", whiteSpace: "nowrap", minWidth: 200 }}>Building</th>
                    <th style={numCell}>Opening</th>
                    {visibleBuckets.map((b) => <th key={b.code} style={headWrap}>{b.label}</th>)}
                    <th style={headWrap}>Net</th>
                    <th style={numCell}>Ending</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.rows.map((br) => (
                    <tr key={br.key}>
                      <td style={{ textAlign: "left", whiteSpace: "nowrap" }}><code style={{ fontSize: 12 }}>{br.key}</code> {br.name}</td>
                      <td style={numCell}>{money0(br.startingCash)}</td>
                      {visibleBuckets.map((b) => <td key={b.code} style={{ ...numCell, color: (br.byBucket[b.code] ?? 0) < 0 ? "#b91c1c" : (br.byBucket[b.code] ?? 0) > 0 ? "#15803d" : "var(--muted)" }}>{br.byBucket[b.code] ? money0(br.byBucket[b.code]) : "—"}</td>)}
                      <td style={{ ...numCell, fontWeight: 700 }}>{money0(br.netChange)}</td>
                      <td style={{ ...numCell, fontWeight: 700 }}>{money0(br.endingCash)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {drill && (
        <div onClick={() => setDrill(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "48px 16px 32px", zIndex: 100, overflow: "auto" }}>
          <div onClick={(e) => e.stopPropagation()} className="card" style={{ maxWidth: 640, width: "100%", boxShadow: "0 24px 60px rgba(15,23,42,0.32)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{drill.label}</div>
              <button className="btn" onClick={() => setDrill(null)} style={{ padding: "6px 14px" }}>Close</button>
            </div>
            <div className="muted small" style={{ marginBottom: 12 }}>{drill.propName} · {ytd ? "YTD through" : ""} {MONTHS[period - 1]} {year} · GL accounts</div>
            {drillLoading ? (
              <div className="muted small">Loading…</div>
            ) : !drillData?.accounts.length ? (
              <div className="muted small">No GL accounts for this bucket.</div>
            ) : (
              <div className="tableWrap">
                <table>
                  <thead><tr><th style={{ textAlign: "left" }}>Account</th><th style={{ textAlign: "left" }}>Description</th><th style={numCell}>Amount</th></tr></thead>
                  <tbody>
                    {drillData.accounts.map((a) => (
                      <tr key={a.account}>
                        <td style={{ textAlign: "left" }}><code style={{ fontSize: 12 }}>{a.account}</code></td>
                        <td style={{ textAlign: "left" }}>{a.name || <span className="muted">—</span>}</td>
                        <td style={{ ...numCell, color: a.amount < 0 ? "#b91c1c" : "#15803d" }}>{money0(a.amount)}</td>
                      </tr>
                    ))}
                    <tr style={{ borderTop: "1px solid var(--border)", fontWeight: 800 }}>
                      <td style={{ textAlign: "left" }}>Total</td>
                      <td />
                      <td style={{ ...numCell, color: drillData.total < 0 ? "#b91c1c" : "#15803d" }}>{money0(drillData.total)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

"use client";

// Cash Sheet — the unified cash-management page (formerly "Cash Analysis"; the
// old weekly Cash Sheet was merged in). Lists every property/entity bank account
// with its cash position: monthly cash-flow buckets computed from the uploaded
// GL (account→code map ported from the legacy workbook), non-GL accounts as flat
// manual balances, and an "Est. Cash Today" column that carries each balance
// forward through the weekly AvidXchange bills for months not yet posted.
// Receipts are positive inflows; expenses/outflows negative; Net Change = the
// row sum (the change in operating cash).

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StatPill, Pill, Badge, TONE_RED, TONE_AMBER } from "@/app/components/Pill";
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
  isFund?: boolean; manual?: boolean; readOnly?: boolean; bankCodes?: string[]; bankLast4?: string; excludeLast4?: string[]; breakdown?: Breakdown[];
  billsMTD?: number; weeklyBills?: { wednesday: string; amount: number }[];
  reserves?: number; reservesAuto?: number; reservesOverridden?: boolean;
  interest?: { opening: number; rate: number; amount: number; fee: number };
};
type Payload = { year: number; period: number; ytd: boolean; buckets: Bucket[]; rows: Row[]; canEdit: boolean; canEditOpening: boolean; ym: string; estimateAsOf: string | null; gapMonthLabels: string[]; latestPostedPeriod: number; lastImport: { at: string; by: string | null } | null; generatedAt: string };

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
const GROUP_ORDER = ["Business Parks", "Eastwick Joint Venture", "Shopping Centers", "LIK Management", "GP / LP – Property Owner", "Nockamixon", "Korman Homes", "Other"];

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
  // Editable opening-cash override (shared with the Cash Sheet) + fund breakdown modal.
  const [openDraft, setOpenDraft] = useState<Record<string, string>>({});
  const [manualDraft, setManualDraft] = useState<Record<string, string>>({});
  const [reservesDraft, setReservesDraft] = useState<Record<string, string>>({});
  const [breakdown, setBreakdown] = useState<{ name: string; rows: Breakdown[] } | null>(null);
  // Weekly AvidXchange bills drill-down (per-Wednesday detail behind a row's Avid Bills).
  const [billsModal, setBillsModal] = useState<{ name: string; weekly: { wednesday: string; amount: number }[]; total: number } | null>(null);
  // Interest-bearing accounts: clicking Receipts shows the rate calc, not a GL drill.
  const [interestModal, setInterestModal] = useState<{ name: string; opening: number; rate: number; amount: number; fee: number } | null>(null);
  // Weekly AvidXchange bills — the bridge that keeps the monthly GL position
  // current between postings. Uploaded here, consumed by "Est. Cash Today".
  const apRef = useRef<HTMLInputElement | null>(null);
  const didDefaultPeriod = useRef(false); // center on the latest posted month once on first load
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

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/financials/cash-analysis?year=${year}&period=${period}&ytd=${ytd ? 1 : 0}`)
      .then((r) => r.json())
      .then((j: Payload & { error?: string }) => {
        if (j.error) { setError(j.error); return; }
        // On first load, center the snapshot on the latest posted month (you post
        // a month after it closes, so "current" data is the prior month).
        if (!didDefaultPeriod.current) {
          didDefaultPeriod.current = true;
          if (!ytd && j.latestPostedPeriod && j.latestPostedPeriod !== period) { setPeriod(j.latestPostedPeriod); return; }
        }
        setData(j); setError(null);
      })
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
    for (const g of Object.values(by)) g.sort((a, b) => a.propertyCode.localeCompare(b.propertyCode));
    return GROUP_ORDER.filter((g) => by[g]?.length).map((g) => ({ group: g, rows: by[g] }));
  }, [data]);

  const grand = useMemo(() => {
    const byBucket: Record<string, number> = {};
    let inflows = 0, outflows = 0, opening = 0, ending = 0, bills = 0, reserves = 0, hasOpening = false;
    for (const r of data?.rows ?? []) {
      // Behind properties are excluded from the snapshot (their row is blanked).
      if (!r.manual && !r.readOnly && !ytd && period > r.maxPeriod) continue;
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
  const laggingRows = (data?.rows ?? []).filter((r) => !r.manual && !r.readOnly && !ytd && period > r.maxPeriod);
  const laggingKeys = new Set(laggingRows.map((r) => r.key));
  const dates = periodDates(year, period, ytd);
  const showEst = !!data?.estimateAsOf;
  const showBills = (data?.rows ?? []).some((r) => (r.billsMTD ?? 0) !== 0);
  const showReserves = !!data && (data.canEdit || (data.rows ?? []).some((r) => (r.reserves ?? 0) !== 0));
  // Est. Available Cash = projected (or current) cash less the reserve set-aside.
  const estAvail = (r: Row): number | null => {
    const base = r.estimate?.estimatedCash ?? r.endingCash;
    return base == null ? null : base - (r.reserves ?? 0);
  };
  const estAvailTotal = (data?.rows ?? []).reduce((s, r) => laggingKeys.has(r.key) ? s : s + (estAvail(r) ?? 0), 0);
  const colCount = visibleBuckets.length + 4 + (showBills ? 1 : 0) + (showReserves ? 1 : 0) + (showEst ? 1 : 0); // asof + entity + opening + buckets + ending (+ bills) (+ reserves) (+ est)

  return (
    <main style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: "none", width: "100%" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Cash Sheet</h1>
          <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text)", marginBottom: 4 }}>
            Snapshot · {ytd ? "Year to date" : MONTHS[period - 1] + " " + year} <span style={{ color: "var(--muted)", fontWeight: 600 }}>({dates.range})</span>
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            Every property and entity bank account with its cash position — monthly actuals computed from the GL (click any bucket to drill to its accounts), with <b>Est. Cash Today</b> carrying each balance forward through the weekly AvidXchange bills for the months not yet posted.
          </p>
          <LastImported at={data?.lastImport?.at} by={data?.lastImport?.by} label="GL last imported" />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {data?.canEdit && (
            <>
              <button className="btn primary" onClick={() => apRef.current?.click()} disabled={apUploading} style={{ fontSize: 13, padding: "6px 12px", fontWeight: 700 }} title="Drop the weekly AP AutoPay Selections Reports (JV III, NI LLC, Condo, all-other) to auto-fill the week's bills">
                {apUploading ? "Uploading…" : "Upload AP Report"}
              </button>
              <input ref={apRef} type="file" accept=".xls,.xlsx,.pdf" multiple style={{ display: "none" }} onChange={onApUpload} />
            </>
          )}
          <button className="btn" onClick={() => setYear((y) => y - 1)} style={{ padding: "6px 10px", fontWeight: 900 }}>←</button>
          <span style={{ fontWeight: 800, fontSize: 15, minWidth: 44, textAlign: "center" }}>{year}</span>
          <button className="btn" onClick={() => setYear((y) => y + 1)} style={{ padding: "6px 10px", fontWeight: 900 }}>→</button>
          <select value={period} onChange={(e) => setPeriod(Number(e.target.value))}
            style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontWeight: 700 }}>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 }}>
            <input type="checkbox" checked={ytd} onChange={(e) => setYtd(e.target.checked)} /> YTD
          </label>
        </div>
      </div>

      {error && <div className="small" style={{ color: "#b91c1c", fontWeight: 700 }}>· {error}</div>}

      {apSummary && (
        <div className="small" style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(21,128,61,0.08)", border: "1px solid rgba(21,128,61,0.35)", color: "#15803d", fontWeight: 700 }}>
          ✓ Filled {apSummary.count} {apSummary.count === 1 ? "property" : "properties"} · {money0(apSummary.total)} for the {weekOfLabel(apSummary.wednesday).toLowerCase()} from the AP Selection Report.
        </div>
      )}

      {laggingRows.length > 0 && (
        <div className="card" style={{ padding: "12px 16px", borderLeft: "3px solid #d97706" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, fontWeight: 800, color: "#b45309", fontSize: 14 }}>
            <span>⚠ Snapshot blends time periods</span><Badge>{laggingRows.length}</Badge>
          </div>
          <div className="muted small" style={{ marginBottom: 8 }}>
            These aren&apos;t on the <b>{MONTHS[period - 1]} {year}</b> snapshot yet — their GL is only posted through an earlier month. Import their {MONTHS[period - 1]} {year} GL so the whole sheet is one point in time.
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
        <StatPill label={`Opening Cash · ${dates.openShort}`} value={grand.hasOpening ? money0(grand.opening) : "—"} />
        <StatPill label="Total Cash Inflows" value={money0(grand.inflows)} accent="#15803d" />
        <StatPill label="Total Cash Outflows" value={money0(grand.outflows)} accent="#b91c1c" />
        <StatPill label={`Ending Cash · ${dates.endShort}`} value={grand.hasOpening ? money0(grand.ending) : "—"} accent="#0b4a7d" />
        <StatPill label="Est. Available Cash" value={money0(estAvailTotal)} accent="#15803d" />
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="tableWrap" style={{ overflowX: "auto" }}>
          <table style={{ minWidth: 1100, width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", width: 56, color: "var(--muted)", fontSize: 11 }} title="Month the figures are as of (GL posted through), or Manual for hand-entered balances">As Of</th>
                <th style={{ textAlign: "left", minWidth: 260 }}>Entity</th>
                <th style={keyCol}>Opening Cash<div style={{ fontWeight: 700, fontSize: 13, color: "var(--text)", textTransform: "none" }}>{dates.openShort}</div></th>
                {visibleBuckets.map((b) => <th key={b.code} style={headWrap}>{b.label}</th>)}
                <th style={keyCol}>Ending Cash<div style={{ fontWeight: 700, fontSize: 13, color: "var(--text)", textTransform: "none" }}>{dates.endShort}</div></th>
                {showBills && <th style={headWrap} title="AvidXchange bills paid this month — click a row for the weekly detail">Avid Bills</th>}
                {showReserves && <th style={headWrap} title="Budgeted Big Projects reserve set aside (from the budget; type to override)">Reserves</th>}
                {showEst && <th style={{ ...keyCol, background: "rgba(21,128,61,0.08)" }}>Est. Available Cash<div style={{ fontWeight: 600, fontSize: 10, color: "var(--muted)", textTransform: "none" }}>{data?.estimateAsOf} · net of reserves</div></th>}
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <tr><td colSpan={colCount} className="muted small" style={{ padding: 18 }}>Computing from the GL…</td></tr>
              ) : grouped.length === 0 ? (
                <tr><td colSpan={colCount} className="muted small" style={{ padding: 18 }}>No GL uploaded for {year}.</td></tr>
              ) : grouped.map(({ group, rows }) => (
                <Fragment key={group}>
                  <tr><td colSpan={colCount} style={groupHeaderCell}>{group}</td></tr>
                  {rows.map((r) => laggingKeys.has(r.key) ? (
                    // Behind the snapshot month — blanked out; import its GL to include it.
                    <tr key={r.key} style={{ background: "rgba(217,119,6,0.04)" }}>
                      <td style={{ textAlign: "left", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", color: "#b45309" }} title={`Posted through ${MONTHS[r.maxPeriod - 1]} ${year}`}>{MONTHS[r.maxPeriod - 1]}</td>
                      <td style={{ textAlign: "left" }}>
                        <code style={{ fontSize: 12 }}>{r.propertyCode}</code>
                        <span style={{ marginLeft: 8 }}>{r.name}</span>
                        <BankLinks accounts={(r.bankCodes ? bankAccountsForCodes(r.bankCodes) : bankAccountsForCodes([r.propertyCode, r.key])).filter((a) => (!r.bankLast4 || a.last4 === r.bankLast4) && !r.excludeLast4?.includes(a.last4))} />
                      </td>
                      <td colSpan={colCount - 2} className="muted small" style={{ fontStyle: "italic", color: "#b45309" }}>
                        Import the {MONTHS[period - 1]} {year} GL to include this property in the snapshot.
                      </td>
                    </tr>
                  ) : (
                    <Fragment key={r.key}>
                    <tr title={r.period < r.maxPeriod ? "" : undefined}>
                      <td style={{ textAlign: "left", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", color: "var(--muted)" }}
                        title={r.manual ? "Manually-entered balance (no GL feed)" : r.readOnly ? "Auto-computed balance" : `GL posted through ${MONTHS[r.maxPeriod - 1]} ${year}`}>
                        {r.manual ? "Manual" : MONTHS[r.maxPeriod - 1]}
                      </td>
                      <td style={{ textAlign: "left" }}>
                        <code style={{ fontSize: 12 }}>{r.propertyCode}</code>
                        {r.isFund && r.breakdown?.length ? (
                          <button type="button" onClick={() => setBreakdown({ name: r.name, rows: r.breakdown! })}
                            title="Show the buildings behind this fund account"
                            style={{ marginLeft: 8, background: "none", border: "none", padding: 0, font: "inherit", color: "#0b4a7d", fontWeight: 700, cursor: "pointer" }}>
                            {r.name} <span style={{ fontSize: 10, opacity: 0.7 }}>▤ {r.breakdown.length}</span>
                          </button>
                        ) : <span style={{ marginLeft: 8 }}>{r.name}</span>}
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
                      {visibleBuckets.map((b) => {
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
                      <td style={{ ...keyCol, color: r.startingCash == null || r.endingCash == null ? undefined : r.netChange > 0 ? "#15803d" : r.netChange < 0 ? "#b91c1c" : undefined }}
                        title={`Net change ${money0(r.netChange)}${r.startingCash != null ? ` (Opening ${money0(r.startingCash)})` : ""}`}>
                        {money0(r.endingCash)}
                      </td>
                      {showBills && (
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
                      {showReserves && (
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
                      {showEst && (
                        <td style={{ ...keyCol, background: "rgba(21,128,61,0.08)" }}
                          title={`${r.estimate ? `From ${MONTHS[r.latestGLMonth - 1]} GL ending ${money0(r.estimate.latestEnding)}: + receipts ${money0(r.estimate.revenue)} − bills ${money0(r.estimate.bills)} − mortgage ${money0(r.estimate.mortgage)} (${r.estimate.months} un-posted mo)` : "GL is current"}${r.reserves ? ` − reserves ${money0(r.reserves)}` : ""}`}>
                          {estAvail(r) != null ? (r.estimate ? money0(estAvail(r)) : <span className="muted">{money0(estAvail(r))}</span>) : "—"}
                        </td>
                      )}
                    </tr>
                    </Fragment>
                  ))}
                </Fragment>
              ))}
            </tbody>
            {data && grouped.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 800, background: "rgba(11,74,125,0.05)" }}>
                  <td />
                  <td style={{ textAlign: "left" }}>Portfolio Total</td>
                  <td style={keyCol}>{grand.hasOpening ? money0(grand.opening) : "—"}</td>
                  {visibleBuckets.map((b) => <td key={b.code} style={numCell}>{money0(grand.byBucket[b.code] ?? 0)}</td>)}
                  <td style={{ ...keyCol, color: grand.net > 0 ? "#15803d" : grand.net < 0 ? "#b91c1c" : undefined }}
                    title={`Net change ${money0(grand.net)}`}>
                    {grand.hasOpening ? money0(grand.ending) : "—"}
                  </td>
                  {showBills && <td style={{ ...numCell, color: grand.bills ? "#b45309" : "var(--muted)" }}>{grand.bills ? money0(grand.bills) : "—"}</td>}
                  {showReserves && <td style={{ ...numCell, color: grand.reserves ? "#6d28d9" : "var(--muted)" }}>{grand.reserves ? money0(grand.reserves) : "—"}</td>}
                  {showEst && <td style={{ ...keyCol, background: "rgba(21,128,61,0.10)" }}>{money0(estAvailTotal)}</td>}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <p className="muted small" style={{ margin: 0 }}>
        {showEst
          ? <><b>Est. Available Cash</b> carries each property&apos;s latest posted GL ending forward through the un-posted month(s) ({data?.gapMonthLabels.join(", ")}) — adding expected receipts, subtracting that month&apos;s AvidXchange bills + scheduled mortgage, then netting out the <b>Reserves</b> set aside. It&apos;s an estimate until those months post to the GL. </>
          : "GL is current through the latest month — Ending Cash is the actual position. "}
        Tip: click any bucket amount to see the GL accounts behind it; click a fund name (e.g. JV III) for its building breakdown; click an <b>Avid Bills</b> amount for the week-by-week detail. Override <b>Opening Cash</b> with a property&apos;s actual bank balance and the cell footnotes the GL value + variance, so the tie-out is right there without a separate column.
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
          <div onClick={(e) => e.stopPropagation()} className="card" style={{ maxWidth: 760, width: "100%", boxShadow: "0 24px 60px rgba(15,23,42,0.32)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{breakdown.name} — buildings</div>
              <button className="btn" onClick={() => setBreakdown(null)} style={{ padding: "6px 14px" }}>Close</button>
            </div>
            <div className="muted small" style={{ marginBottom: 12 }}>One bank account; the buildings below roll up into the fund line. {ytd ? "YTD through" : ""} {MONTHS[period - 1]} {year}.</div>
            <div className="tableWrap" style={{ overflowX: "auto" }}>
              <table style={{ minWidth: 720 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left" }}>Building</th>
                    <th style={numCell}>Opening</th>
                    {visibleBuckets.map((b) => <th key={b.code} style={headWrap}>{b.label}</th>)}
                    <th style={headWrap}>Net</th>
                    <th style={numCell}>Ending</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.rows.map((br) => (
                    <tr key={br.key}>
                      <td style={{ textAlign: "left" }}><code style={{ fontSize: 12 }}>{br.key}</code> {br.name}</td>
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

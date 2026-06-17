"use client";

// Cash Analysis (DRAFT) — computes each property's monthly cash-flow buckets
// straight from the uploaded GL, using the account→code map ported from the
// legacy workbook. Read-only; kept as a draft until it ties out against the
// December CASH ANALYSIS. Receipts are positive inflows; expenses/outflows
// negative; Net Change = the row sum (the change in operating cash).

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { StatPill } from "@/app/components/Pill";

type Bucket = { code: number; label: string };
type Row = {
  key: string; propertyCode: string; name: string; group: string;
  period: number; maxPeriod: number;
  byBucket: Record<string, number>; netChange: number;
  startingCash: number | null; endingCash: number | null;
  scheduledDebt: number; debtExpected: boolean; debtPosted: boolean; debtMissing: boolean;
  unmappedCount: number; unmapped: { account: string; amount: number; name?: string | null }[];
};
type Payload = { year: number; period: number; ytd: boolean; buckets: Bucket[]; rows: Row[]; generatedAt: string };

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function money0(n: number | null): string {
  if (n == null) return "—";
  const v = Math.round(n);
  const s = Math.abs(v).toLocaleString("en-US");
  return v < 0 ? `($${s})` : `$${s}`;
}
const numCell: React.CSSProperties = { textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
// Opening / Ending cash are the headline numbers — give them a prominent, tinted column.
const keyCol: React.CSSProperties = { ...numCell, fontWeight: 800, fontSize: 14, background: "rgba(11,74,125,0.06)" };
function periodDates(year: number, period: number, ytd: boolean) {
  const endDay = new Date(year, period, 0).getDate(); // last day of the period month
  const end = `${MONTHS[period - 1]} ${endDay}, ${year}`;
  const open = ytd ? `Jan 1, ${year}` : `${MONTHS[period - 1]} 1, ${year}`;
  return { open, end, range: `${open} – ${end}` };
}
const groupHeaderCell: React.CSSProperties = {
  textAlign: "left", fontSize: 13, fontWeight: 800, textTransform: "uppercase",
  letterSpacing: "0.06em", color: "var(--text)", background: "rgba(15,23,42,0.04)",
  padding: "10px 12px", borderTop: "2px solid var(--border)",
};
const GROUP_ORDER = ["Business Parks", "Eastwick Joint Venture", "Shopping Centers", "LIK Management", "GP / LP – Property Owner", "Nockamixon", "Korman Homes", "Other"];

export default function CashAnalysisDraftPage({ embedded = false }: { embedded?: boolean } = {}) {
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
      .then((j: Payload & { error?: string }) => { if (j.error) setError(j.error); else { setData(j); setError(null); } })
      .catch((e) => setError(e?.message ?? "Failed to load"))
      .finally(() => setLoading(false));
  }, [year, period, ytd]);
  useEffect(() => { load(); }, [load]);

  const buckets = data?.buckets ?? [];
  const grouped = useMemo(() => {
    const by: Record<string, Row[]> = {};
    for (const r of data?.rows ?? []) (by[r.group] = by[r.group] || []).push(r);
    for (const g of Object.values(by)) g.sort((a, b) => a.propertyCode.localeCompare(b.propertyCode));
    return GROUP_ORDER.filter((g) => by[g]?.length).map((g) => ({ group: g, rows: by[g] }));
  }, [data]);

  const grand = useMemo(() => {
    const byBucket: Record<string, number> = {};
    let net = 0, opening = 0, ending = 0, hasOpening = false;
    for (const r of data?.rows ?? []) {
      for (const b of buckets) byBucket[b.code] = (byBucket[b.code] ?? 0) + (r.byBucket[b.code] ?? 0);
      net += r.netChange;
      if (r.startingCash != null) { opening += r.startingCash; ending += (r.endingCash ?? 0); hasOpening = true; }
    }
    return { byBucket, net, opening, ending, hasOpening };
  }, [data, buckets]);

  const totalUnmapped = (data?.rows ?? []).reduce((s, r) => s + r.unmappedCount, 0);
  const debtMissingRows = (data?.rows ?? []).filter((r) => r.debtMissing);
  const dates = periodDates(year, period, ytd);
  const colCount = buckets.length + 4; // entity + opening + buckets + net + ending

  const Outer = (embedded ? "section" : "main") as "section";
  return (
    <Outer style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div>
          {embedded ? (
            <div style={{ fontSize: 15, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
              Cash Flow <span style={{ fontWeight: 600, color: "var(--muted)", textTransform: "none", letterSpacing: 0 }}>· from the GL · monthly</span>
            </div>
          ) : (
            <>
              <div style={{ display: "inline-block", fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", color: "#b45309", background: "rgba(180,83,9,0.12)", border: "1px solid rgba(180,83,9,0.35)", borderRadius: 999, padding: "2px 10px", marginBottom: 6 }}>DRAFT — verifying accuracy</div>
              <h1 style={{ marginBottom: 4 }}>Cash Analysis</h1>
            </>
          )}
          <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text)", marginBottom: 4 }}>
            {ytd ? "Year to date" : MONTHS[period - 1] + " " + year} · <span style={{ color: "var(--muted)", fontWeight: 600 }}>{dates.range}</span>
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            Each property&apos;s cash flow, computed from the uploaded GL via the account→bucket map ported from the legacy workbook. Inflows positive, outflows negative; Net Change = the row total. Click any bucket to drill to its GL accounts.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
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

      {debtMissingRows.length > 0 && (
        <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.35)", color: "#b91c1c", fontSize: 13 }}>
          <b>⚠ Debt expected but not posted</b> for {ytd ? "the year" : MONTHS[period - 1]}:{" "}
          {debtMissingRows.map((r, i) => (
            <span key={r.key}>{i > 0 ? ", " : ""}<b>{r.propertyCode}</b> {r.name} (scheduled {money0(r.scheduledDebt)})</span>
          ))}
          . These properties have a loan but their Mortgage P&amp;I posted $0 — the charge may not be entered, or the GL needs re-uploading.
        </div>
      )}

      {data && data.rows.length > 0 && (
        <div className="card" style={{ padding: "12px 16px", fontSize: 14 }}>
          <b>{dates.range}:</b>{" "}
          {grand.hasOpening
            ? <>Opening <b>{money0(grand.opening)}</b> → Ending <b>{money0(grand.ending)}</b>, </>
            : null}
          a net cash {grand.net >= 0 ? "increase" : "decrease"} of <b style={{ color: grand.net >= 0 ? "#15803d" : "#b91c1c" }}>{money0(Math.abs(grand.net))}</b> across {data.rows.length} properties
          {debtMissingRows.length > 0 && <> · <b style={{ color: "#b91c1c" }}>{debtMissingRows.length} with debt not posted</b></>}
          {totalUnmapped > 0 && <> · <b style={{ color: "#b45309" }}>{totalUnmapped} line{totalUnmapped === 1 ? "" : "s"} to review</b></>}.
        </div>
      )}

      <div className="pills" style={{ justifyContent: "flex-start" }}>
        <StatPill label={`Opening Cash · ${dates.open}`} value={grand.hasOpening ? money0(grand.opening) : "—"} />
        <StatPill label={`Net Change · ${ytd ? "YTD" : MONTHS[period - 1]}`} value={money0(grand.net)} accent={grand.net >= 0 ? "#15803d" : "#b91c1c"} />
        <StatPill label={`Ending Cash · ${dates.end}`} value={grand.hasOpening ? money0(grand.ending) : "—"} accent="#0b4a7d" />
        <StatPill label="Properties" value={data?.rows.length ?? 0} />
        {debtMissingRows.length > 0 && <StatPill label="Debt Not Posted" value={debtMissingRows.length} accent="#b91c1c" />}
        <StatPill label="Unmapped GL lines" value={totalUnmapped} accent={totalUnmapped > 0 ? "#b45309" : "#15803d"} sub={totalUnmapped > 0 ? "review below" : "all coded"} />
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="tableWrap" style={{ overflowX: "auto" }}>
          <table style={{ minWidth: 1100 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Entity</th>
                <th style={keyCol}>Opening Cash<div style={{ fontWeight: 600, fontSize: 10, color: "var(--muted)", textTransform: "none" }}>{dates.open}</div></th>
                {buckets.map((b) => <th key={b.code} style={numCell}>{b.label}</th>)}
                <th style={numCell}>Net Change</th>
                <th style={keyCol}>Ending Cash<div style={{ fontWeight: 600, fontSize: 10, color: "var(--muted)", textTransform: "none" }}>{dates.end}</div></th>
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
                  {rows.map((r) => (
                    <tr key={r.key} title={r.period < r.maxPeriod ? "" : undefined}>
                      <td style={{ textAlign: "left" }}>
                        <code style={{ fontSize: 12 }}>{r.propertyCode}</code>
                        <span style={{ marginLeft: 8 }}>{r.name}</span>
                        {r.unmappedCount > 0 && <span title={`${r.unmappedCount} GL line(s) with activity not coded`} style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: "#b45309" }}>⚠ {r.unmappedCount}</span>}
                        {r.debtMissing && <span title={`Loan scheduled (${money0(r.scheduledDebt)}) but $0 posted`} style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: "#b91c1c" }}>⚠ debt $0</span>}
                      </td>
                      <td style={keyCol} title={r.startingCash == null ? "No opening balance captured in this GL upload" : undefined}>{money0(r.startingCash)}</td>
                      {buckets.map((b) => {
                        const v = r.byBucket[b.code] ?? 0;
                        if (!v) return <td key={b.code} style={{ ...numCell, color: "var(--muted)" }}>—</td>;
                        return (
                          <td key={b.code} style={{ ...numCell, color: v < 0 ? "#b91c1c" : "#15803d" }}>
                            <button type="button" onClick={() => openDrill(r, b.code, b.label)}
                              title="Show the GL accounts behind this"
                              style={{ background: "none", border: "none", padding: 0, font: "inherit", color: "inherit", cursor: "pointer", textDecoration: "none" }}
                              onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
                              onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}>
                              {money0(v)}
                            </button>
                          </td>
                        );
                      })}
                      <td style={{ ...numCell, fontWeight: 800, color: r.netChange >= 0 ? "#15803d" : "#b91c1c" }}>{money0(r.netChange)}</td>
                      <td style={keyCol}>{money0(r.endingCash)}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
            {data && grouped.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 800, background: "rgba(11,74,125,0.05)" }}>
                  <td style={{ textAlign: "left" }}>Portfolio Total</td>
                  <td style={keyCol}>{grand.hasOpening ? money0(grand.opening) : "—"}</td>
                  {buckets.map((b) => <td key={b.code} style={numCell}>{money0(grand.byBucket[b.code] ?? 0)}</td>)}
                  <td style={{ ...numCell, color: grand.net >= 0 ? "#15803d" : "#b91c1c" }}>{money0(grand.net)}</td>
                  <td style={keyCol}>{grand.hasOpening ? money0(grand.ending) : "—"}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Unmapped review — accounts with activity that carry no code yet. */}
      {(data?.rows ?? []).some((r) => r.unmapped.length > 0) && (
        <div className="card">
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>Unmapped GL lines (review)</div>
          <p className="muted small" style={{ marginTop: 0 }}>Accounts with activity this period that aren&apos;t in the code map — they&apos;re excluded from the buckets until tagged. If any are real cash items, tell me the bucket and I&apos;ll add them.</p>
          <div className="tableWrap">
            <table>
              <thead><tr><th style={{ textAlign: "left" }}>Entity</th><th style={{ textAlign: "left" }}>Account</th><th style={{ textAlign: "left" }}>Description</th><th style={numCell}>Amount</th></tr></thead>
              <tbody>
                {(data?.rows ?? []).flatMap((r) => r.unmapped.map((u) => (
                  <tr key={`${r.key}-${u.account}`}>
                    <td style={{ textAlign: "left" }}><code style={{ fontSize: 12 }}>{r.propertyCode}</code> {r.name}</td>
                    <td style={{ textAlign: "left" }}><code style={{ fontSize: 12 }}>{u.account}</code></td>
                    <td style={{ textAlign: "left" }}>{u.name || <span className="muted">—</span>}</td>
                    <td style={{ ...numCell, color: u.amount < 0 ? "#b91c1c" : "#15803d" }}>{money0(u.amount)}</td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="muted small" style={{ margin: 0 }}>
        Draft for verification — compare to the December CASH ANALYSIS. Once it ties, we wire the weekly overlay (AvidXchange bills + mortgage) and the bank tie-out, then promote it. Tip: click any bucket amount to see the GL accounts behind it.
      </p>

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
    </Outer>
  );
}

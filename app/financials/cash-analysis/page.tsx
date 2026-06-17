"use client";

// Cash Analysis (DRAFT) — computes each property's monthly cash-flow buckets
// straight from the uploaded GL, using the account→code map ported from the
// legacy workbook. Read-only; kept as a draft until it ties out against the
// December CASH ANALYSIS. Receipts are positive inflows; expenses/outflows
// negative; Net Change = the row sum (the change in operating cash).

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { StatPill } from "@/app/components/Pill";

type Bucket = { code: number; label: string };
type Row = {
  key: string; propertyCode: string; name: string; group: string;
  period: number; maxPeriod: number;
  byBucket: Record<string, number>; netChange: number;
  startingCash: number | null; endingCash: number | null;
  unmappedCount: number; unmapped: { account: string; amount: number }[];
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
const groupHeaderCell: React.CSSProperties = {
  textAlign: "left", fontSize: 13, fontWeight: 800, textTransform: "uppercase",
  letterSpacing: "0.06em", color: "var(--text)", background: "rgba(15,23,42,0.04)",
  padding: "10px 12px", borderTop: "2px solid var(--border)",
};
const GROUP_ORDER = ["Business Parks", "Eastwick Joint Venture", "Shopping Centers", "LIK Management", "GP / LP – Property Owner", "Nockamixon", "Korman Homes", "Other"];

export default function CashAnalysisDraftPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [period, setPeriod] = useState(now.getMonth() + 1);
  const [ytd, setYtd] = useState(false);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    let net = 0;
    for (const r of data?.rows ?? []) {
      for (const b of buckets) byBucket[b.code] = (byBucket[b.code] ?? 0) + (r.byBucket[b.code] ?? 0);
      net += r.netChange;
    }
    return { byBucket, net };
  }, [data, buckets]);

  const totalUnmapped = (data?.rows ?? []).reduce((s, r) => s + r.unmappedCount, 0);
  const colCount = 2 + buckets.length + 1;

  return (
    <main style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "inline-block", fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", color: "#b45309", background: "rgba(180,83,9,0.12)", border: "1px solid rgba(180,83,9,0.35)", borderRadius: 999, padding: "2px 10px", marginBottom: 6 }}>DRAFT — verifying accuracy</div>
          <h1 style={{ marginBottom: 4 }}>Cash Analysis</h1>
          <p className="muted small" style={{ margin: 0 }}>
            Each property&apos;s cash flow, computed from the uploaded GL via the account→bucket map ported from the legacy workbook. Inflows positive, outflows negative; Net Change = the row total.{" "}
            <Link href="/financials/cash-position" style={{ color: "var(--brand)", fontWeight: 600 }}>Cash Position →</Link>
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

      <div className="pills" style={{ justifyContent: "flex-start" }}>
        <StatPill label={`Net Change · ${ytd ? "YTD" : MONTHS[period - 1]}`} value={money0(grand.net)} accent={grand.net >= 0 ? "#15803d" : "#b91c1c"} />
        <StatPill label="Properties" value={data?.rows.length ?? 0} accent="#0b4a7d" />
        <StatPill label="Unmapped GL lines" value={totalUnmapped} accent={totalUnmapped > 0 ? "#b45309" : "#15803d"} sub={totalUnmapped > 0 ? "review below" : "all coded"} />
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="tableWrap" style={{ overflowX: "auto" }}>
          <table style={{ minWidth: 1100 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Entity</th>
                {buckets.map((b) => <th key={b.code} style={numCell}>{b.label}</th>)}
                <th style={numCell}>Net Change</th>
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
                      </td>
                      {buckets.map((b) => {
                        const v = r.byBucket[b.code] ?? 0;
                        return <td key={b.code} style={{ ...numCell, color: v < 0 ? "#b91c1c" : v > 0 ? "#15803d" : "var(--muted)" }}>{v ? money0(v) : "—"}</td>;
                      })}
                      <td style={{ ...numCell, fontWeight: 800, color: r.netChange >= 0 ? "#15803d" : "#b91c1c" }}>{money0(r.netChange)}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
            {data && grouped.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 800, background: "rgba(11,74,125,0.05)" }}>
                  <td style={{ textAlign: "left" }}>Portfolio Total</td>
                  {buckets.map((b) => <td key={b.code} style={numCell}>{money0(grand.byBucket[b.code] ?? 0)}</td>)}
                  <td style={{ ...numCell, color: grand.net >= 0 ? "#15803d" : "#b91c1c" }}>{money0(grand.net)}</td>
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
              <thead><tr><th style={{ textAlign: "left" }}>Entity</th><th style={{ textAlign: "left" }}>Account</th><th style={numCell}>Amount</th></tr></thead>
              <tbody>
                {(data?.rows ?? []).flatMap((r) => r.unmapped.map((u) => (
                  <tr key={`${r.key}-${u.account}`}>
                    <td style={{ textAlign: "left" }}><code style={{ fontSize: 12 }}>{r.propertyCode}</code> {r.name}</td>
                    <td style={{ textAlign: "left" }}><code style={{ fontSize: 12 }}>{u.account}</code></td>
                    <td style={{ ...numCell, color: u.amount < 0 ? "#b91c1c" : "#15803d" }}>{money0(u.amount)}</td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="muted small" style={{ margin: 0 }}>
        Draft for verification — compare to the December CASH ANALYSIS. Once it ties, we wire the weekly overlay (AvidXchange bills + mortgage) and the bank tie-out, then promote it.
      </p>
    </main>
  );
}

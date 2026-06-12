"use client";

// Cross-property "Flags to Investigate" review — every active "?" line across
// all properties in one concentrated, exportable list to hand the accountant.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import { StatPill } from "@/app/components/Pill";

type ReviewLine = {
  key: string; propertyCode: string; propertyName: string; period: number; monthLabel: string;
  section: string; line: string; flags: string[];
  periodActual: number; periodBudget: number | null; periodVariance: number | null;
  ytdActual: number; ytdBudget: number | null; ytdVariance: number | null; note: string | null;
};
type ReviewProperty = { key: string; propertyCode: string; propertyName: string; period: number; monthLabel: string; flagged: number; hasData: boolean };
type ReviewResult = { year: number; generatedAt: string; properties: ReviewProperty[]; flagged: ReviewLine[] };

function money(v: number | null): string {
  if (v == null) return "—";
  const n = Math.round(v);
  const s = Math.abs(n).toLocaleString("en-US");
  return n < 0 ? `($${s})` : `$${s}`;
}
const num: React.CSSProperties = { textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };

export default function OperatingStatementsReviewPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState<ReviewResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [propFilter, setPropFilter] = useState<string>("all");

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/financials/operating-statements/review?year=${year}`)
      .then((r) => r.json())
      .then((j: ReviewResult & { error?: string }) => {
        if (j.error) { setError(j.error); setData(null); }
        else { setData(j); setError(null); }
      })
      .catch((e) => setError(e?.message ?? "Failed to load"))
      .finally(() => setLoading(false));
  }, [year]);
  useEffect(() => { load(); }, [load]);

  const lines = useMemo(
    () => (data?.flagged ?? []).filter((l) => propFilter === "all" || l.key === propFilter),
    [data, propFilter],
  );
  const propsWithData = (data?.properties ?? []).filter((p) => p.hasData);
  const propsWithFlags = (data?.properties ?? []).filter((p) => p.flagged > 0);

  function downloadExcel() {
    if (!data) return;
    const rows = data.flagged.map((l) => ({
      Property: l.propertyCode,
      Name: l.propertyName,
      Month: l.monthLabel,
      Section: l.section,
      Line: l.line,
      "Flagged because": l.flags.join("; "),
      "Month Actual": Math.round(l.periodActual),
      "Month Budget": l.periodBudget == null ? "" : Math.round(l.periodBudget),
      "Month Variance": l.periodVariance == null ? "" : Math.round(l.periodVariance),
      "YTD Actual": Math.round(l.ytdActual),
      "YTD Budget": l.ytdBudget == null ? "" : Math.round(l.ytdBudget),
      "YTD Variance": l.ytdVariance == null ? "" : Math.round(l.ytdVariance),
      Note: l.note ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Lines to Investigate");
    XLSX.writeFile(wb, `Operating Statements - Lines to Investigate - ${year}.xlsx`);
  }

  return (
    <main style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Flags to Investigate</h1>
          <p className="muted small" style={{ margin: 0 }}>
            Every &ldquo;?&rdquo; line across all properties (each at its latest uploaded month) — the lines that look off vs recent months or last year, with the dismissed ones removed.{" "}
            <Link href="/financials/operating-statements" style={{ color: "var(--brand)", fontWeight: 600 }}>← Operating Statements</Link>
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button className="btn" onClick={() => setYear((y) => y - 1)} style={{ padding: "6px 12px", fontWeight: 900 }}>←</button>
          <span style={{ fontWeight: 800, fontSize: 15, minWidth: 60, textAlign: "center" }}>{year}</span>
          <button className="btn" onClick={() => setYear((y) => y + 1)} style={{ padding: "6px 12px", fontWeight: 900 }}>→</button>
          <button className="btn primary" onClick={downloadExcel} disabled={!data?.flagged.length} style={{ fontSize: 13, padding: "6px 14px", fontWeight: 700 }}>Download Excel</button>
        </div>
      </div>

      {error && <div className="small" style={{ color: "#b91c1c", fontWeight: 700 }}>· {error}</div>}

      <div className="pills" style={{ justifyContent: "flex-start" }}>
        <StatPill label="Lines to Investigate" value={data?.flagged.length ?? 0} accent={(data?.flagged.length ?? 0) > 0 ? "#b45309" : "#15803d"} />
        <StatPill label="Properties Flagged" value={propsWithFlags.length} accent={propsWithFlags.length > 0 ? "#b45309" : undefined} />
        <StatPill label="Properties Reviewed" value={propsWithData.length} accent="#0b4a7d" />
        {data && <StatPill label="Generated" value={new Date(data.generatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} />}
      </div>

      <div className="card" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span className="muted small" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>Property</span>
        <select value={propFilter} onChange={(e) => setPropFilter(e.target.value)} style={{ padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--card)", color: "var(--text)", fontSize: 13 }}>
          <option value="all">All properties ({data?.flagged.length ?? 0})</option>
          {propsWithFlags.map((p) => (
            <option key={p.key} value={p.key}>{p.propertyCode} — {p.propertyName} ({p.flagged})</option>
          ))}
        </select>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="tableWrap" style={{ overflowX: "auto" }}>
          <table style={{ minWidth: 900 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Property</th>
                <th style={{ textAlign: "left" }}>Line</th>
                <th style={{ textAlign: "left" }}>Looks off because</th>
                <th style={num}>Month Act</th>
                <th style={num}>Month Bud</th>
                <th style={num}>Variance</th>
                <th style={{ textAlign: "left" }}>Note</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="muted small" style={{ padding: 18 }}>Scanning all properties…</td></tr>}
              {!loading && lines.length === 0 && <tr><td colSpan={7} className="muted small" style={{ padding: 18 }}>No flagged lines{data && data.flagged.length === 0 ? " — nothing looks off across the portfolio." : " for this property."}</td></tr>}
              {lines.map((l, i) => (
                <tr key={i}>
                  <td style={{ textAlign: "left", whiteSpace: "nowrap" }}>
                    <Link href={`/financials/operating-statements?key=${encodeURIComponent(l.key)}&year=${year}&period=${l.period}`} style={{ fontWeight: 600, color: "#0b4a7d", textDecoration: "none" }}>
                      <code style={{ fontSize: 12 }}>{l.propertyCode}</code> {l.propertyName}
                    </Link>
                    <div className="muted small">{l.monthLabel}</div>
                  </td>
                  <td style={{ textAlign: "left" }}>
                    <div style={{ fontWeight: 600 }}>{l.line}</div>
                    <div className="muted small">{l.section}</div>
                  </td>
                  <td style={{ textAlign: "left", maxWidth: 260, whiteSpace: "normal" }} className="small">{l.flags.join("; ")}</td>
                  <td style={num}>{money(l.periodActual)}</td>
                  <td style={{ ...num, color: "var(--muted)" }}>{money(l.periodBudget)}</td>
                  <td style={{ ...num, fontWeight: 700, color: l.periodVariance == null ? undefined : l.periodVariance >= 0 ? "#15803d" : "#b91c1c" }}>{money(l.periodVariance)}</td>
                  <td style={{ textAlign: "left", maxWidth: 280, whiteSpace: "normal" }} className="muted small">{l.note || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="muted small" style={{ margin: 0 }}>
        Download the Excel and send it to your accountant. Each property links back to its statement at the flagged month; dismiss a line there (the &ldquo;?&rdquo;) and it drops off this list.
      </p>
    </main>
  );
}

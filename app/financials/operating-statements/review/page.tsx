"use client";

// Cross-property "Flags to Investigate" review — all properties listed (like the
// rent roll) collapsed, each showing its count of "?" lines; expand for the
// detail. Export the whole list to Excel or PDF for the accountant.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
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

function exportExcel(data: ReviewResult) {
  const rows = data.flagged.map((l) => ({
    Property: l.propertyCode, Name: l.propertyName, Month: l.monthLabel, Section: l.section, Line: l.line,
    "Flagged because": l.flags.join("; "),
    "Month Actual": Math.round(l.periodActual), "Month Budget": l.periodBudget == null ? "" : Math.round(l.periodBudget), "Month Variance": l.periodVariance == null ? "" : Math.round(l.periodVariance),
    "YTD Actual": Math.round(l.ytdActual), "YTD Budget": l.ytdBudget == null ? "" : Math.round(l.ytdBudget), "YTD Variance": l.ytdVariance == null ? "" : Math.round(l.ytdVariance),
    Note: l.note ?? "",
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Lines to Investigate");
  XLSX.writeFile(wb, `Operating Statements - Flags to Investigate - ${data.year}.xlsx`);
}

function exportPdf(data: ReviewResult, byProp: { meta: ReviewProperty; lines: ReviewLine[] }[]) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;
  let y = M;
  const ensure = (h: number) => { if (y + h > H - M) { doc.addPage(); y = M; } };
  doc.setFont("helvetica", "bold"); doc.setFontSize(16);
  doc.text(`Flags to Investigate — ${data.year}`, M, y); y += 20;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(120);
  const withFlags = byProp.filter((p) => p.lines.length).length;
  doc.text(`Operating Statements · generated ${new Date(data.generatedAt).toLocaleString()} · ${data.flagged.length} lines across ${withFlags} properties`, M, y);
  doc.setTextColor(0); y += 20;

  for (const { meta, lines } of byProp) {
    if (!lines.length) continue;
    ensure(34);
    doc.setFont("helvetica", "bold"); doc.setFontSize(11.5);
    doc.text(`${meta.propertyCode} — ${meta.propertyName} · ${meta.monthLabel} · ${lines.length} flag${lines.length === 1 ? "" : "s"}`, M, y);
    y += 6; doc.setDrawColor(200); doc.line(M, y, W - M, y); y += 12;
    for (const l of lines) {
      ensure(46);
      doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(0);
      doc.text(`• ${l.line}`, M + 10, y);
      doc.setFont("helvetica", "normal"); doc.setTextColor(120);
      doc.text(`(${l.section})`, M + 12 + doc.getTextWidth(`• ${l.line} `), y);
      y += 12;
      doc.setTextColor(90);
      for (const wl of doc.splitTextToSize(`Looks off: ${l.flags.join("; ")}`, W - 2 * M - 24) as string[]) { ensure(12); doc.text(wl, M + 18, y); y += 11; }
      ensure(12);
      doc.text(`Actual ${money(l.periodActual)}  ·  Budget ${money(l.periodBudget)}  ·  Variance ${money(l.periodVariance)}`, M + 18, y); y += 11;
      if (l.note) for (const nl of doc.splitTextToSize(`Note: ${l.note}`, W - 2 * M - 24) as string[]) { ensure(11); doc.text(nl, M + 18, y); y += 11; }
      doc.setTextColor(0); y += 6;
    }
    y += 8;
  }
  doc.save(`Operating Statements - Flags to Investigate - ${data.year}.pdf`);
}

export default function OperatingStatementsReviewPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState<ReviewResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/financials/operating-statements/review?year=${year}`)
      .then((r) => r.json())
      .then((j: ReviewResult & { error?: string }) => {
        if (j.error) { setError(j.error); setData(null); }
        else { setData(j); setError(null); setExpanded(new Set()); }
      })
      .catch((e) => setError(e?.message ?? "Failed to load"))
      .finally(() => setLoading(false));
  }, [year]);
  useEffect(() => { load(); }, [load]);

  // All reviewed properties (with data), each with its flagged lines — most
  // flags first, then by code. Properties with no GL uploaded are dropped.
  const byProp = useMemo(() => {
    if (!data) return [];
    const linesByKey = new Map<string, ReviewLine[]>();
    for (const l of data.flagged) {
      const arr = linesByKey.get(l.key) ?? [];
      arr.push(l); linesByKey.set(l.key, arr);
    }
    return data.properties
      .filter((p) => p.hasData)
      .map((meta) => ({ meta, lines: linesByKey.get(meta.key) ?? [] }))
      .sort((a, b) => b.lines.length - a.lines.length || a.meta.propertyCode.localeCompare(b.meta.propertyCode));
  }, [data]);

  const propsWithFlags = byProp.filter((p) => p.lines.length).length;
  const allExpanded = byProp.length > 0 && expanded.size >= propsWithFlags && propsWithFlags > 0;
  function toggleAll() {
    if (allExpanded) setExpanded(new Set());
    else setExpanded(new Set(byProp.filter((p) => p.lines.length).map((p) => p.meta.key)));
  }
  function toggle(key: string) {
    setExpanded((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  }

  return (
    <main style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Flags to Investigate</h1>
          <p className="muted small" style={{ margin: 0 }}>
            Every property&apos;s &ldquo;?&rdquo; lines (each at its latest uploaded month) — the lines that look off vs recent months or last year, dismissed ones removed.{" "}
            <Link href="/financials/operating-statements" style={{ color: "var(--brand)", fontWeight: 600 }}>← Operating Statements</Link>
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button className="btn" onClick={() => setYear((y) => y - 1)} style={{ padding: "6px 12px", fontWeight: 900 }}>←</button>
          <span style={{ fontWeight: 800, fontSize: 15, minWidth: 60, textAlign: "center" }}>{year}</span>
          <button className="btn" onClick={() => setYear((y) => y + 1)} style={{ padding: "6px 12px", fontWeight: 900 }}>→</button>
          <button className="btn" onClick={() => data && exportExcel(data)} disabled={!data?.flagged.length} style={{ fontSize: 13, padding: "6px 14px", fontWeight: 700 }}>Download Excel</button>
          <button className="btn primary" onClick={() => data && exportPdf(data, byProp)} disabled={!data?.flagged.length} style={{ fontSize: 13, padding: "6px 14px", fontWeight: 700 }}>Download PDF</button>
        </div>
      </div>

      {error && <div className="small" style={{ color: "#b91c1c", fontWeight: 700 }}>· {error}</div>}

      <div className="pills" style={{ justifyContent: "flex-start" }}>
        <StatPill label="Lines to Investigate" value={data?.flagged.length ?? 0} accent={(data?.flagged.length ?? 0) > 0 ? "#b45309" : "#15803d"} />
        <StatPill label="Properties Flagged" value={propsWithFlags} accent={propsWithFlags > 0 ? "#b45309" : undefined} />
        <StatPill label="Properties Reviewed" value={byProp.length} accent="#0b4a7d" />
        {data && <StatPill label="Generated" value={new Date(data.generatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} />}
      </div>

      {byProp.length > 0 && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="btn" onClick={toggleAll} style={{ fontSize: 12, padding: "4px 10px", fontWeight: 700 }}>{allExpanded ? "Collapse all" : "Expand all"}</button>
        </div>
      )}

      {loading && !data ? (
        <div className="card muted small" style={{ padding: 18 }}>Scanning all properties…</div>
      ) : byProp.length === 0 ? (
        <div className="card muted small" style={{ padding: 18 }}>No properties with an uploaded GL for {year}.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {byProp.map(({ meta, lines }) => {
            const open = expanded.has(meta.key);
            const has = lines.length > 0;
            return (
              <div key={meta.key} className="card" style={{ padding: 0, overflow: "hidden" }}>
                <button
                  type="button"
                  onClick={() => has && toggle(meta.key)}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "none", border: "none", cursor: has ? "pointer" : "default", textAlign: "left", color: "var(--text)" }}
                >
                  <span style={{ width: 14, color: "var(--muted)", transform: open ? "rotate(90deg)" : undefined, transition: "transform 0.15s", visibility: has ? "visible" : "hidden" }}>▶</span>
                  <code style={{ fontSize: 12, color: "var(--muted)" }}>{meta.propertyCode}</code>
                  <span style={{ fontWeight: 700 }}>{meta.propertyName}</span>
                  <span className="muted small">· {meta.monthLabel}</span>
                  <span style={{ marginLeft: "auto" }} />
                  <span style={{
                    fontSize: 12, fontWeight: 800, padding: "2px 10px", borderRadius: 999,
                    background: has ? "rgba(180,83,9,0.12)" : "rgba(21,128,61,0.10)",
                    color: has ? "#b45309" : "#15803d", border: `1px solid ${has ? "rgba(180,83,9,0.35)" : "rgba(21,128,61,0.30)"}`,
                  }}>{lines.length} {lines.length === 1 ? "flag" : "flags"}</span>
                </button>
                {open && has && (
                  <div className="tableWrap" style={{ borderTop: "1px solid var(--border)", overflowX: "auto" }}>
                    <table style={{ minWidth: 760 }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: "left" }}>Line</th>
                          <th style={{ textAlign: "left" }}>Looks off because</th>
                          <th style={num}>Month Act</th>
                          <th style={num}>Month Bud</th>
                          <th style={num}>Variance</th>
                          <th style={{ textAlign: "left" }}>Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((l, i) => (
                          <tr key={i}>
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
                        <tr style={{ borderTop: "1px solid var(--border)" }}>
                          <td colSpan={6} style={{ padding: "6px 10px" }}>
                            <Link href={`/financials/operating-statements?key=${encodeURIComponent(meta.key)}&year=${year}&period=${meta.period}`} className="small" style={{ color: "#0b4a7d", fontWeight: 600, textDecoration: "none" }}>
                              Open {meta.propertyCode}&apos;s statement at {meta.monthLabel} →
                            </Link>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="muted small" style={{ margin: 0 }}>
        Download the Excel or PDF and send it to your accountant. Dismiss a line on its statement (the &ldquo;?&rdquo;) and it drops off this list.
      </p>
    </main>
  );
}

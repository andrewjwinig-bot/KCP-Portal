"use client";

// Cross-property "Flags to Investigate" review. Properties are grouped and
// ordered like the rent roll (JV III, NI LLC, Shopping Centers, Korman Homes,
// Other Properties). Expand a property → its flagged lines; expand a line →
// every month it was flagged, with that month's "?" reasons + note. Export to
// Excel or PDF for the accountant.

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import { StatPill } from "@/app/components/Pill";
import { groupByRentRoll, type RentRollGroup } from "@/lib/financials/operating-statements/propertyGroups";

type ReviewMonth = {
  period: number; monthLabel: string; flags: string[];
  actual: number; budget: number | null; variance: number | null; note: string | null;
};
type ReviewLine = { lineKey: string; section: string; line: string; months: ReviewMonth[] };
type ReviewProperty = {
  key: string; propertyCode: string; propertyName: string; hasData: boolean;
  latestPeriod: number; latestMonthLabel: string; monthsCovered: number;
  lines: ReviewLine[]; flaggedMonthCount: number;
};
type ReviewResult = { year: number; generatedAt: string; properties: ReviewProperty[] };

function money(v: number | null): string {
  if (v == null) return "—";
  const n = Math.round(v);
  const s = Math.abs(n).toLocaleString("en-US");
  return n < 0 ? `($${s})` : `$${s}`;
}
const num: React.CSSProperties = { textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };

function exportExcel(data: ReviewResult) {
  const rows: Record<string, string | number>[] = [];
  for (const p of data.properties) {
    for (const l of p.lines) {
      for (const mo of l.months) {
        rows.push({
          Property: p.propertyCode, Name: p.propertyName, Month: mo.monthLabel,
          Section: l.section, Line: l.line, "Flagged because": mo.flags.join("; "),
          Actual: Math.round(mo.actual),
          Budget: mo.budget == null ? "" : Math.round(mo.budget),
          Variance: mo.variance == null ? "" : Math.round(mo.variance),
          Note: mo.note ?? "",
        });
      }
    }
  }
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Lines to Investigate");
  XLSX.writeFile(wb, `Operating Statements - Flags to Investigate - ${data.year}.xlsx`);
}

function exportPdf(data: ReviewResult, grouped: { group: RentRollGroup; rows: ReviewProperty[] }[]) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;
  let y = M;
  const ensure = (h: number) => { if (y + h > H - M) { doc.addPage(); y = M; } };
  const totalMonths = data.properties.reduce((s, p) => s + p.flaggedMonthCount, 0);
  const withFlags = data.properties.filter((p) => p.flaggedMonthCount > 0).length;

  doc.setFont("helvetica", "bold"); doc.setFontSize(16);
  doc.text(`Flags to Investigate — ${data.year}`, M, y); y += 20;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(120);
  doc.text(`Operating Statements · generated ${new Date(data.generatedAt).toLocaleString()} · ${totalMonths} flagged line-months across ${withFlags} properties`, M, y);
  doc.setTextColor(0); y += 20;

  for (const { group, rows } of grouped) {
    if (!rows.some((p) => p.flaggedMonthCount > 0)) continue;
    ensure(30);
    doc.setFont("helvetica", "bold"); doc.setFontSize(12.5); doc.setTextColor(11, 74, 125);
    doc.text(group.toUpperCase(), M, y); y += 5;
    doc.setDrawColor(11, 74, 125); doc.setLineWidth(1.2); doc.line(M, y, W - M, y);
    doc.setLineWidth(0.5); doc.setTextColor(0); y += 14;

    for (const p of rows) {
      if (!p.flaggedMonthCount) continue;
      ensure(28);
      doc.setFont("helvetica", "bold"); doc.setFontSize(11.5);
      doc.text(`${p.propertyCode} — ${p.propertyName} · ${p.flaggedMonthCount} flagged line-month${p.flaggedMonthCount === 1 ? "" : "s"}`, M, y);
      y += 6; doc.setDrawColor(210); doc.line(M, y, W - M, y); y += 12;
      for (const l of p.lines) {
        ensure(16);
        doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(0);
        doc.text(`• ${l.line}`, M + 10, y);
        doc.setFont("helvetica", "normal"); doc.setTextColor(120);
        doc.text(`(${l.section})`, M + 12 + doc.getTextWidth(`• ${l.line} `), y);
        y += 12;
        for (const mo of l.months) {
          ensure(24);
          doc.setTextColor(40); doc.setFont("helvetica", "bold"); doc.setFontSize(9);
          doc.text(`${mo.monthLabel}:`, M + 22, y);
          doc.setFont("helvetica", "normal"); doc.setTextColor(90);
          doc.text(`${money(mo.actual)}  ·  Budget ${money(mo.budget)}  ·  Var ${money(mo.variance)}`, M + 22 + doc.getTextWidth(`${mo.monthLabel}:  `), y);
          y += 11;
          for (const wl of doc.splitTextToSize(`Looks off: ${mo.flags.join("; ")}`, W - 2 * M - 36) as string[]) { ensure(11); doc.text(wl, M + 30, y); y += 10; }
          if (mo.note) for (const nl of doc.splitTextToSize(`Note: ${mo.note}`, W - 2 * M - 36) as string[]) { ensure(11); doc.text(nl, M + 30, y); y += 10; }
          y += 3;
        }
        y += 4;
      }
      y += 8;
    }
    y += 6;
  }
  doc.save(`Operating Statements - Flags to Investigate - ${data.year}.pdf`);
}

const FLAG_PILL: React.CSSProperties = {
  fontSize: 12, fontWeight: 800, padding: "2px 10px", borderRadius: 999,
};

export default function OperatingStatementsReviewPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState<ReviewResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openProps, setOpenProps] = useState<Set<string>>(new Set());
  const [openLines, setOpenLines] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/financials/operating-statements/review?year=${year}`)
      .then((r) => r.json())
      .then((j: ReviewResult & { error?: string }) => {
        if (j.error) { setError(j.error); setData(null); }
        else { setData(j); setError(null); setOpenProps(new Set()); setOpenLines(new Set()); }
      })
      .catch((e) => setError(e?.message ?? "Failed to load"))
      .finally(() => setLoading(false));
  }, [year]);
  useEffect(() => { load(); }, [load]);

  // Properties with an uploaded GL, grouped like the rent roll; worst (most
  // flagged months) first within each group.
  const reviewed = useMemo(() => (data?.properties ?? []).filter((p) => p.hasData), [data]);
  const grouped = useMemo(() => {
    return groupByRentRoll(reviewed)
      .map(({ label, items }) => ({
        group: label,
        rows: items.slice().sort((a, b) => b.flaggedMonthCount - a.flaggedMonthCount || a.propertyCode.localeCompare(b.propertyCode)),
      }));
  }, [reviewed]);

  const totalMonths = reviewed.reduce((s, p) => s + p.flaggedMonthCount, 0);
  const propsWithFlags = reviewed.filter((p) => p.flaggedMonthCount > 0).length;

  function toggleProp(key: string) {
    setOpenProps((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  }
  function toggleLine(id: string) {
    setOpenLines((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  const allExpanded = propsWithFlags > 0 && openProps.size >= propsWithFlags;
  function toggleAll() {
    if (allExpanded) { setOpenProps(new Set()); setOpenLines(new Set()); }
    else setOpenProps(new Set(reviewed.filter((p) => p.flaggedMonthCount > 0).map((p) => p.key)));
  }

  return (
    <main style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Flags to Investigate</h1>
          <p className="muted small" style={{ margin: 0 }}>
            Every property&apos;s &ldquo;?&rdquo; lines across all uploaded months — grouped like the rent roll. Expand a property to see its flagged lines; expand a line to see each month it looked off, with the reasons and any note.{" "}
            <Link href="/financials/operating-statements" style={{ color: "var(--brand)", fontWeight: 600 }}>← Operating Statements</Link>
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button className="btn" onClick={() => setYear((y) => y - 1)} style={{ padding: "6px 12px", fontWeight: 900 }}>←</button>
          <span style={{ fontWeight: 800, fontSize: 15, minWidth: 60, textAlign: "center" }}>{year}</span>
          <button className="btn" onClick={() => setYear((y) => y + 1)} style={{ padding: "6px 12px", fontWeight: 900 }}>→</button>
          <button className="btn" onClick={() => data && exportExcel(data)} disabled={!totalMonths} style={{ fontSize: 13, padding: "6px 14px", fontWeight: 700 }}>Download Excel</button>
          <button className="btn primary" onClick={() => data && exportPdf(data, grouped)} disabled={!totalMonths} style={{ fontSize: 13, padding: "6px 14px", fontWeight: 700 }}>Download PDF</button>
        </div>
      </div>

      {error && <div className="small" style={{ color: "#b91c1c", fontWeight: 700 }}>· {error}</div>}

      <div className="pills" style={{ justifyContent: "flex-start" }}>
        <StatPill label="Flagged Line-Months" value={totalMonths} accent={totalMonths > 0 ? "#b45309" : "#15803d"} />
        <StatPill label="Properties Flagged" value={propsWithFlags} accent={propsWithFlags > 0 ? "#b45309" : undefined} />
        <StatPill label="Properties Reviewed" value={reviewed.length} accent="#0b4a7d" />
        {data && <StatPill label="Generated" value={new Date(data.generatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} />}
      </div>

      {reviewed.length > 0 && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="btn" onClick={toggleAll} style={{ fontSize: 12, padding: "4px 10px", fontWeight: 700 }}>{allExpanded ? "Collapse all" : "Expand all"}</button>
        </div>
      )}

      {loading && !data ? (
        <div className="card muted small" style={{ padding: 18 }}>Scanning every month of every property…</div>
      ) : reviewed.length === 0 ? (
        <div className="card muted small" style={{ padding: 18 }}>No properties with an uploaded GL for {year}.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {grouped.map(({ group, rows }) => {
            const groupMonths = rows.reduce((s, p) => s + p.flaggedMonthCount, 0);
            const groupFlagged = rows.filter((p) => p.flaggedMonthCount > 0).length;
            return (
              <div key={group} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {/* Rent-roll-style portfolio header */}
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 14, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text)" }}>
                    {group} <span style={{ fontWeight: 600, color: "var(--muted)" }}>({rows.length})</span>
                  </div>
                  <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--muted)", flexWrap: "wrap" }}>
                    <span><b style={{ fontWeight: 700, color: groupFlagged > 0 ? "#b45309" : "#15803d" }}>{groupFlagged}</b> flagged</span>
                    <span><b style={{ fontWeight: 700, color: "var(--text)" }}>{groupMonths}</b> line-months</span>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {rows.map((p) => {
                    const pOpen = openProps.has(p.key);
                    const has = p.flaggedMonthCount > 0;
                    return (
                      <div key={p.key} className="card" style={{ padding: 0, overflow: "hidden" }}>
                        <button type="button" onClick={() => has && toggleProp(p.key)}
                          style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "none", border: "none", cursor: has ? "pointer" : "default", textAlign: "left", color: "var(--text)" }}>
                          <span style={{ width: 14, color: "var(--muted)", transform: pOpen ? "rotate(90deg)" : undefined, transition: "transform 0.15s", visibility: has ? "visible" : "hidden" }}>▶</span>
                          <code style={{ fontSize: 12, color: "var(--muted)" }}>{p.propertyCode}</code>
                          <span style={{ fontWeight: 700 }}>{p.propertyName}</span>
                          <span className="muted small">· through {p.latestMonthLabel}</span>
                          <span style={{ marginLeft: "auto" }} />
                          <span style={{
                            ...FLAG_PILL,
                            background: has ? "rgba(180,83,9,0.12)" : "rgba(21,128,61,0.10)",
                            color: has ? "#b45309" : "#15803d", border: `1px solid ${has ? "rgba(180,83,9,0.35)" : "rgba(21,128,61,0.30)"}`,
                          }}>
                            {has ? `${p.lines.length} line${p.lines.length === 1 ? "" : "s"} · ${p.flaggedMonthCount} month${p.flaggedMonthCount === 1 ? "" : "s"}` : "clear"}
                          </span>
                        </button>

                        {pOpen && has && (
                          <div style={{ borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column" }}>
                            {p.lines.map((l) => {
                              const lid = `${p.key}::${l.lineKey}`;
                              const lOpen = openLines.has(lid);
                              return (
                                <Fragment key={lid}>
                                  <button type="button" onClick={() => toggleLine(lid)}
                                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 16px 10px 22px", background: "rgba(15,23,42,0.02)", border: "none", borderTop: "1px solid var(--border)", cursor: "pointer", textAlign: "left", color: "var(--text)" }}>
                                    <span style={{ width: 12, color: "var(--muted)", fontSize: 11, transform: lOpen ? "rotate(90deg)" : undefined, transition: "transform 0.15s" }}>▶</span>
                                    <span style={{ fontWeight: 600 }}>{l.line}</span>
                                    <span className="muted small">{l.section}</span>
                                    <span style={{ marginLeft: "auto" }} />
                                    <span className="muted small" style={{ fontWeight: 700 }}>
                                      {l.months.length} month{l.months.length === 1 ? "" : "s"} flagged
                                    </span>
                                  </button>
                                  {lOpen && (
                                    <div className="tableWrap" style={{ borderTop: "1px solid var(--border)", overflowX: "auto" }}>
                                      <table style={{ minWidth: 720 }}>
                                        <thead>
                                          <tr>
                                            <th style={{ textAlign: "left" }}>Month</th>
                                            <th style={num}>Actual</th>
                                            <th style={num}>Budget</th>
                                            <th style={num}>Variance</th>
                                            <th style={{ textAlign: "left" }}>Looks off because</th>
                                            <th style={{ textAlign: "left" }}>Note</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {l.months.map((mo) => (
                                            <tr key={mo.period}>
                                              <td style={{ fontWeight: 700 }}>
                                                <Link href={`/financials/operating-statements?key=${encodeURIComponent(p.key)}&year=${year}&period=${mo.period}`}
                                                  style={{ color: "#0b4a7d", textDecoration: "none" }}>
                                                  {mo.monthLabel}
                                                </Link>
                                              </td>
                                              <td style={num}>{money(mo.actual)}</td>
                                              <td style={{ ...num, color: "var(--muted)" }}>{money(mo.budget)}</td>
                                              <td style={{ ...num, fontWeight: 700, color: mo.variance == null ? undefined : mo.variance >= 0 ? "#15803d" : "#b91c1c" }}>{money(mo.variance)}</td>
                                              <td style={{ textAlign: "left", maxWidth: 260, whiteSpace: "normal" }} className="small">{mo.flags.join("; ")}</td>
                                              <td style={{ textAlign: "left", maxWidth: 260, whiteSpace: "normal" }} className="muted small">{mo.note || "—"}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </Fragment>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="muted small" style={{ margin: 0 }}>
        Download the Excel or PDF and send it to your accountant. Dismiss a line on its statement (the &ldquo;?&rdquo;) for a given month and it drops off this list.
      </p>
    </main>
  );
}

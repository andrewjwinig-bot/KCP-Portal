"use client";

// A budget line's trailing years, and what they say to budget.
//
// The table alone would already beat guessing. What makes it worth opening is
// the reading underneath it: which KIND of line this is, whether we have been
// budgeting it badly, and the number the evidence supports — because "3% over
// last year" applied to every line is wrong in both directions at once.

import { useEffect, useState } from "react";
import { Pill, StatPill, TONE_GREEN, TONE_AMBER, TONE_RED, TONE_BLUE, TONE_NEUTRAL, type PillTone } from "@/app/components/Pill";
import type { LineHistory } from "@/lib/financials/budgets/lineHistory";
import type { LineInsight, LineShape } from "@/lib/financials/budgets/lineInsight";

const money0 = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const secLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" };
const th: React.CSSProperties = { ...secLabel, textAlign: "right", padding: "6px 10px", whiteSpace: "nowrap" };
const thL: React.CSSProperties = { ...th, textAlign: "left" };
const td: React.CSSProperties = { padding: "7px 10px", fontSize: 13, textAlign: "right", fontVariantNumeric: "tabular-nums", borderTop: "1px solid var(--border)", whiteSpace: "nowrap" };
const tdL: React.CSSProperties = { ...td, textAlign: "left" };

const SHAPE: Record<LineShape, { tone: PillTone; text: string; what: string }> = {
  steady:   { tone: TONE_GREEN,   text: "STEADY",   what: "Holds close year to year — a contract." },
  trending: { tone: TONE_BLUE,    text: "TRENDING", what: "Moving in one direction, steadily enough to extend." },
  lumpy:    { tone: TONE_AMBER,   text: "AS-NEEDED", what: "Happens when it happens. Budget the average, not last year." },
  unknown:  { tone: TONE_NEUTRAL, text: "TOO LITTLE HISTORY", what: "Not enough complete years to read." },
};

type Payload = LineHistory & { insight: LineInsight };

export function LineHistoryModal({ viewKey, propertyCode, label, mask, sign, year, onClose, onUseSuggestion }: {
  viewKey: string; propertyCode: string; label: string; mask: string; sign: 1 | -1; year: number;
  onClose: () => void;
  onUseSuggestion?: (amount: number) => void;
}) {
  const [data, setData] = useState<Payload | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const qs = new URLSearchParams({ key: viewKey, code: propertyCode, label, mask, sign: String(sign), year: String(year - 1), back: "5" });
    fetch(`/api/financials/budgets/line-history?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => (j.error ? setFailed(true) : setData(j)))
      .catch(() => setFailed(true));
  }, [viewKey, propertyCode, label, mask, sign, year]);

  const ins = data?.insight;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "48px 20px", overflow: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--card)", borderRadius: 12, maxWidth: 900, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.35)", display: "flex", flexDirection: "column", maxHeight: "84vh" }}>
        <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={secLabel}>Line history · {propertyCode}</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>{label}</div>
            <code className="muted" style={{ fontSize: 12 }}>{mask}</code>
          </div>
          <button type="button" className="btn" onClick={onClose} style={{ fontSize: 12, padding: "5px 12px", fontWeight: 700 }}>Close</button>
        </div>

        <div style={{ padding: 18, overflowY: "auto" }}>
          {failed && <div className="small" style={{ color: "#b91c1c", fontWeight: 700 }}>Could not read this line&rsquo;s history.</div>}
          {!data && !failed && <div className="muted small">Reading {5} years…</div>}

          {data && ins && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <Pill tone={SHAPE[ins.shape].tone}>{SHAPE[ins.shape].text}</Pill>
                <span className="muted small">{SHAPE[ins.shape].what}</span>
              </div>

              {ins.suggestion && (
                <div className="card" style={{ marginTop: 12, borderColor: "rgba(11,74,125,0.35)", background: "rgba(11,74,125,0.04)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <div style={secLabel}>What the history supports</div>
                      <div style={{ fontSize: 24, fontWeight: 900, marginTop: 2 }}>{money0(ins.suggestion.amount)}</div>
                      <div className="muted small" style={{ marginTop: 2 }}>{ins.suggestion.basis}</div>
                    </div>
                    {onUseSuggestion && (
                      <button type="button" className="btn primary" onClick={() => onUseSuggestion(ins.suggestion!.amount)}
                        style={{ fontSize: 12, padding: "6px 13px", fontWeight: 700 }}>
                        Use this
                      </button>
                    )}
                  </div>
                </div>
              )}

              {ins.notes.length > 0 && (
                <ul style={{ margin: "12px 0 0", paddingLeft: 18, fontSize: 13, lineHeight: 1.65 }}>
                  {ins.notes.map((n, i) => <li key={i}>{n}</li>)}
                </ul>
              )}

              <div className="pills" style={{ marginTop: 14 }}>
                {ins.trendPct != null && <StatPill label="Trend / yr" value={`${ins.trendPct > 0 ? "+" : ""}${ins.trendPct}%`} accent={ins.trendPct > 0 ? "#b45309" : "#15803d"} />}
                {ins.volatilityPct != null && <StatPill label="Year-to-year swing" value={`${ins.volatilityPct}%`} />}
                {ins.budgetBiasPct != null && (
                  <StatPill label="Budget vs actual" value={`${ins.budgetBiasPct > 0 ? "+" : ""}${ins.budgetBiasPct}%`}
                    accent={Math.abs(ins.budgetBiasPct) >= 10 ? "#b45309" : undefined} sub={ins.budgetBiasPct > 0 ? "we budget low" : "we budget high"} />
                )}
                {data.averageActual != null && <StatPill label={`${data.completeYears}-yr average`} value={money0(data.averageActual)} />}
              </div>

              <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 16 }}>
                <thead>
                  <tr>
                    <th style={thL}>Year</th>
                    <th style={th}>Budget</th>
                    <th style={th}>Actual</th>
                    <th style={th}>Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {data.years.map((y) => {
                    const partial = y.actual != null && y.monthsCovered < 12;
                    const isOutlier = ins.outlier?.year === y.year;
                    return (
                      <tr key={y.year} style={isOutlier ? { background: "rgba(217,119,6,0.07)" } : undefined}>
                        <td style={{ ...tdL, fontWeight: 800 }}>
                          {y.year}
                          {partial && <span className="muted" style={{ fontWeight: 500 }}> · {y.monthsCovered} mo</span>}
                          {isOutlier && <span style={{ color: "#b45309", fontWeight: 800 }}> ▲</span>}
                        </td>
                        <td style={{ ...td, color: "var(--muted)" }}>{y.budget == null ? "—" : money0(y.budget)}</td>
                        <td style={td}>{y.actual == null ? "—" : money0(y.actual)}</td>
                        <td style={{ ...td, color: y.variance == null ? "var(--muted)" : y.variance > 0 ? "#b91c1c" : "#15803d" }}>
                          {y.variance == null ? "—" : `${y.variance > 0 ? "+" : ""}${money0(y.variance)}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="muted small" style={{ marginTop: 12, lineHeight: 1.6 }}>
                <strong>Budget</strong> is what that year&rsquo;s file carried for this line; <strong>Actual</strong> is its GL. A part year is marked and is left out of the average and the trend — six months read as a full year is a collapse that did not happen.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

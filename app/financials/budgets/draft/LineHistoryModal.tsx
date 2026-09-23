"use client";

// A budget line's trailing years, and what they say to budget.
//
// The table alone would already beat guessing. What makes it worth opening is
// the reading underneath it: which KIND of line this is, whether we have been
// budgeting it badly, and the number the evidence supports — because "3% over
// last year" applied to every line is wrong in both directions at once.

import { useEffect, useState } from "react";
import { Pill, StatPill, TONE_GREEN, TONE_AMBER, TONE_RED, TONE_BLUE, TONE_NEUTRAL, type PillTone } from "@/app/components/Pill";
import { HistoryLoading } from "./HistoryLoading";
import { HistoryBars } from "./HistoryBars";
import type { LineHistory } from "@/lib/financials/budgets/lineHistory";
import type { LineInsight, LineShape } from "@/lib/financials/budgets/lineInsight";

const money0 = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const secLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" };

const SHAPE: Record<LineShape, { tone: PillTone; text: string; what: string }> = {
  steady:   { tone: TONE_GREEN,   text: "STEADY",   what: "Holds close year to year — a contract." },
  trending: { tone: TONE_BLUE,    text: "TRENDING", what: "Moving in one direction, steadily enough to extend." },
  lumpy:    { tone: TONE_AMBER,   text: "AS-NEEDED", what: "Happens when it happens. Budget the average, not last year." },
  unknown:  { tone: TONE_NEUTRAL, text: "TOO LITTLE HISTORY", what: "Not enough complete years to read." },
};

type Payload = LineHistory & { insight: LineInsight };

export function LineHistoryModal({ viewKey, propertyCode, label, mask, sign, year, onClose, onUseSuggestion, forecast = null, budget = null }: {
  viewKey: string; propertyCode: string; label: string; mask: string; sign: 1 | -1; year: number;
  /** The basis year's full-year reprojection for this line — the current year's bar. */
  forecast?: number | null;
  /** This draft's figure for the line — the budget year's bar. */
  budget?: number | null;
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
          <button type="button" className="btn sm" onClick={onClose}>Close</button>
        </div>

        <div style={{ padding: 18, overflowY: "auto" }}>
          {failed && <div className="small" style={{ color: "#b91c1c", fontWeight: 700 }}>Could not read this line&rsquo;s history.</div>}
          {!data && !failed && <HistoryLoading lastYear={year - 1} />}

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

              <HistoryBars years={data.years} forecast={forecast} budget={budget != null ? { year, value: budget } : null} />

              <div className="muted small" style={{ marginTop: 12, lineHeight: 1.6 }}>
                <strong>Actual</strong> is the line&rsquo;s GL; the tick on each bar is that year&rsquo;s <strong>budget</strong>. {forecast != null ? <>The current year is its <strong>reprojection</strong> — actual to date plus budget for the rest — so it reads as a full year. </> : null}The last bar is this draft&rsquo;s {year} budget, so you can see where it lands. The dashed line is the average of the full years shown. Hover a year for its variance.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

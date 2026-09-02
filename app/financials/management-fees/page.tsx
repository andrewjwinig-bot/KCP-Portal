"use client";

// Management Fees — each building's management fee (GL account 6610), pulled
// straight from the posted GL each month and compared to budget. A portfolio
// Actual-vs-Budget line chart up top, the familiar building × month grid below,
// and a per-building drill-down (click a building) showing the fee as a % of
// that building's revenue — the quick sanity check that a fee posted right.

import { useCallback, useEffect, useMemo, useState } from "react";
import { StatPill } from "@/app/components/Pill";
import { ChartTooltip, HoverBands, type TipRow } from "@/app/components/ChartTooltip";
import { DownloadMenu } from "@/app/components/DownloadMenu";
import { exportManagementFeesXlsx } from "@/lib/financials/management-fees/export";
import type { MgmtFeeData, MgmtFeeDetail } from "@/lib/financials/management-fees/compute";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function money(n: number | null | undefined): string {
  if (n == null) return "—";
  return (n < 0 ? "-" : "") + "$" + Math.abs(Math.round(n)).toLocaleString("en-US");
}
function pct1(n: number | null | undefined): string {
  return n == null ? "—" : `${n.toFixed(1)}%`;
}
function variancePct(actual: number, budget: number): number | null {
  return budget ? (actual / budget - 1) * 100 : null;
}

const numTd: React.CSSProperties = { textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
const secLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" };

// ─── Multi-series inline-SVG line chart (matches the rent-roll trends idiom) ───
type Series = { label: string; color: string; values: (number | null)[]; dashed?: boolean; role?: "actual" | "budget" };
// A rounded axis range [min,max] with an even tick step covering [lo,hi], so
// labels land on clean numbers (…40k, 50k, 60k…) rather than raw data values.
function niceScale(lo: number, hi: number, ticks = 4): { min: number; max: number; step: number } {
  if (!(hi > lo)) hi = lo + 1;
  const rawStep = (hi - lo) / ticks;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const niceNorm = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  const step = niceNorm * mag;
  return { min: Math.floor(lo / step) * step, max: Math.ceil(hi / step) * step, step };
}

function LineChart({ series, fmt }: { series: Series[]; fmt: (v: number) => string }) {
  const W = 760, H = 280;
  const padL = 62, padR = 16, padT = 16, padB = 30;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n = 12;
  const allVals = series.flatMap((s) => s.values.filter((v): v is number => v != null));
  // Dynamic Y — tighten to the data (not anchored at $0) so the lines fill the
  // plot, with a rounded floor/ceiling and even tick steps.
  const rawLo = allVals.length ? Math.min(...allVals) : 0;
  const rawHi = allVals.length ? Math.max(...allVals) : 1;
  const pad = (rawHi - rawLo) * 0.12 || Math.abs(rawHi) * 0.05 || 1;
  const { min: yMin, max: yMax, step: yStep } = niceScale(rawLo - pad, rawHi + pad);
  const yTicks: number[] = [];
  for (let v = yMin; v <= yMax + yStep * 1e-6; v += yStep) yTicks.push(v);
  // Dynamic X — span only the months that actually carry data.
  const withData = series.flatMap((s) => s.values.map((v, i) => (v != null ? i : -1))).filter((i) => i >= 0);
  const firstI = withData.length ? Math.min(...withData) : 0;
  const lastI = withData.length ? Math.max(...withData) : n - 1;
  const xSpan = Math.max(1, lastI - firstI);
  const xs = (i: number) => padL + ((i - firstI) / xSpan) * innerW;
  const ys = (v: number) => padT + innerH - ((v - yMin) / (yMax - yMin || 1)) * innerH;

  const [hover, setHover] = useState<number | null>(null);

  // Tooltip content for the hovered month.
  const tipRows: TipRow[] = hover == null ? [] : series
    .filter((s) => s.values[hover] != null)
    .map((s) => ({ label: s.label, color: s.color, value: money(s.values[hover]!) }));
  const va = hover != null ? series.find((s) => s.role === "actual")?.values[hover] ?? null : null;
  const bu = hover != null ? series.find((s) => s.role === "budget")?.values[hover] ?? null : null;
  const variance = va != null && bu != null ? va - bu : null;
  const variancePctVal = variance != null && bu ? (variance / bu) * 100 : null;
  const footer: TipRow | undefined = variance == null ? undefined : {
    label: "Variance",
    value: `${variance >= 0 ? "+" : ""}${money(variance)}${variancePctVal != null ? ` (${variance >= 0 ? "+" : ""}${variancePctVal.toFixed(1)}%)` : ""}`,
    color: variance >= 0 ? "#15803d" : "#b45309",
  };

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }} onMouseLeave={() => setHover(null)}>
      {yTicks.map((v) => (
        <g key={v}>
          <line x1={padL} x2={W - padR} y1={ys(v)} y2={ys(v)} stroke="rgba(15,23,42,0.08)" />
          <text x={padL - 8} y={ys(v) + 4} fontSize={10} fill="var(--muted)" textAnchor="end">{fmt(v)}</text>
        </g>
      ))}
      {MONTHS.map((mo, i) => (i < firstI || i > lastI ? null : (
        <text key={mo} x={xs(i)} y={H - padB + 17} fontSize={10} fontWeight={hover === i ? 800 : 400} fill={hover === i ? "var(--text)" : "var(--muted)"} textAnchor="middle">{mo}</text>
      )))}

      {/* Series lines + points (non-interactive; the hit band below drives hover) */}
      <g pointerEvents="none">
        {series.map((s) => {
          const pts = s.values.map((v, i) => ({ v, i })).filter((p) => p.v != null) as { v: number; i: number }[];
          if (!pts.length) return null;
          const path = pts.map((p, k) => `${k === 0 ? "M" : "L"} ${xs(p.i).toFixed(1)} ${ys(p.v).toFixed(1)}`).join(" ");
          return (
            <g key={s.label}>
              <path d={path} fill="none" stroke={s.color} strokeWidth={2.5} strokeDasharray={s.dashed ? "6 4" : undefined} strokeLinejoin="round" strokeLinecap="round" />
              {pts.map((p) => {
                const on = hover === p.i;
                return <circle key={p.i} cx={xs(p.i)} cy={ys(p.v)} r={on ? 6 : 3.5} fill={s.color} stroke="#fff" strokeWidth={on ? 2.5 : 1.5} />;
              })}
            </g>
          );
        })}
      </g>

      <HoverBands n={n} xAt={xs} x0={padL} x1={padL + innerW} top={padT} height={innerH} active={hover} onHover={setHover} />
      {hover != null && tipRows.length > 0 && (
        <ChartTooltip x={xs(hover)} y={padT + 2} chartW={W} title={MONTHS_LONG[hover]} rows={tipRows} footer={footer} />
      )}
    </svg>
  );
}

function ChartLegend({ series }: { series: Series[] }) {
  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 6 }}>
      {series.map((s) => (
        <span key={s.label} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600 }}>
          <span style={{ width: 14, height: 0, borderTop: `2.5px ${s.dashed ? "dashed" : "solid"} ${s.color}` }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

export default function ManagementFeesPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState<MgmtFeeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [openCode, setOpenCode] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/financials/management-fees?year=${year}`, { cache: "no-store" })
      .then((r) => r.json()).then((j) => setData(j)).catch(() => setData(null)).finally(() => setLoading(false));
  }, [year]);

  const chartSeries = useMemo<Series[]>(() => {
    if (!data) return [];
    const { portfolio, completeThrough } = data;
    // Compare against the LIK 2010 plan (the budget staff reference); fall back
    // to the bottom-up building budgets only if the 2010 budget isn't loaded.
    const usingLik = !!portfolio.likPlanMonthly;
    const budgetMonthly = portfolio.likPlanMonthly ?? portfolio.budgetBottomUpMonthly;
    return [
      { label: "Actual", role: "actual", color: "#0b4a7d", values: portfolio.actualMonthly.map((v, i) => (i < completeThrough ? v : null)) },
      { label: usingLik ? "LIK Budget" : "Budget (bottom-up)", role: "budget", color: "#16a34a", values: budgetMonthly.map((v) => v), dashed: true },
    ];
  }, [data]);

  // The reporting window = the furthest month any building has posted. Within it,
  // a building with no management fee is suspicious (the GL posted with no 6610,
  // or the building is a month behind the rest) — flag it so it can be reposted.
  const portfolioMaxPosted = useMemo(() => (data ? Math.max(0, ...data.buildings.map((b) => b.maxPosted)) : 0), [data]);
  const isMissing = useCallback((b: MgmtFeeData["buildings"][number], m: number) => (
    b.feeMonthly[m] === 0 && m + 1 <= portfolioMaxPosted && (b.budgetMonthly[m] > 0 || b.ytdActual > 0)
  ), [portfolioMaxPosted]);
  // A posted month whose 6610 nets to a CREDIT (negative fee) — a reversal /
  // prior-period correction sitting where a charge should be. Almost always a GL
  // error to verify, so flag it distinctly from a missing (zero) month.
  const isNegative = useCallback((b: MgmtFeeData["buildings"][number], m: number) => (
    b.feeMonthly[m] < 0 && m + 1 <= b.maxPosted
  ), []);
  const flaggedCount = useMemo(() => {
    if (!data) return 0;
    let n = 0;
    for (const b of data.buildings) for (let m = 0; m < 12; m++) if (isMissing(b, m)) n++;
    return n;
  }, [data, isMissing]);
  const negativeCount = useMemo(() => {
    if (!data) return 0;
    let n = 0;
    for (const b of data.buildings) for (let m = 0; m < 12; m++) if (isNegative(b, m)) n++;
    return n;
  }, [data, isNegative]);

  const detailFor = openCode;

  return (
    <main style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 1200, width: "100%" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Management Fees</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}
            style={{ borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 600, border: "1px solid rgba(11,74,125,0.3)", background: "var(--card)", color: "#0b4a7d", cursor: "pointer" }}>
            {[now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <DownloadMenu
            items={[{ label: "Excel workbook", description: "Building × month grid + Actual vs Budget, with live totals", onClick: () => data && exportManagementFeesXlsx(data) }]}
            disabled={!data || !data.buildings.length}
          />
        </div>
      </div>
      <p className="muted" style={{ marginTop: -6 }}>
        Pulled from the posted GL — account <b>6610</b> — per building each month, compared to budget.
        {data?.completeThrough ? ` Posted through ${MONTHS_LONG[data.completeThrough - 1]} ${year}.` : ""}
      </p>

      {loading && <div className="card muted">Loading…</div>}

      {data && !loading && (
        <>
          {/* KPIs */}
          <div className="pills">
            <StatPill label={`YTD Actual${data.completeThrough ? ` (thru ${MONTHS[data.completeThrough - 1]})` : ""}`} value={money(data.portfolio.ytdActual)} />
            <StatPill label="YTD Budget (bottom-up)" value={money(data.portfolio.ytdBudgetBottomUp)}
              sub={(() => { const v = variancePct(data.portfolio.ytdActual, data.portfolio.ytdBudgetBottomUp); return v == null ? undefined : `${v >= 0 ? "+" : ""}${v.toFixed(1)}% vs budget`; })()} />
            {data.portfolio.likPlanAnnual != null && (
              <StatPill label={`LIK 2010 Plan${data.likPlan?.fallback ? ` (${data.likPlan.budgetYear})` : ""}`} value={money(data.portfolio.likPlanAnnual)} sub="full-year plan" />
            )}
            <StatPill label="Annual Budget (bottom-up)" value={money(data.portfolio.annualBudgetBottomUp)} />
          </div>

          {/* Chart */}
          <div className="card">
            <div style={{ ...secLabel, marginBottom: 6 }}>Actual vs Budget — by month</div>
            <LineChart series={chartSeries} fmt={(v) => "$" + Math.round(v / 1000) + "k"} />
            <ChartLegend series={chartSeries} />
          </div>

          {/* Grid: months down, buildings across */}
          <div className="card" style={{ padding: 0, overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 14, minWidth: "100%" }}>
              <thead>
                <tr>
                  <th style={{ ...gridTh, textAlign: "left", position: "sticky", left: 0, background: "var(--card)", zIndex: 2 }}>Month</th>
                  {data.groups.map((g) => (
                    <th key={g.key} colSpan={g.codes.length} style={{ ...gridTh, textAlign: "center", color: "#0b4a7d", borderLeft: "2px solid var(--border)" }}>{g.label}</th>
                  ))}
                  <th style={{ ...gridTh, textAlign: "right", borderLeft: "2px solid var(--border)" }}>Total</th>
                </tr>
                <tr>
                  <th style={{ ...gridTh, textAlign: "left", position: "sticky", left: 0, background: "var(--card)", zIndex: 2 }} />
                  {data.buildings.map((b, i) => {
                    const groupStart = i === 0 || data.buildings[i - 1].group !== b.group;
                    return (
                      <th key={b.code} onClick={() => setOpenCode(b.code)} title={`${b.name} — click for detail`}
                        style={{ ...gridTh, textAlign: "right", cursor: "pointer", color: "#0b4a7d", borderLeft: groupStart ? "2px solid var(--border)" : undefined }}>
                        {b.code}
                      </th>
                    );
                  })}
                  <th style={{ ...gridTh, borderLeft: "2px solid var(--border)" }} />
                </tr>
              </thead>
              <tbody>
                {MONTHS.map((mo, m) => (
                  <tr key={mo}>
                    <td style={{ ...gridTd, fontWeight: 600, position: "sticky", left: 0, background: "var(--card)", zIndex: 1 }}>{mo} {String(year).slice(2)}</td>
                    {data.buildings.map((b, i) => {
                      const groupStart = i === 0 || data.buildings[i - 1].group !== b.group;
                      const posted = m + 1 <= b.maxPosted;
                      const inWindow = m + 1 <= portfolioMaxPosted;
                      const missing = isMissing(b, m);
                      const negative = isNegative(b, m);
                      const content = posted ? (b.feeMonthly[m] ? money(b.feeMonthly[m]) : "—") : (inWindow ? "—" : "");
                      const title = negative
                        ? `Negative management fee — the GL netted to a ${money(Math.abs(b.feeMonthly[m]))} credit this month, likely a reversal or prior-period correction. Verify the 6610 entries.`
                        : missing
                          ? (posted ? "GL posted, but no management fee for this month — it may need to be reposted." : "Not posted yet — other buildings have posted this month.")
                          : undefined;
                      return (
                        <td key={b.code} title={title}
                          style={{ ...gridTd, ...numTd, borderLeft: groupStart ? "2px solid var(--border)" : undefined,
                            ...(negative
                              ? { background: "rgba(220,38,38,0.15)", color: "#b91c1c", fontWeight: 700, cursor: "help" }
                              : missing
                                ? { background: "rgba(217,119,6,0.15)", color: "#b45309", fontWeight: 700, cursor: "help" }
                                : { color: b.feeMonthly[m] ? "var(--text)" : "var(--muted)" }) }}>
                          {content}
                        </td>
                      );
                    })}
                    <td style={{ ...gridTd, ...numTd, fontWeight: 700, borderLeft: "2px solid var(--border)" }}>
                      {data.completeThrough && m + 1 <= data.completeThrough ? money(data.portfolio.actualMonthly[m]) : ""}
                    </td>
                  </tr>
                ))}
                <tr style={{ borderTop: "2px solid var(--border)" }}>
                  <td style={{ ...gridTd, fontWeight: 800, position: "sticky", left: 0, background: "var(--card)", zIndex: 1 }}>YTD Totals</td>
                  {data.buildings.map((b, i) => {
                    const groupStart = i === 0 || data.buildings[i - 1].group !== b.group;
                    return <td key={b.code} style={{ ...gridTd, ...numTd, fontWeight: 800, borderLeft: groupStart ? "2px solid var(--border)" : undefined }}>{money(b.ytdActual)}</td>;
                  })}
                  <td style={{ ...gridTd, ...numTd, fontWeight: 900, borderLeft: "2px solid var(--border)" }}>{money(data.portfolio.ytdActual)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="muted small" style={{ marginTop: -4, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {flaggedCount > 0 && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#b45309", fontWeight: 700 }}>
                <span style={{ width: 13, height: 13, borderRadius: 3, background: "rgba(217,119,6,0.25)", border: "1px solid #d97706" }} />
                {flaggedCount} month{flaggedCount === 1 ? "" : "s"} flagged — a fee is expected but missing; likely needs (re)posting.
              </span>
            )}
            {negativeCount > 0 && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#b91c1c", fontWeight: 700 }}>
                <span style={{ width: 13, height: 13, borderRadius: 3, background: "rgba(220,38,38,0.25)", border: "1px solid #dc2626" }} />
                {negativeCount} negative fee{negativeCount === 1 ? "" : "s"} — the 6610 netted to a credit (reversal / correction); verify the GL.
              </span>
            )}
            <span>Click any building code for its fee-as-a-%-of-revenue detail. Blank cells are future / un-opened months.</span>
          </p>
        </>
      )}

      {detailFor && <BuildingModal code={detailFor} year={year} onClose={() => setOpenCode(null)} />}
    </main>
  );
}

const gridTh: React.CSSProperties = { padding: "8px 13px", fontSize: 12.5, fontWeight: 700, color: "var(--muted)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
const gridTd: React.CSSProperties = { padding: "8px 13px", fontSize: 14, borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };

function BuildingModal({ code, year, onClose }: { code: string; year: number; onClose: () => void }) {
  const [detail, setDetail] = useState<MgmtFeeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    fetch(`/api/financials/management-fees?year=${year}&code=${encodeURIComponent(code)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null)).then((j) => setDetail(j?.detail ?? null)).catch(() => setDetail(null)).finally(() => setLoading(false));
  }, [code, year]);

  const rows = (detail?.months ?? []).filter((m) => m.month <= (detail?.maxPosted ?? 0));

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "6vh 16px 16px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: "100%", maxWidth: 640, margin: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginBottom: 4 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{detail?.name ?? code} <code style={{ fontSize: 13 }}>{code}</code></div>
          <button onClick={onClose} aria-label="Close" style={{ border: "none", background: "none", cursor: "pointer", fontSize: 22, color: "var(--muted)" }}>×</button>
        </div>
        <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>Management fee vs gross revenue &amp; budget · {year}</div>

        {loading && <div className="muted">Loading…</div>}
        {detail && !loading && (
          <>
            <div className="pills" style={{ marginBottom: 12 }}>
              <StatPill label="YTD Fee" value={money(detail.ytd.fee)} />
              <StatPill label="YTD Gross Revenue" value={money(detail.ytd.revenue)} />
              <StatPill label="Fee % of Gross Rev" value={pct1(detail.ytd.feePctOfRevenue)} />
              <StatPill label="YTD Budget" value={money(detail.ytd.budget)}
                sub={(() => { const v = variancePct(detail.ytd.fee, detail.ytd.budget); return v == null ? undefined : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`; })()} />
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ ...gridTh, textAlign: "left" }}>Month</th>
                  <th style={{ ...gridTh, textAlign: "right" }}>Fee</th>
                  <th style={{ ...gridTh, textAlign: "right" }}>Gross Revenue</th>
                  <th style={{ ...gridTh, textAlign: "right" }}>Fee % of Gross Rev</th>
                  <th style={{ ...gridTh, textAlign: "right" }}>Budget</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.month}>
                    <td style={gridTd}>{MONTHS[m.month - 1]}</td>
                    <td style={{ ...gridTd, ...numTd }}>{money(m.fee)}</td>
                    <td style={{ ...gridTd, ...numTd }}>{money(m.revenue)}</td>
                    <td style={{ ...gridTd, ...numTd, fontWeight: 700 }}>{pct1(m.feePctOfRevenue)}</td>
                    <td style={{ ...gridTd, ...numTd, color: "var(--muted)" }}>{money(m.budget)}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={5} style={{ ...gridTd, textAlign: "center", color: "var(--muted)" }}>No posted GL for {code} {year} yet.</td></tr>}
              </tbody>
            </table>
            <p className="muted small" style={{ marginTop: 10, marginBottom: 0 }}>
              Gross revenue = rental income + tenant reimbursements (total revenues). Fee % of gross revenue is the sanity check — management fees are usually a fixed % of collections, so an off-ratio month is worth a look.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

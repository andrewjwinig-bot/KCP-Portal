"use client";
// The portfolio cash forecast (owner: "how much can we distribute, and
// when"). Each bank line's balance today rolled month by month to Dec 31 on
// its reprojection's cash flow after debt service, less the distributions
// still planned. Read-only; the figures come from lib/financials/cash-forecast.

import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { StatPill } from "@/app/components/Pill";
import { HoverCard } from "@/app/components/HoverCard";
import { InfoPopover } from "@/app/components/InfoPopover";
import { th, thL, td as tdBase, tdL as tdLBase } from "@/app/components/tableStyles";

type Line = {
  key: string; name: string; group: string; restricted: boolean;
  balance: number | null; asOf: string | null;
  monthEnds: (number | null)[]; cashFlowRest: number;
  distributions: number[]; distributionsRest: number;
  yearEnd: number | null; flat: boolean; flatReason: string | null;
};
type Totals = { today: number; monthEnds: (number | null)[]; cashFlowRest: number; distributionsRest: number; distributions: number[]; yearEnd: number };
type Data = { year: number; groups: string[]; lines: Line[]; totals: Totals };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const money0 = (n: number | null) => {
  if (n == null) return "—";
  const v = Math.round(n);
  if (v === 0) return "—";
  const s = Math.abs(v).toLocaleString("en-US");
  return v < 0 ? `($${s})` : `$${s}`;
};
const td: React.CSSProperties = { ...tdBase, fontSize: "var(--fs-13)" };
const tdL: React.CSSProperties = { ...tdLBase, fontSize: "var(--fs-13)" };
const band: React.CSSProperties = { background: "var(--tint-neutral-bg, rgba(15,23,42,0.04))", borderTop: "1px solid var(--border)", cursor: "pointer" };
const endCol: React.CSSProperties = { ...td, fontWeight: 600, background: "var(--tint-brand-bg, rgba(11,74,125,0.06))" };

function sumOf(ls: Line[], f: (l: Line) => number | null) { return ls.reduce((s, l) => s + (f(l) ?? 0), 0); }

/** Today, plus cash flow, less distributions, equals Dec 31 — on hover. */
function YearEndCell({ l, year }: { l: Pick<Line, "balance" | "cashFlowRest" | "distributionsRest" | "yearEnd" | "flat" | "flatReason">; year: number }) {
  if (l.flat) {
    return (
      <HoverCard title="Carried flat" rows={[{ label: "Today", value: money0(l.balance) }]} footer={{ label: l.flatReason ?? "Nothing moves it", value: "" }}>
        <span style={{ fontStyle: "italic", color: "var(--muted)" }}>{money0(l.yearEnd)}</span>
      </HoverCard>
    );
  }
  return (
    <HoverCard title={`Dec 31, ${year}`}
      rows={[
        { label: "Today", value: money0(l.balance) },
        { label: "+ Cash flow after debt service", value: money0(l.cashFlowRest), color: l.cashFlowRest < 0 ? "var(--c-b91c1c)" : "var(--c-15803d)" },
        ...(l.distributionsRest ? [{ label: "− Distributions", value: money0(-l.distributionsRest), color: "var(--c-b91c1c)" }] : []),
      ]}
      footer={{ label: "Projected", value: money0(l.yearEnd) }}>
      <span>{money0(l.yearEnd)}</span>
    </HoverCard>
  );
}

export function CashForecastCard() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    let live = true;
    fetch("/api/financials/bank-balances/forecast", { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 403) { if (live) setHidden(true); return; }
        const j = await r.json();
        if (!live) return;
        if (!r.ok) setError(j.error ?? "The forecast could not be built.");
        else setData(j);
      })
      .catch(() => live && setError("The forecast could not be built."));
    return () => { live = false; };
  }, []);

  const lines = useMemo(() => (data?.lines ?? []).filter((l) => !l.restricted), [data]);
  const groups = useMemo(() => (data?.groups ?? []).map((g) => ({ g, ls: lines.filter((l) => l.group === g) })).filter((x) => x.ls.length), [data, lines]);
  // The months still to come, from the earliest as-of month to December.
  const months = useMemo(() => {
    const first = (data?.totals.monthEnds ?? []).findIndex((x) => x != null);
    return first < 0 ? [] : Array.from({ length: 12 - first }, (_, i) => first + i);
  }, [data]);

  if (hidden) return null;
  const t = data?.totals;
  const year = data?.year ?? new Date().getFullYear();

  return (
    <section className="card" style={{ padding: 0 }}>
      <div style={{ padding: "16px 18px 6px", display: "flex", alignItems: "center", gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: "var(--fs-17)" }}>Cash Forecast · Dec 31</h2>
        <InfoPopover label="How the forecast works" align="left">
          <div style={{ paddingTop: 12, fontSize: "var(--fs-14)", maxWidth: 360 }}>
            Each line&apos;s balance today, rolled to Dec 31 on its reprojection&apos;s cash flow after debt service (actuals, then budget) less the distributions still planned. A line with no operating statement is carried flat. Security deposits are left out.
          </div>
        </InfoPopover>
      </div>

      {!data && !error && <div className="muted" style={{ padding: "6px 18px 18px", fontSize: "var(--fs-14)" }}>Rolling each property&apos;s reprojection forward…</div>}
      {error && <div style={{ padding: "6px 18px 18px", color: "var(--c-b91c1c)", fontWeight: 600, fontSize: "var(--fs-14)" }}>{error}</div>}

      {data && t && (
        <>
          <div className="pills" style={{ padding: "8px 18px 14px" }}>
            <StatPill label="Cash today" value={money0(t.today)} sub="Every line but deposits" />
            <StatPill label="Cash flow to Dec 31" value={money0(t.cashFlowRest)} sub="After debt service" />
            <StatPill label="Distributions to come" value={money0(t.distributionsRest)}
              sub={t.distributions.map((d, i) => (d ? `${MONTHS[i]} ${money0(d)}` : null)).filter(Boolean).join(" · ") || "None planned"} />
            <StatPill label={`Proj. Cash · Dec 31`} value={money0(t.yearEnd)} total
              sub={`${t.yearEnd >= t.today ? "Up" : "Down"} ${money0(Math.abs(t.yearEnd - t.today))} from today`} />
          </div>
          <div style={{ overflowX: "auto", borderTop: "1px solid var(--border)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 + months.length * 90 }}>
              <thead><tr>
                <th style={thL}>Property / Entity</th>
                <th style={th}>Today</th>
                {months.map((m) => <th key={m} style={th}>{MONTHS[m]}</th>)}
                <th style={th}>Distributions</th>
                <th style={th}>Dec 31</th>
              </tr></thead>
              <tbody>
                {groups.map(({ g, ls }) => {
                  const isOpen = !collapsed.has(g);
                  return (
                    <Fragment key={g}>
                      <tr style={band} onClick={() => { const n = new Set(collapsed); n.has(g) ? n.delete(g) : n.add(g); setCollapsed(n); }}>
                        <td style={{ ...tdL, fontWeight: 700, fontSize: "var(--fs-12)", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>
                          <span style={{ display: "inline-block", width: 18 }}>{isOpen ? <ChevronDown size={16} strokeWidth={1.75} aria-hidden style={{ verticalAlign: "-3px" }} /> : <ChevronRight size={16} strokeWidth={1.75} aria-hidden style={{ verticalAlign: "-3px" }} />}</span>{g}
                        </td>
                        <td style={{ ...td, fontWeight: 700 }}>{money0(sumOf(ls, (l) => l.balance))}</td>
                        {months.map((m) => <td key={m} style={{ ...td, fontWeight: 700 }}>{money0(sumOf(ls, (l) => l.monthEnds[m] ?? l.balance))}</td>)}
                        <td style={{ ...td, fontWeight: 700 }}>{money0(-sumOf(ls, (l) => l.distributionsRest))}</td>
                        <td style={{ ...endCol, fontWeight: 700 }}>{money0(sumOf(ls, (l) => l.yearEnd))}</td>
                      </tr>
                      {isOpen && ls.map((l) => (
                        <tr key={l.key} style={{ borderTop: "1px solid var(--border)", opacity: l.balance == null ? 0.55 : 1 }}>
                          <td style={{ ...tdL, fontWeight: 600, paddingLeft: 32 }}>{l.name}</td>
                          <td style={td}>{money0(l.balance)}</td>
                          {months.map((m) => (
                            <td key={m} style={{ ...td, color: l.flat ? "var(--muted)" : undefined }}>
                              {money0(l.monthEnds[m] ?? l.balance)}
                            </td>
                          ))}
                          <td style={td}>
                            {l.distributionsRest ? (
                              <HoverCard title="Distributions to come" rows={l.distributions.map((d, i) => (d ? { label: MONTHS[i], value: money0(d) } : null)).filter(Boolean) as { label: string; value: string }[]}
                                footer={{ label: "Total", value: money0(l.distributionsRest) }}>
                                <span>{money0(-l.distributionsRest)}</span>
                              </HoverCard>
                            ) : "—"}
                          </td>
                          <td style={endCol}><YearEndCell l={l} year={year} /></td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
                <tr style={{ borderTop: "2px solid var(--border)" }}>
                  <td style={{ ...tdL, fontSize: "var(--fs-12)", color: "var(--muted)", fontWeight: 700 }}>Total</td>
                  <td style={{ ...td, fontWeight: 700 }}>{money0(t.today)}</td>
                  {months.map((m) => <td key={m} style={{ ...td, fontWeight: 700 }}>{money0(t.monthEnds[m])}</td>)}
                  <td style={{ ...td, fontWeight: 700 }}>{money0(-t.distributionsRest)}</td>
                  <td style={{ ...endCol, fontWeight: 700 }}>
                    <YearEndCell l={{ balance: t.today, cashFlowRest: t.cashFlowRest, distributionsRest: t.distributionsRest, yearEnd: t.yearEnd, flat: false, flatReason: null }} year={year} />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

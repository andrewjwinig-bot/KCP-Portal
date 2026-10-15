"use client";

// Month-by-month totals for one statement line, drawn above its YTD GL list,
// each month's bar STACKED BY VENDOR.
//
// The list answers "what posted"; the bars answer "when, and from whom" — the
// first questions a variance raises. Is this a run rate, one big month, a
// month with nothing, or a new vendor that appeared in July? Several charges
// from one vendor in a month are ONE segment (the hover lists them), so a
// segment always means "this vendor, this month".
//
// Two filters live on the chart and drive the list below it:
//   • click a MONTH (anywhere in its column) → the list narrows to that month;
//   • click a VENDOR in the legend → the list narrows to that vendor, and its
//     segments stay in full colour while the rest step back.
// Both toggle off on a second click. The vendor filter is the same one the
// old "By tenant / unit — click to isolate" table set; this replaced it.
//
// COLOUR FOLLOWS THE VENDOR, ranked by the year's total and fixed for the
// chart: the six largest take the six categorical slots in order, everything
// else folds into a neutral "Other". Never a generated seventh hue. The slots
// are the validated reference categorical palette (light and dark each checked
// against this app's card surface), declared once as `--series-*` tokens in
// globals.css so the dark theme swaps them in one place. Three light slots sit under 3:1 on white,
// which the legend labels and the charge list beneath (the table view) relieve.
//
// The hover card is the shared `ChartTooltip`, as on every inline-SVG chart in
// the portal. The hit zones are drawn here rather than with `HoverBands`,
// because a bar segment is its own target (HoverBands spaces bands between
// points, for line charts).

import { useMemo, useState } from "react";
import { ChartTooltip, type TipRow } from "@/app/components/ChartTooltip";
import { tightScale } from "@/lib/charts/tightScale";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SLOTS = 6;
const OTHER = "__other__";

const slotColor = (i: number) => (i < SLOTS ? `var(--series-${i + 1})` : "var(--series-other)");

export type BarTxn = {
  month: number;
  amount: number;
  /** Stable vendor key (the drill-down's groupKey). */
  vendor: string;
  vendorLabel: string;
  date: string | null;
  description: string;
};

type Segment = { vendor: string; label: string; total: number; charges: BarTxn[] };

const whole = (v: number) => {
  const s = `$${Math.round(Math.abs(v)).toLocaleString("en-US")}`;
  return v < 0 ? `(${s})` : s;
};
const cents = (v: number) => {
  const s = `$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return v < 0 ? `(${s})` : s;
};
const axis = (v: number) => {
  const a = Math.abs(v);
  const s = a >= 1_000_000 ? `$${(a / 1_000_000).toFixed(a % 1_000_000 ? 1 : 0)}M` : a >= 1000 ? `$${(a / 1000).toFixed(a % 1000 ? 1 : 0)}k` : `$${a}`;
  return v < 0 ? `(${s})` : s;
};
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const shortDate = (d: string | null) => {
  if (!d) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  if (m) return `${m[2]}/${m[3]}`;
  const u = /^(\d{1,2})\/(\d{1,2})/.exec(d);
  return u ? `${u[1].padStart(2, "0")}/${u[2].padStart(2, "0")}` : d;
};

/** A segment with 4px rounded corners on its free end only. */
function segPath(x: number, w: number, y1: number, y2: number, roundTop: boolean, roundBottom: boolean): string {
  const top = Math.min(y1, y2), bot = Math.max(y1, y2);
  const h = bot - top;
  if (h < 0.5) return "";
  const r = Math.min(4, w / 2, h / 2);
  const rt = roundTop ? r : 0, rb = roundBottom ? r : 0;
  return `M${x},${top + rt} Q${x},${top} ${x + rt},${top} H${x + w - rt} Q${x + w},${top} ${x + w},${top + rt}`
    + ` V${bot - rb} Q${x + w},${bot} ${x + w - rb},${bot} H${x + rb} Q${x},${bot} ${x},${bot - rb} Z`;
}

export function MonthlyBars({ txns, period, year, selectedMonth, onSelectMonth, selectedVendor, onSelectVendor }: {
  txns: BarTxn[];
  /** Months in the window (1 … period). Empty months still get a column. */
  period: number;
  year: number;
  selectedMonth: number | null;
  onSelectMonth: (month: number | null) => void;
  selectedVendor: string | null;
  onSelectVendor: (vendor: string | null) => void;
}) {
  const [hover, setHover] = useState<{ month: number; vendor: string } | null>(null);

  // Vendors ranked by the year's size; the top six keep a colour of their own.
  const { rank, legend, months } = useMemo(() => {
    const totals = new Map<string, { label: string; total: number }>();
    for (const t of txns) {
      const v = totals.get(t.vendor) ?? { label: t.vendorLabel, total: 0 };
      v.total += t.amount; totals.set(t.vendor, v);
    }
    const ordered = [...totals.entries()].sort((a, b) => Math.abs(b[1].total) - Math.abs(a[1].total));
    const rank = new Map<string, number>();
    ordered.forEach(([k], i) => rank.set(k, Math.min(i, SLOTS)));
    const folded = ordered.length > SLOTS + 1; // one extra vendor keeps its own name rather than "Other (1)"
    if (!folded) ordered.forEach(([k], i) => rank.set(k, i < SLOTS ? i : SLOTS));
    const legend = ordered.slice(0, folded ? SLOTS : ordered.length).map(([k, v]) => ({ key: k, label: v.label, total: v.total, slot: rank.get(k)! }));
    if (folded) {
      const rest = ordered.slice(SLOTS);
      legend.push({ key: OTHER, label: `Other (${rest.length} vendors)`, total: rest.reduce((s, [, v]) => s + v.total, 0), slot: SLOTS });
    }
    const keyOf = (vendor: string) => (folded && rank.get(vendor)! >= SLOTS ? OTHER : vendor);
    const months: { month: number; total: number; segs: Segment[] }[] = [];
    for (let m = 1; m <= period; m++) {
      const by = new Map<string, Segment>();
      for (const t of txns) {
        if (t.month !== m) continue;
        const k = keyOf(t.vendor);
        const seg = by.get(k) ?? { vendor: k, label: k === OTHER ? "Other vendors" : t.vendorLabel, total: 0, charges: [] };
        seg.total += t.amount; seg.charges.push(t); by.set(k, seg);
      }
      // Stack in legend order, so a vendor sits at the same height band every month.
      const segs = [...by.values()].filter((s) => Math.abs(s.total) >= 0.005)
        .sort((a, b) => (a.vendor === OTHER ? SLOTS : rank.get(a.vendor)!) - (b.vendor === OTHER ? SLOTS : rank.get(b.vendor)!));
      months.push({ month: m, total: segs.reduce((s, x) => s + x.total, 0), segs });
    }
    return { rank, legend, months };
  }, [txns, period]);

  const colorOf = (vendor: string) => slotColor(vendor === OTHER ? SLOTS : rank.get(vendor) ?? SLOTS);
  const multi = legend.length >= 2;

  const W = 760, H = 200, padL = 56, padR = 12, padT = 22, padB = 26;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  // Stacks run up from zero for charges and down for credits, so the scale
  // spans the tallest positive stack and the deepest negative one.
  const hi = Math.max(0, ...months.map((m) => m.segs.reduce((s, x) => s + Math.max(0, x.total), 0)));
  const lo = Math.min(0, ...months.map((m) => m.segs.reduce((s, x) => s + Math.min(0, x.total), 0)));
  const { min: yMin, max: yMax, step } = tightScale(lo, hi);
  const ys = (v: number) => padT + innerH - ((v - yMin) / (yMax - yMin || 1)) * innerH;
  // Gridlines on whole steps from zero, only inside the (possibly unsnapped) range.
  const ticks: number[] = [];
  for (let v = Math.ceil(yMin / step - 1e-9) * step; v <= yMax + step * 1e-6; v += step) ticks.push(Math.abs(v) < 1e-9 ? 0 : v);

  const col = innerW / Math.max(period, 1);
  const barW = Math.min(44, col * 0.62);
  const xCol = (i: number) => padL + i * col;

  // The hover card: this vendor's charges that month, then the month's total.
  const hm = hover ? months[hover.month - 1] : null;
  const hs = hm?.segs.find((s) => s.vendor === hover!.vendor) ?? null;
  let tip: { title: string; rows: TipRow[]; footer?: TipRow } | null = null;
  if (hm && hs) {
    const shown = [...hs.charges].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, 6);
    const rows: TipRow[] = shown.map((c) => ({
      label: clip(`${shortDate(c.date)}${hs.vendor === OTHER ? ` ${c.vendorLabel}` : ""}${c.description && c.description !== c.vendorLabel ? ` · ${c.description.replace(`${c.vendorLabel} — `, "")}` : ""}`, 30),
      value: cents(c.amount),
    }));
    if (hs.charges.length > shown.length) rows.push({ label: `…and ${hs.charges.length - shown.length} more`, value: "" });
    if (hs.charges.length > 1) rows.push({ label: `${hs.charges.length} charges`, value: whole(hs.total), color: colorOf(hs.vendor) });
    tip = {
      title: `${clip(hs.label, 26)} · ${MONTHS[hm.month - 1]} ${year}`,
      rows,
      footer: multi ? { label: `${MONTHS[hm.month - 1]} total, all vendors`, value: whole(hm.total) } : undefined,
    };
  }

  return (
    <div className="mbars">
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Monthly totals by vendor for this line" style={{ overflow: "visible", display: "block" }}
        onMouseLeave={() => setHover(null)}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={padL} x2={W - padR} y1={ys(v)} y2={ys(v)} stroke={v === 0 ? "rgba(100,116,139,0.45)" : "rgba(100,116,139,0.15)"} />
            <text x={padL - 8} y={ys(v) + 4} fontSize={10.5} fill="var(--muted)" textAnchor="end">{axis(v)}</text>
          </g>
        ))}

        {months.map((m, i) => {
          const x = xCol(i) + (col - barW) / 2;
          const monthDim = selectedMonth != null && selectedMonth !== m.month;
          const pos = m.segs.filter((s) => s.total > 0);
          const neg = m.segs.filter((s) => s.total < 0);
          let up = 0, down = 0;
          const draw = (s: Segment, from: number, to: number, outer: boolean, upward: boolean) => {
            const vendorDim = selectedVendor != null && selectedVendor !== s.vendor;
            const on = hover?.month === m.month && hover.vendor === s.vendor;
            return (
              <path key={s.vendor} d={segPath(x, barW, ys(from), ys(to), upward && outer, !upward && outer)}
                fill={colorOf(s.vendor)}
                // A 2px surface gap between touching segments: the stroke is the card colour.
                stroke="var(--card)" strokeWidth={on ? 0 : 2} paintOrder="stroke"
                opacity={monthDim || vendorDim ? 0.25 : 1}
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setHover({ month: m.month, vendor: s.vendor })}
                onClick={(e) => { e.stopPropagation(); onSelectMonth(selectedMonth === m.month ? null : m.month); }} />
            );
          };
          return (
            <g key={m.month}>
              {/* The whole column is a target, so an empty or tiny month is as
                  easy to pick as a tall one. Drawn first, under the segments. */}
              <rect x={xCol(i)} y={padT - 12} width={col} height={innerH + padB + 12} fill="transparent" style={{ cursor: "pointer" }}
                onMouseEnter={() => setHover(m.segs.length ? { month: m.month, vendor: m.segs[0].vendor } : null)}
                onClick={() => onSelectMonth(selectedMonth === m.month ? null : m.month)} />
              {pos.map((s, k) => { const from = up; up += s.total; return draw(s, from, up, k === pos.length - 1, true); })}
              {neg.map((s, k) => { const from = down; down += s.total; return draw(s, from, down, k === neg.length - 1, false); })}
              {/* The month's total, only where the eye is: the picked month. */}
              {selectedMonth === m.month && Math.abs(m.total) >= 0.5 && (
                <text x={x + barW / 2} y={ys(Math.max(0, up)) - 6} fontSize={11} fontWeight={800} fill="var(--text)" textAnchor="middle" pointerEvents="none">{whole(m.total)}</text>
              )}
              <text x={x + barW / 2} y={H - padB + 17} fontSize={11} textAnchor="middle" pointerEvents="none"
                fontWeight={selectedMonth === m.month || hover?.month === m.month ? 800 : 500}
                fill={selectedMonth === m.month || hover?.month === m.month ? "var(--text)" : "var(--muted)"}>
                {MONTHS[m.month - 1]}
              </text>
            </g>
          );
        })}

        {tip && hover && (
          <ChartTooltip x={xCol(hover.month - 1) + col / 2} y={padT} chartW={W} title={tip.title} rows={tip.rows} footer={tip.footer} width={250} />
        )}
      </svg>

      {/* The legend is also the vendor filter. One vendor needs neither — the
          heading already names what the bars are. */}
      {multi && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 6px", marginTop: 6 }}>
          {legend.map((l) => {
            const active = selectedVendor === l.key;
            const dim = selectedVendor != null && !active;
            return (
              <button key={l.key} type="button" disabled={l.key === OTHER} title={l.key === OTHER ? undefined : active ? "Show every vendor" : "Show only this vendor"}
                onClick={() => l.key !== OTHER && onSelectVendor(active ? null : l.key)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 9px", borderRadius: 999,
                  border: `1px solid ${active ? "var(--brand)" : "var(--border)"}`, background: active ? "rgba(11,74,125,0.08)" : "transparent",
                  color: "var(--text)", fontSize: 12, fontWeight: active ? 800 : 600, cursor: l.key === OTHER ? "default" : "pointer", opacity: dim ? 0.5 : 1, fontFamily: "inherit",
                }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: colorOf(l.key), flexShrink: 0 }} />
                <span style={{ fontSize: 12 }}>{clip(l.label, 34)}</span>
                <span style={{ fontSize: 12, color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>{whole(l.total)}</span>
              </button>
            );
          })}
        </div>
      )}
      {months.every((m) => !m.segs.length) && (
        <div className="muted small" style={{ padding: "4px 0" }}>Nothing posted to this line in {MONTHS_LONG[0]}–{MONTHS_LONG[period - 1]}.</div>
      )}
    </div>
  );
}

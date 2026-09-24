"use client";

/**
 * A ROLL-UP line's detail ("All Shopping Centers"): which properties make up
 * its budget. A donut of the shares beside the full breakdown — the roll-up has
 * no history of its own; every figure is a property's.
 *
 * Colour follows the PROPERTY, ranked once by size: the six largest take
 * --series-1…6, the rest fold into --series-other ("Other"). A credit cannot
 * be a slice, so the table — which lists every property — is the full record.
 */
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

const SERIES = [1, 2, 3, 4, 5, 6].map((i) => `var(--series-${i})`);
const OTHER = "var(--series-other)";
const money0 = (n: number) => (n < 0 ? "(" : "") + "$" + Math.abs(Math.round(n)).toLocaleString("en-US") + (n < 0 ? ")" : "");
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const secLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" };
const th: React.CSSProperties = { ...secLabel, padding: "7px 8px", textAlign: "right", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "7px 8px", fontSize: 13, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", borderBottom: "1px solid var(--border)" };

type Share = { code: string; name: string; total: number };

export function PropertyBreakdownModal({ label, section, year, rows, onClose }: {
  label: string; section: string; year: number; rows: Share[]; onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const [active, setActive] = useState<string | null>(null);

  const sorted = useMemo(() => [...rows].sort((a, b) => b.total - a.total), [rows]);
  const total = sorted.reduce((a, r) => a + r.total, 0);
  // Ranked ONCE by size; the colour then belongs to the property.
  const colorOf = useMemo(() => {
    const m = new Map<string, string>();
    sorted.filter((r) => r.total > 0).forEach((r, i) => m.set(r.code, i < 6 ? SERIES[i] : OTHER));
    return m;
  }, [sorted]);
  // Slices: the six largest positive, then everything else positive as Other.
  const positive = sorted.filter((r) => r.total > 0);
  const slices = [
    ...positive.slice(0, 6).map((r) => ({ key: r.code, name: `${r.code} ${r.name}`, value: r.total, color: colorOf.get(r.code)! })),
    ...(positive.length > 6 ? [{ key: "__other", name: `${positive.length - 6} other`, value: positive.slice(6).reduce((a, r) => a + r.total, 0), color: OTHER }] : []),
  ];
  const pieTotal = slices.reduce((a, s) => a + s.value, 0);

  const R = 92, r = 58, C = 110;
  let angle = -Math.PI / 2;
  const arcs = slices.map((s) => {
    const sweep = pieTotal > 0 ? (s.value / pieTotal) * Math.PI * 2 : 0;
    const a0 = angle, a1 = angle + sweep;
    angle = a1;
    const large = sweep > Math.PI ? 1 : 0;
    const p = (rad: number, rr: number) => `${C + rr * Math.cos(rad)} ${C + rr * Math.sin(rad)}`;
    // A single slice is a full ring — an arc can't close on itself.
    const d = sweep >= Math.PI * 2 - 1e-6
      ? `M ${p(0, R)} A ${R} ${R} 0 1 1 ${p(Math.PI, R)} A ${R} ${R} 0 1 1 ${p(0, R)} M ${p(0, r)} A ${r} ${r} 0 1 0 ${p(Math.PI, r)} A ${r} ${r} 0 1 0 ${p(0, r)} Z`
      : `M ${p(a0, R)} A ${R} ${R} 0 ${large} 1 ${p(a1, R)} L ${p(a1, r)} A ${r} ${r} 0 ${large} 0 ${p(a0, r)} Z`;
    return { ...s, d };
  });
  const hover = arcs.find((a) => a.key === active) ?? null;
  const hoverRow = active && active !== "__other" ? sorted.find((x) => x.code === active) : null;

  const body = (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "48px 20px", overflow: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ maxWidth: 820, width: "100%", padding: 18, display: "flex", flexDirection: "column", gap: 14, boxShadow: "0 20px 60px rgba(0,0,0,0.35)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={secLabel}>{section} · {year} budget by property</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>{label} · {money0(total)}</div>
          </div>
          <button className="btn sm" onClick={onClose}>Close</button>
        </div>
        {!sorted.length ? (
          <div className="muted small">No property budgets anything on this line.</div>
        ) : (
          <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
            <svg viewBox="0 0 220 220" width={220} height={220} role="img" aria-label={`${label} by property`} style={{ flex: "0 0 auto" }}>
              {arcs.map((a) => (
                <path key={a.key} d={a.d} fill={a.color} stroke="var(--card)" strokeWidth={2}
                  opacity={active && active !== a.key ? 0.45 : 1}
                  onMouseEnter={() => setActive(a.key)} onMouseLeave={() => setActive(null)} style={{ cursor: "default" }} />
              ))}
              {/* The readout sits in the hole: the hovered slice, else the total. */}
              <text x={C} y={C - 6} textAnchor="middle" style={{ fontSize: 11, fill: "var(--muted)", fontWeight: 700 }}>
                {hover ? (hover.name.length > 22 ? hover.name.slice(0, 21) + "…" : hover.name) : "Total"}
              </text>
              <text x={C} y={C + 13} textAnchor="middle" style={{ fontSize: 15, fill: "var(--text)", fontWeight: 800 }}>
                {money0(hover ? hover.value : total)}
              </text>
              {hover && pieTotal > 0 && (
                <text x={C} y={C + 29} textAnchor="middle" style={{ fontSize: 11, fill: "var(--muted)" }}>{pct(hover.value / pieTotal)}</text>
              )}
            </svg>
            <div className="tableWrap" style={{ marginTop: 0, flex: "1 1 360px", minWidth: 0 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ ...th, textAlign: "left" }}>Property</th>
                    <th style={th}>Budget</th>
                    <th style={th}>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((x) => (
                    <tr key={x.code} onMouseEnter={() => setActive(colorOf.get(x.code) === OTHER ? "__other" : x.code)} onMouseLeave={() => setActive(null)}
                      style={{ background: hoverRow?.code === x.code ? "rgba(11,74,125,0.05)" : undefined }}>
                      <td style={{ ...td, textAlign: "left" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                          <span style={{ width: 10, height: 10, borderRadius: 3, background: colorOf.get(x.code) ?? "transparent", border: colorOf.get(x.code) ? "none" : "1px solid var(--border)", flex: "0 0 auto" }} />
                          <code style={{ fontWeight: 700, color: "var(--brand)" }}>{x.code}</code>
                          <span style={{ fontWeight: 600 }}>{x.name}</span>
                        </span>
                      </td>
                      <td style={td}>{money0(x.total)}</td>
                      <td style={{ ...td, color: "var(--muted)" }}>{total ? pct(x.total / total) : "–"}</td>
                    </tr>
                  ))}
                  <tr style={{ fontWeight: 800 }}>
                    <td style={{ ...td, textAlign: "left", borderTop: "2px solid var(--border)" }}>Total</td>
                    <td style={{ ...td, borderTop: "2px solid var(--border)" }}>{money0(total)}</td>
                    <td style={{ ...td, borderTop: "2px solid var(--border)", color: "var(--muted)" }}>100%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
  return typeof document !== "undefined" ? createPortal(body, document.body) : null;
}

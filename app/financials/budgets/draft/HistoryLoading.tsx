"use client";

// The wait while a line's history loads — five years of GL and budget read one
// at a time. Rather than a line of muted text, it SHOWS that work: a column per
// year, each filling in (budget beside actual) as it is read, the year being
// read lit and named, then a pass over the pattern. It loops until the data
// lands. Under prefers-reduced-motion it is a still chart with the label.

import { useEffect, useState } from "react";

// Fixed, plausible-looking bar heights (budget, actual) — a placeholder shape,
// not data.
const SHAPE: [number, number][] = [[0.52, 0.6], [0.58, 0.55], [0.63, 0.74], [0.7, 0.66], [0.76, 0.82]];
const PHASES = ["Reading the pattern", "Weighing budget against actual", "Working out what to budget"];

export function HistoryLoading({ lastYear, years = 5 }: { lastYear: number; years?: number }) {
  const ys = Array.from({ length: years }, (_, i) => lastYear - years + 1 + i);
  // step 0..years-1 → reading that year; years..years+PHASES-1 → a phase.
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s + 1) % (years + PHASES.length)), 620);
    return () => clearInterval(id);
  }, [years]);
  const reading = step < years ? ys[step] : null;
  const label = reading != null ? `Reading ${reading}` : PHASES[step - years];
  const sub = reading != null ? "GL actuals · budget of record" : `${years} years in`;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "18px 0 8px" }}>
      <div style={{ position: "relative", display: "flex", alignItems: "flex-end", gap: 18, height: 132, padding: "0 16px", borderBottom: "2px solid var(--border)", overflow: "hidden" }}>
        {/* a slow scan across the chart, like a ledger being read */}
        <div className="kcp-scan" aria-hidden style={{
          position: "absolute", top: 0, bottom: 0, width: 60, left: 0,
          background: "linear-gradient(90deg, transparent, rgba(11,74,125,0.10), transparent)",
          animation: "kcpScan 2.4s ease-in-out infinite",
        }} />
        {ys.map((y, i) => {
          const done = step >= years || i < step;
          const active = i === step;
          const [b, a] = SHAPE[i % SHAPE.length];
          const bar = (h: number, color: string, delay: number) => (
            <div style={{
              width: 14, height: `${Math.round(h * 110)}px`, borderRadius: "4px 4px 0 0", background: color,
              transformOrigin: "bottom", transform: `scaleY(${done || active ? 1 : 0.06})`,
              opacity: done || active ? 1 : 0.35,
              transition: `transform .5s cubic-bezier(.2,.9,.3,1.25) ${delay}s, opacity .3s ease ${delay}s`,
            }} />
          );
          return (
            <div key={y} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 112 }}>
                {bar(b, "rgba(100,116,139,0.45)", 0)}
                {bar(a, active ? "var(--brand)" : "rgba(11,74,125,0.7)", 0.08)}
              </div>
              <div className={active ? "imp-anim" : undefined} style={{
                fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", fontVariantNumeric: "tabular-nums",
                padding: "1px 7px", borderRadius: 999,
                color: active ? "#fff" : done ? "var(--text)" : "var(--muted)",
                background: active ? "var(--brand)" : "transparent",
                transition: "background .2s ease, color .2s ease",
                animation: active ? "impPop .35s ease-out" : undefined,
              }}>{y}</div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 11.5 }} className="muted">
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: "rgba(100,116,139,0.45)" }} /> Budget</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: "rgba(11,74,125,0.7)" }} /> Actual</span>
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <span className="kcp-shimmer" style={{
            fontSize: 14, fontWeight: 800,
            background: "linear-gradient(90deg, var(--text) 0%, var(--brand) 45%, var(--text) 90%)", backgroundSize: "200% 100%",
            WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
            animation: "kcpShimmer 1.9s linear infinite", display: "inline-block",
          }}>{label}</span>
          <span style={{ display: "inline-flex", gap: 4 }}>
            {[0, 0.18, 0.36].map((d) => (
              <span key={d} className="kcp-dot" style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--brand)", animation: "kcpDot 1.2s ease-in-out infinite", animationDelay: `${d}s` }} />
            ))}
          </span>
        </div>
        <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>{sub}</div>
      </div>
      {/* the shape of what is coming: the suggestion card and the KPI row */}
      <div style={{ width: "100%", display: "grid", gap: 8, marginTop: 4 }}>
        {[64, 38].map((h, i) => (
          <div key={i} className="kcp-sk" style={{
            height: h, borderRadius: 10, border: "1px solid var(--border)",
            background: "linear-gradient(90deg, rgba(15,23,42,0.03) 0%, rgba(11,74,125,0.08) 50%, rgba(15,23,42,0.03) 100%)",
            backgroundSize: "240% 100%", animation: `kcpSk 1.6s ease-in-out infinite ${i * 0.2}s`,
          }} />
        ))}
      </div>
    </div>
  );
}

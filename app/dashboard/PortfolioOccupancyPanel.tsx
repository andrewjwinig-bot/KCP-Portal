"use client";

// Full-width portfolio occupancy panel for the focused-scope dashboards
// (Nancy / Harry): a bold headline rate, a thick occupied-vs-vacant bar,
// and a per-property vertical bar chart underneath.

import Link from "next/link";

type Group = { label: string; pct: number | null; occupied: number; total: number; vacant: number };
type Occupancy = {
  pct: number;
  occupied: number;
  total: number;
  vacant: number;
  groups: Group[];
};

function sqftFmt(n: number): string {
  return n.toLocaleString();
}

function kSqft(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
}

function occColor(pct: number): string {
  return pct >= 90 ? "#16a34a" : pct >= 70 ? "#0b4a7d" : "#d97706";
}

export default function PortfolioOccupancyPanel({
  occupancy,
  loading,
  order = 0,
}: {
  occupancy: Occupancy | null;
  loading: boolean;
  order?: number;
}) {
  const BAR_H = 104;

  return (
    <Link
      href="/rentroll"
      className="card"
      style={{
        gridColumn: "1 / -1", order,
        display: "block", textDecoration: "none", color: "inherit",
        cursor: "pointer", transition: "box-shadow 0.15s",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 16px rgba(15,23,42,0.08)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = ""; }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>
          Portfolio Occupancy
        </div>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>→</span>
      </div>

      {loading ? (
        <div className="muted small">Loading…</div>
      ) : !occupancy ? (
        <div className="muted small">No rent roll uploaded yet. Upload one →</div>
      ) : (
        <>
          {/* Headline rate + occupied/vacant bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 46, fontWeight: 900, lineHeight: 1, color: occColor(occupancy.pct) }}>
                {occupancy.pct.toFixed(1)}%
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", marginTop: 5 }}>
                Occupied
              </span>
            </div>
            <div style={{ flex: 1, minWidth: 240 }}>
              <div style={{ display: "flex", height: 28, borderRadius: 8, overflow: "hidden", border: "1px solid rgba(15,23,42,0.12)" }}>
                <div style={{ width: `${occupancy.pct}%`, background: occColor(occupancy.pct) }} />
                <div style={{ flex: 1, background: "rgba(15,23,42,0.07)" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--muted)", marginTop: 7 }}>
                <span><b style={{ color: "var(--text)" }}>{sqftFmt(occupancy.occupied)}</b> occupied</span>
                <span><b style={{ color: "var(--text)" }}>{sqftFmt(occupancy.vacant)}</b> vacant</span>
                <span><b style={{ color: "var(--text)" }}>{sqftFmt(occupancy.total)}</b> total sf</span>
              </div>
            </div>
          </div>

          {/* Per-property vertical bars */}
          {occupancy.groups.length > 0 && (
            <div style={{
              marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--border)",
              display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(72px, 1fr))", gap: 12,
            }}>
              {occupancy.groups.map((g) => {
                const pct = g.pct ?? 0;
                const color = occColor(pct);
                const shortLabel = g.label.split(" ")[0];
                return (
                  <div
                    key={g.label}
                    title={`${g.label} — ${sqftFmt(g.occupied)} / ${sqftFmt(g.total)} sf · ${sqftFmt(g.vacant)} vacant`}
                    style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 0 }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 800, color }}>{pct.toFixed(1)}%</span>
                    <div style={{
                      width: 38, height: BAR_H, borderRadius: "5px 5px 0 0",
                      border: "1px solid rgba(15,23,42,0.12)", background: "rgba(15,23,42,0.05)",
                      display: "flex", flexDirection: "column-reverse", overflow: "hidden",
                    }}>
                      <div style={{ height: (pct / 100) * BAR_H, background: color }} />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text)" }}>{shortLabel}</span>
                    <span style={{ fontSize: 9, fontWeight: 600, color: "var(--muted)", whiteSpace: "nowrap" }}>
                      {kSqft(g.occupied)}/{kSqft(g.total)} sf
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </Link>
  );
}

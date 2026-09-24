"use client";

/** Every tenant behind one recovery line in one month, with what share of the
 *  expense pool that recovers — the full list behind the grid cell's hover. */
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { StatPill } from "@/app/components/Pill";
import { CATEGORY_LABEL, type RecoveryMakeup } from "@/lib/financials/budgets/recoveryMakeup";

const money0 = (n: number) => `${n < 0 ? "(" : ""}$${Math.round(Math.abs(n)).toLocaleString("en-US")}${n < 0 ? ")" : ""}`;
const pct = (n: number | null) => (n == null ? "–" : `${n.toFixed(1)}%`);
const secLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" };
const th: React.CSSProperties = { ...secLabel, padding: "7px 8px", textAlign: "right", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "8px 8px", fontSize: 13, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", borderBottom: "1px solid var(--border)" };

export function RecoveryMakeupModal({ makeup: mk, month, year, onClose }: { makeup: RecoveryMakeup; month: string; year: number; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const label = CATEGORY_LABEL[mk.category];
  const body = (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "48px 20px", overflow: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ maxWidth: 640, width: "100%", padding: 18, display: "flex", flexDirection: "column", gap: 14, boxShadow: "0 20px 60px rgba(0,0,0,0.35)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={secLabel}>{label} recoveries · {month} {year}</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>{mk.tenants.length} tenant{mk.tenants.length === 1 ? "" : "s"} · {money0(mk.total)}</div>
          </div>
          <button className="btn sm" onClick={onClose}>Close</button>
        </div>
        <div className="pills">
          <StatPill label={`${label} pool · ${month}`} value={money0(mk.pool)} />
          <StatPill label={`Recovery ratio · ${month}`} value={pct(mk.ratio)} />
          <StatPill label="Recovery ratio · year" value={pct(mk.ratioYear)} />
        </div>
        <div className="tableWrap" style={{ marginTop: 0 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: "left" }}>Tenant</th>
                <th style={{ ...th, textAlign: "left" }}>Suite</th>
                <th style={th}>{month}</th>
                <th style={th}>% of pool</th>
              </tr>
            </thead>
            <tbody>
              {mk.tenants.map((t) => (
                <tr key={t.unitRef + t.tenant}>
                  <td style={{ ...td, textAlign: "left", fontWeight: 600, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }}>{t.tenant || "—"}</td>
                  <td style={{ ...td, textAlign: "left" }}><code style={{ fontWeight: 700, color: "var(--brand)" }}>{t.unitRef}</code></td>
                  <td style={td}>{money0(t.amount)}</td>
                  <td style={{ ...td, color: "var(--muted)" }}>{Math.abs(mk.pool) >= 0.5 ? pct((t.amount / mk.pool) * 100) : "–"}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 800 }}>
                <td colSpan={2} style={{ ...td, textAlign: "left", ...secLabel, color: "var(--text)", borderTop: "2px solid var(--border)" }}>Total recovered</td>
                <td style={{ ...td, borderTop: "2px solid var(--border)" }}>{money0(mk.total)}</td>
                <td style={{ ...td, borderTop: "2px solid var(--border)" }}>{pct(mk.ratio)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
  return typeof document !== "undefined" ? createPortal(body, document.body) : null;
}

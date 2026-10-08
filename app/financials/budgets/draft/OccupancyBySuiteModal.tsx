"use client";

/**
 * Occupancy by Suite — the draft's Occupancy SF row, suite by suite. The same
 * breakdown the Operating Budgets page opens from its occupancy strip, read
 * off the draft's own suites (`tenantRevenue`): a suite is occupied in a month
 * it pays rent. Dark green = a lease in place, light green = a leasing
 * assumption — the Revenue by tenant table's colours.
 */
import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { TenantRevenueRow } from "@/lib/financials/budgets/draft";
import { ASSUMED_BG, CONTRACTED_BG } from "./RevenueByTenantCard";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const sfFmt = (n: number) => (Math.round(n) === 0 ? "—" : Math.round(n).toLocaleString("en-US"));
const secLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" };
const th: React.CSSProperties = { ...secLabel, padding: "7px 8px", textAlign: "right", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "8px 8px", fontSize: 13, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", borderBottom: "1px solid var(--border)" };

/** `buildings` (a book's roll-up) folds the suites into ONE ROW PER BUILDING —
 *  the roll-up reads at building level; a property's own tab has the suites. */
export function OccupancyBySuiteModal({ suites, year, onClose, buildings }: {
  suites: TenantRevenueRow[]; year: number; onClose: () => void;
  buildings?: { code: string; name: string }[];
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const suiteRows = suites.map((t) => ({
    name: t.tenant || "Vacant", ref: t.unitRef, sqft: t.sqft, assumed: t.assumed,
    sf: MONTHS.map((_, i) => ((t.rent[i] || 0) > 0.5 ? t.sqft : 0)),
  }));
  const rows = buildings
    ? buildings.map((b) => {
        const code = b.code.toUpperCase();
        const mine = suiteRows.filter((r) => r.ref.split("-")[0].toUpperCase() === code);
        return {
          name: b.name, ref: b.code, sqft: mine.reduce((a, r) => a + r.sqft, 0),
          // A month reads as an assumption only when every occupied foot is one.
          assumed: MONTHS.map((_, i) => { const occ = mine.filter((r) => r.sf[i] > 0); return occ.length > 0 && occ.every((r) => r.assumed[i]); }),
          sf: MONTHS.map((_, i) => mine.reduce((a, r) => a + r.sf[i], 0)),
        };
      }).filter((r) => r.sqft > 0)
    : suiteRows;
  const totals = MONTHS.map((_, i) => rows.reduce((a, r) => a + r.sf[i], 0));
  const rentable = suites.reduce((a, t) => a + t.sqft, 0);
  const avg = totals.reduce((a, v) => a + v, 0) / 12;

  const body = (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "48px 20px", overflow: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ maxWidth: 1440, width: "100%", padding: 18, display: "flex", flexDirection: "column", gap: 14, boxShadow: "0 20px 60px rgba(0,0,0,0.35)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={secLabel}>Occupancy by {buildings ? "Building" : "Suite"} · {year} Budget</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>
              {rows.length} {buildings ? "building" : "suite"}{rows.length === 1 ? "" : "s"} · Avg {sfFmt(avg)} SF
              {rentable > 0 && <span className="muted small" style={{ marginLeft: 8, fontWeight: 600 }}>({((avg / rentable) * 100).toFixed(1)}% of {sfFmt(rentable)})</span>}
            </div>
            <div className="muted small" style={{ marginTop: 4 }}>
              <span style={{ background: CONTRACTED_BG, padding: "0 5px", borderRadius: 3 }}>Dark green</span> = lease in place ·{" "}
              <span style={{ background: ASSUMED_BG, padding: "0 5px", borderRadius: 3 }}>light green</span> = leasing assumption
            </div>
          </div>
          <button className="btn sm" onClick={onClose}>Close</button>
        </div>
        <div className="tableWrap" style={{ marginTop: 0 }}>
          <table style={{ width: "100%", minWidth: 1100, borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: "left" }}>{buildings ? "Building" : "Tenant"}</th>
                <th style={{ ...th, textAlign: "left" }}>{buildings ? "Code" : "Suite"}</th>
                <th style={th}>{buildings ? "Rentable SF" : "Unit SF"}</th>
                {MONTHS.map((m) => <th key={m} style={th}>{m}</th>)}
                <th style={th}>Avg</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ name, ref, sqft, assumed, sf }, idx) => {
                const vacant = sf.every((v) => v === 0);
                return (
                  <tr key={idx} style={vacant ? { opacity: 0.6 } : undefined}>
                    <td style={{ ...td, textAlign: "left", fontWeight: vacant ? 400 : 600, fontStyle: vacant ? "italic" : undefined, color: vacant ? "var(--muted)" : undefined, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }}>{name}</td>
                    <td style={{ ...td, textAlign: "left" }}><code style={{ fontWeight: 700, color: "var(--brand)" }}>{ref}</code></td>
                    <td style={{ ...td, color: "var(--muted)" }}>{sqft.toLocaleString("en-US")}</td>
                    {sf.map((v, i) => (
                      <td key={i} style={{ ...td, background: v > 0 ? (assumed[i] ? ASSUMED_BG : CONTRACTED_BG) : undefined, color: v > 0 ? undefined : "var(--muted)" }}>{sfFmt(v)}</td>
                    ))}
                    <td style={{ ...td, fontWeight: 700 }}>{sfFmt(sf.reduce((a, v) => a + v, 0) / 12)}</td>
                  </tr>
                );
              })}
              <tr style={{ fontWeight: 800 }}>
                <td colSpan={3} style={{ ...td, textAlign: "left", ...secLabel, color: "var(--text)", borderTop: "2px solid var(--border)" }}>Total occupied SF</td>
                {totals.map((v, i) => <td key={i} style={{ ...td, borderTop: "2px solid var(--border)" }}>{sfFmt(v)}</td>)}
                <td style={{ ...td, borderTop: "2px solid var(--border)" }}>{sfFmt(avg)}</td>
              </tr>
              <tr>
                <td colSpan={3} style={{ ...td, textAlign: "left", ...secLabel }}>Occupancy %</td>
                {totals.map((v, i) => <td key={i} style={{ ...td, color: "var(--muted)" }}>{rentable ? `${((v / rentable) * 100).toFixed(1)}%` : "–"}</td>)}
                <td style={{ ...td, color: "var(--muted)" }}>{rentable ? `${((avg / rentable) * 100).toFixed(1)}%` : "–"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
  return typeof document !== "undefined" ? createPortal(body, document.body) : null;
}

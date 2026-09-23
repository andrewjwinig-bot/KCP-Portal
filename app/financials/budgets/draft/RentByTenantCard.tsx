"use client";

// Rent by tenant — every suite's rent for the budget year, month by month,
// the way the budget workbook's "Summary by Month" reads: a row per tenant, a
// column per month, totals down and across. Each month is shaded by how sure
// it is:
//   DARK GREEN  — CONTRACTED: on the rent schedule (or an in-place lease), so
//                 the lease guarantees it.
//   LIGHT GREEN — ASSUMED: a renewal, a hold past the term, or a lease-up —
//                 a leasing decision, so speculative.
// Empty cells are months nobody pays yet (a lease that ends with no decision,
// a vacancy). The rows add up exactly to the budget's rent line.

import { useState } from "react";
import { Pill, TONE_AMBER, TONE_NEUTRAL, TONE_GREEN } from "@/app/components/Pill";
import type { RentRow } from "@/lib/financials/budgets/leaseRevenue";
import { STEP_LABEL, SUB_LABEL } from "./stepStyles";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const money0 = (n: number) => (n < 0 ? "-" : "") + Math.abs(Math.round(n)).toLocaleString("en-US");
const secLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" };
/** The two shades — contracted vs assumed — shared by the cells and the legend. */
const CONTRACTED_BG = "rgba(22,163,74,0.22)";
const ASSUMED_BG = "rgba(22,163,74,0.07)";

const th: React.CSSProperties = { ...secLabel, padding: "7px 8px", textAlign: "right", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "5px 8px", fontSize: 13, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", borderBottom: "1px solid var(--border)" };

const STATUS: Record<RentRow["status"], { text: string; tone: typeof TONE_NEUTRAL } | null> = {
  contracted: null,
  expiring: { text: "EXPIRES", tone: TONE_AMBER },
  holdover: { text: "HOLDOVER", tone: TONE_AMBER },
  vacant: { text: "VACANT", tone: TONE_NEUTRAL },
  "lease-up": { text: "LEASE-UP", tone: TONE_GREEN },
};

type View = "all" | "contracted" | "assumed";

export function RentByTenantCard({ rows: allRows, year, fromSchedule, embedded = false }: {
  rows: RentRow[]; year: number; fromSchedule: boolean;
  /** Inside the Rent step's card — a section, not a card of its own. */
  embedded?: boolean;
}) {
  // All / Contracted only / Speculative only. A filter keeps just that kind of
  // month in each row (the other kind reads as a dash), drops rows left with
  // nothing, and the totals follow — so "what is guaranteed" and "what we are
  // betting on" can each be read as a number on its own.
  const [view, setView] = useState<View>("all");
  if (!allRows.length) return null;
  const yy = String(year).slice(2);
  const contracted = allRows.reduce((s, r) => s + r.months.reduce((a, v, i) => a + (r.assumed[i] ? 0 : v), 0), 0);
  const assumed = allRows.reduce((s, r) => s + r.months.reduce((a, v, i) => a + (r.assumed[i] ? v : 0), 0), 0);
  const keep = (r: RentRow, i: number) => view === "all" || (view === "assumed") === r.assumed[i];
  const rows = allRows
    .map((r) => ({ ...r, months: r.months.map((v, i) => (keep(r, i) ? v : 0)) }))
    .filter((r) => view === "all" || r.months.some((v) => Math.abs(v) > 0.5));
  const colTotals = MONTHS.map((_, i) => rows.reduce((s, r) => s + (r.months[i] || 0), 0));
  const grand = colTotals.reduce((a, b) => a + b, 0);
  const seg = (v: View, label: string) => (
    <button type="button" className={view === v ? "btn primary" : "btn"} onClick={() => setView(v)}
      style={{ fontSize: 12, padding: "4px 12px", fontWeight: 700 }} aria-pressed={view === v}>{label}</button>
  );

  return (
    <div className={embedded ? undefined : "card"} style={embedded ? { borderTop: "2px solid var(--border)" } : { padding: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>
        <div>
          <div style={embedded ? SUB_LABEL : STEP_LABEL}>Rent by tenant — {year}</div>
          <div className="muted small" style={{ marginTop: 2 }}>
            {fromSchedule ? "From the rent schedule, plus the leasing decisions above." : "From today's rent roll (import the rent schedule for contracted steps), plus the leasing decisions above."}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 12, flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", gap: 4 }}>
            {seg("all", "All")}
            {seg("contracted", "Contracted")}
            {seg("assumed", "Speculative")}
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 14, height: 14, borderRadius: 3, background: CONTRACTED_BG, border: "1px solid rgba(22,163,74,0.35)" }} />
            Contracted <b style={{ fontVariantNumeric: "tabular-nums" }}>${money0(contracted)}</b>
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 14, height: 14, borderRadius: 3, background: ASSUMED_BG, border: "1px dashed rgba(22,163,74,0.45)" }} />
            Assumed <b style={{ fontVariantNumeric: "tabular-nums" }}>${money0(assumed)}</b>
          </span>
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: "left" }}>Suite · Tenant</th>
              {MONTHS.map((m) => <th key={m} style={th}>{m} {yy}</th>)}
              <th style={{ ...th, borderLeft: "1px solid var(--border)" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={14} className="muted small" style={{ ...td, textAlign: "left", padding: 14 }}>
                {view === "assumed" ? "No speculative rent yet — nothing has been assumed renewed or leased up." : "No contracted rent."}
              </td></tr>
            )}
            {rows.map((r) => {
              const total = r.months.reduce((a, b) => a + b, 0);
              const st = STATUS[r.status];
              return (
                <tr key={r.unitRef}>
                  <td style={{ ...td, textAlign: "left", minWidth: 230 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <code style={{ fontSize: 12 }}>{r.unitRef}</code>
                      <span style={{ fontWeight: 600, color: r.tenant ? "var(--text)" : "var(--muted)" }}>{r.tenant || "Vacant"}</span>
                      {st && r.status !== "vacant" && <Pill tone={st.tone}>{st.text}</Pill>}
                    </span>
                  </td>
                  {r.months.map((v, i) => {
                    const has = Math.abs(v) > 0.5;
                    return (
                      <td key={i} style={{ ...td, background: has ? (r.assumed[i] ? ASSUMED_BG : CONTRACTED_BG) : undefined, color: has ? "var(--text)" : "var(--muted)" }}>
                        {has ? money0(v) : "–"}
                      </td>
                    );
                  })}
                  <td style={{ ...td, fontWeight: 800, borderLeft: "1px solid var(--border)" }}>{Math.abs(total) > 0.5 ? money0(total) : "–"}</td>
                </tr>
              );
            })}
            <tr style={{ background: "rgba(11,74,125,0.06)" }}>
              <td style={{ ...td, textAlign: "left", fontWeight: 800, borderTop: "2px solid rgba(11,74,125,0.3)" }}>
                {view === "all" ? "Total rent" : view === "contracted" ? "Total contracted" : "Total speculative"}
              </td>
              {colTotals.map((v, i) => <td key={i} style={{ ...td, fontWeight: 800, borderTop: "2px solid rgba(11,74,125,0.3)" }}>{money0(v)}</td>)}
              <td style={{ ...td, fontWeight: 900, borderTop: "2px solid rgba(11,74,125,0.3)", borderLeft: "1px solid var(--border)" }}>{money0(grand)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

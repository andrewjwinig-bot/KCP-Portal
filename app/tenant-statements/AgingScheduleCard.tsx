"use client";

// A/R AGING SCHEDULE (owner: "an aging schedule chart … so we can see how the
// AR is aged"). One stacked bar for the portfolio, then the classic schedule —
// a row per property, Current / 1–30 / 31–60 / 61–90 / 90+ — each row carrying
// its own bar, so the old money stands out without reading the figures.
// Credits are their OWN column, never netted into Current: the laser
// statement's credit row is undated, and netting it in would make a month read
// paid that is not. Click a property to filter the roster below.

import { HoverCard } from "@/app/components/HoverCard";
import { th, td, thL, tdL } from "@/app/components/tableStyles";
import { AGING_LABEL, AGING_ORDER, type AgingBucket } from "@/lib/statements/types";
import type { AgingRow, AgingSchedule } from "@/lib/statements/openCredits";

const money0 = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");

/** Severity, not category: blue for current, amber deepening to red with age. */
const AGE_COLOR: Record<AgingBucket, string> = {
  current: "var(--series-1)",
  d30: "var(--c-f2b84b)",
  d60: "var(--c-e8893a)",
  d90: "var(--c-d9622b)",
  d90plus: "var(--c-b91c1c)",
};

function AgeBar({ row, height = 12 }: { row: AgingRow; height?: number }) {
  const total = row.charges;
  if (total < 0.005) return <div className="muted" style={{ fontSize: "var(--fs-12)" }}>—</div>;
  return (
    <HoverCard title={row.propertyCode === "Total" ? "All properties" : row.propertyCode}
      rows={AGING_ORDER.filter((b) => row.buckets[b] > 0.005).map((b) => ({
        label: AGING_LABEL[b], value: `${money0(row.buckets[b])} · ${Math.round((row.buckets[b] / total) * 100)}%`, color: AGE_COLOR[b],
      }))}
      footer={row.credits > 0.005 ? { label: "Open credits", value: `-${money0(row.credits)}`, color: "var(--c-15803d)" } : undefined}
      style={{ display: "block" }}>
      <div style={{ display: "flex", height, borderRadius: 4, overflow: "hidden", background: "var(--border)", minWidth: 120 }}>
        {AGING_ORDER.map((b) => row.buckets[b] > 0.005 && (
          <div key={b} style={{ width: `${(row.buckets[b] / total) * 100}%`, background: AGE_COLOR[b] }} />
        ))}
      </div>
    </HoverCard>
  );
}

export function AgingScheduleCard({ schedule, nameOf, active, onPick }: {
  schedule: AgingSchedule;
  nameOf: (code: string) => string;
  active: string;
  onPick: (code: string) => void;
}) {
  const t = schedule.total;
  const pastDue = t.charges - t.buckets.current;
  return (
    <div className="card" style={{ padding: 0, display: "grid", gap: 12 }}>
      <div style={{ padding: "16px 18px 0", display: "grid", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>A/R Aging Schedule</div>
          <div className="muted small">
            {money0(t.charges)} open charges · {money0(pastDue)} past due ({t.charges > 0 ? Math.round((pastDue / t.charges) * 100) : 0}%)
            {t.credits > 0.005 ? ` · ${money0(t.credits)} credits` : ""}
          </div>
        </div>
        <AgeBar row={t} height={22} />
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: "var(--fs-12)" }}>
          {AGING_ORDER.map((b) => (
            <span key={b} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span aria-hidden style={{ width: 10, height: 10, borderRadius: 2, background: AGE_COLOR[b] }} />
              {AGING_LABEL[b]} <b style={{ fontVariantNumeric: "tabular-nums" }}>{money0(t.buckets[b])}</b>
            </span>
          ))}
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
          <thead>
            <tr>
              <th style={thL}>Property</th>
              {AGING_ORDER.map((b) => <th key={b} style={th}>{AGING_LABEL[b]}</th>)}
              <th style={th}>Charges</th>
              <th style={th}>Credits</th>
              <th style={th}>Net</th>
              <th style={{ ...thL, width: 160 }}>Aging</th>
            </tr>
          </thead>
          <tbody>
            {schedule.rows.map((r) => {
              const on = active === r.propertyCode;
              return (
                <tr key={r.propertyCode} onClick={() => onPick(on ? "All" : r.propertyCode)}
                  title={on ? "Show all properties" : "Filter the roster to this property"}
                  style={{ cursor: "pointer", borderTop: "1px solid var(--border)", background: on ? "var(--tint-brand-bg, rgba(11,74,125,0.07))" : undefined }}>
                  <td style={{ ...tdL, whiteSpace: "normal" }}>
                    <span style={{ fontWeight: 700 }}>{r.propertyCode}</span>{" "}
                    <span className="muted" style={{ fontSize: "var(--fs-12-5)" }}>{nameOf(r.propertyCode)}</span>
                  </td>
                  {AGING_ORDER.map((b) => (
                    <td key={b} style={{ ...td, color: b !== "current" && r.buckets[b] > 0.005 ? (b === "d90plus" ? "var(--c-b91c1c)" : "var(--c-b45309)") : undefined,
                      fontWeight: b === "d90plus" && r.buckets[b] > 0.005 ? 700 : undefined }}>
                      {r.buckets[b] > 0.005 ? money0(r.buckets[b]) : <span className="muted">—</span>}
                    </td>
                  ))}
                  <td style={{ ...td, fontWeight: 700 }}>{money0(r.charges)}</td>
                  <td style={{ ...td, color: "var(--c-15803d)" }}>{r.credits > 0.005 ? `-${money0(r.credits)}` : <span className="muted">—</span>}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{money0(r.net)}</td>
                  <td style={tdL}><AgeBar row={r} /></td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 800 }}>
              <td style={tdL}>Total</td>
              {AGING_ORDER.map((b) => <td key={b} style={td}>{money0(t.buckets[b])}</td>)}
              <td style={td}>{money0(t.charges)}</td>
              <td style={{ ...td, color: "var(--c-15803d)" }}>{t.credits > 0.005 ? `-${money0(t.credits)}` : "—"}</td>
              <td style={td}>{money0(t.net)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

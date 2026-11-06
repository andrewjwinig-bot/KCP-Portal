"use client";

// CAM ESTIMATES ON A BOOK'S ROLL-UP — one row per PROPERTY, not one per tenant
// (owner: "use the roll up as a glance to then look for things that we can
// drill down on individual budgets"). Each property's tenants are billed so
// much a month today; the budget's estimates bill so much; the change; and how
// many of its tenants jump (the same ▲ rule as CAM Estimates by Tenant). Click
// a property to open its own tab, where the tenant-by-tenant card lives.

import { useMemo } from "react";
import { Pill, TONE_AMBER } from "@/app/components/Pill";
import { th, td, thL, tdL } from "@/app/components/tableStyles";
import { estimateRows } from "@/lib/financials/budgets/estimatesByTenant";
import type { TenantRevenueRow } from "@/lib/financials/budgets/draft";

const money0 = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const signed = (n: number) => (Math.abs(n) < 0.5 ? "–" : `${n > 0 ? "+" : "−"}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`);
const pctS = (n: number | null) => (n == null ? "new" : Math.abs(n) < 0.05 ? "0%" : `${n > 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}%`);
const UP = "#b45309", DOWN = "#15803d";
const tone = (n: number) => (n > 0.5 ? UP : n < -0.5 ? DOWN : "var(--muted)");

export function EstimatesByPropertyCard({ rows, properties, year, onOpen }: {
  rows: TenantRevenueRow[];
  properties: { code: string; name: string }[];
  year: number;
  onOpen: (code: string) => void;
}) {
  const list = useMemo(() => {
    const est = estimateRows(rows);
    return properties.map((p) => {
      const mine = est.filter((r) => r.unitRef.split("-")[0].toUpperCase() === p.code.toUpperCase());
      const now = mine.reduce((a, r) => a + (r.now?.total ?? 0), 0);
      const next = mine.reduce((a, r) => a + r.next.total, 0);
      return { ...p, tenants: mine.length, jumps: mine.filter((r) => r.jump).length, now, next, change: next - now, pct: now > 0.5 ? ((next - now) / now) * 100 : null };
    }).filter((x) => x.tenants > 0);
  }, [rows, properties]);
  if (!list.length) return null;
  const tot = list.reduce((a, x) => ({ now: a.now + x.now, next: a.next + x.next, jumps: a.jumps + x.jumps, tenants: a.tenants + x.tenants }), { now: 0, next: 0, jumps: 0, tenants: 0 });
  const totChange = tot.next - tot.now;

  return (
    <div className="card" style={{ padding: 0 }}>
      <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 16, fontWeight: 800 }}>CAM Estimates by Property</span>
        {tot.jumps > 0 && <Pill tone={TONE_AMBER}>▲ {tot.jumps} big jump{tot.jumps === 1 ? "" : "s"}</Pill>}
        <span className="muted small">Monthly CAM + INS + RET billed today against the {year} estimates, summed per property. Click a property for its tenants.</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thL}>Property</th>
              <th style={th}>Tenants</th>
              <th style={th}>Today / mo</th>
              <th style={th}>{year} / mo</th>
              <th style={th}>Change</th>
              <th style={th}>%</th>
              <th style={th}>Big jumps</th>
            </tr>
          </thead>
          <tbody>
            {list.map((x) => (
              <tr key={x.code} onClick={() => onOpen(x.code)} style={{ cursor: "pointer" }}>
                <td style={tdL}><code style={{ fontSize: 12, fontWeight: 700, color: "var(--brand)" }}>{x.code}</code> <span style={{ fontWeight: 600 }}>{x.name}</span></td>
                <td style={{ ...td, color: "var(--muted)" }}>{x.tenants}</td>
                <td style={td}>{money0(x.now)}</td>
                <td style={{ ...td, fontWeight: 700 }}>{money0(x.next)}</td>
                <td style={{ ...td, color: tone(x.change) }}>{signed(x.change)}</td>
                <td style={{ ...td, color: tone(x.change) }}>{pctS(x.pct)}</td>
                <td style={td}>{x.jumps ? <Pill tone={TONE_AMBER}>▲ {x.jumps}</Pill> : <span className="muted">–</span>}</td>
              </tr>
            ))}
            <tr style={{ fontWeight: 800 }}>
              <td style={{ ...tdL, borderTop: "2px solid var(--border)" }}>Total</td>
              <td style={{ ...td, borderTop: "2px solid var(--border)", color: "var(--muted)" }}>{tot.tenants}</td>
              <td style={{ ...td, borderTop: "2px solid var(--border)" }}>{money0(tot.now)}</td>
              <td style={{ ...td, borderTop: "2px solid var(--border)" }}>{money0(tot.next)}</td>
              <td style={{ ...td, borderTop: "2px solid var(--border)", color: tone(totChange) }}>{signed(totChange)}</td>
              <td style={{ ...td, borderTop: "2px solid var(--border)", color: tone(totChange) }}>{pctS(tot.now > 0.5 ? (totChange / tot.now) * 100 : null)}</td>
              <td style={{ ...td, borderTop: "2px solid var(--border)" }}>{tot.jumps || "–"}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

"use client";

// CAM ESTIMATES BY TENANT — the table for the conversation the January
// estimate letters start. Per tenant: what they are billed a month TODAY for
// CAM / INS / RET (the rent roll), what the budget bills them, the change in
// dollars and percent, and the whole monthly bill (base rent + recoveries)
// before and after — the number a tenant quotes back on the phone. Figures
// come from `estimatesByTenant.ts`, the same monthly estimate the ▲ flag in
// Revenue by tenant reads, so the two views cannot disagree.

import { useMemo, useState } from "react";
import { StatPill, Pill, TONE_AMBER, TONE_NEUTRAL, PortionPill } from "@/app/components/Pill";
import { HoverCard } from "@/app/components/HoverCard";
import { DownloadMenu } from "@/app/components/DownloadMenu";
import { estimateRows, estimateTotals, type EstimateRow } from "@/lib/financials/budgets/estimatesByTenant";
import { buildEstimatesXlsx } from "@/lib/financials/budgets/estimatesExport";
import type { TenantRevenueRow } from "@/lib/financials/budgets/draft";
import type { ReimbursementEstimate } from "@/lib/financials/budgets/reimbursementEstimate";
import { tenantTip } from "./RevenueByTenantCard";

const money0 = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const signed = (n: number) => (Math.abs(n) < 0.5 ? "–" : `${n > 0 ? "+" : "−"}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`);
const pctS = (n: number | null) => (n == null ? "new" : Math.abs(n) < 0.05 ? "0%" : `${n > 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}%`);
const psf = (monthly: number, sf: number) => (sf > 0 ? `$${((monthly * 12) / sf).toFixed(2)}` : "–");
const secLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" };
const th: React.CSSProperties = { ...secLabel, padding: "7px 8px", textAlign: "right", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "9px 8px", fontSize: 13.5, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", borderBottom: "1px solid var(--border)" };
const SUITE: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "#0b4a7d", whiteSpace: "nowrap" };
const DIVIDE = "2px solid var(--border)";
const UP = "#b45309", DOWN = "#15803d";
const tone = (n: number) => (n > 0.5 ? UP : n < -0.5 ? DOWN : "var(--muted)");

type Sort = "suite" | "change" | "pct";
type Unit = "month" | "psf";

export function EstimatesByTenantCard({ rows, est, year, propertyName, propertyCode }: {
  rows: TenantRevenueRow[]; est?: ReimbursementEstimate; year: number; propertyName: string; propertyCode: string;
}) {
  const [open, setOpen] = useState(true);
  const [sort, setSort] = useState<Sort>("suite");
  const [unit, setUnit] = useState<Unit>("month");
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const all = useMemo(() => estimateRows(rows), [rows]);
  const byRef = useMemo(() => new Map(rows.map((r) => [r.unitRef + r.tenant, r])), [rows]);
  const tot = useMemo(() => estimateTotals(all), [all]);
  const shown = useMemo(() => {
    const list = onlyFlagged ? all.filter((r) => r.jump) : all.slice();
    if (sort === "change") list.sort((a, b) => b.change - a.change);
    if (sort === "pct") list.sort((a, b) => (b.changePct ?? -Infinity) - (a.changePct ?? -Infinity));
    return list;
  }, [all, sort, onlyFlagged]);
  if (!all.length) return null;

  const v = (monthly: number, sf: number) => (unit === "month" ? money0(monthly) : psf(monthly, sf));
  const download = async () => {
    const buf = await buildEstimatesXlsx({ propertyName, propertyCode, year, rows: shown });
    const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const a = document.createElement("a");
    a.href = url; a.download = `${propertyCode} ${year} CAM estimates by tenant.xlsx`; a.click();
    URL.revokeObjectURL(url);
  };
  const seg = (active: boolean): React.CSSProperties => ({
    fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 999, cursor: "pointer",
    border: `1px solid ${active ? "var(--brand)" : "var(--border)"}`, background: active ? "rgba(11,74,125,0.10)" : "var(--card)",
    color: active ? "var(--brand)" : "var(--text)",
  });

  return (
    <div className="card" id="cam-estimates" style={{ padding: 0 }}>
      <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
          style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>{open ? "▾" : "▸"}</span>
          <span style={{ fontSize: 16, fontWeight: 800, color: "var(--text)" }}>CAM estimates by tenant</span>
        </button>
        <span className="muted small">What each tenant is billed a month today vs the {year} budget — the change their January letter carries</span>
        <span style={{ flex: 1 }} />
        {open && <DownloadMenu items={[{ label: "Excel (.xlsx)", description: "The table as shown, with live formulas", onClick: download }]} />}
      </div>

      {open && (
        <>
          <div className="pills" style={{ padding: "0 14px 12px" }}>
            <StatPill label="Recoveries billed today" value={`${money0(tot.now.recoveries)}/mo`} sub={`${tot.tenants} tenants`} />
            <StatPill label={`${year} budget`} value={`${money0(tot.next.recoveries)}/mo`} sub="CAM + INS + RET" />
            <StatPill label="Change" value={signed(tot.change)} sub={`${pctS(tot.changePct)} a month`} accent={tone(tot.change)} />
            <StatPill label="Big jumps" value={String(tot.flagged)} sub="≥15% and ≥$100/mo" accent={tot.flagged ? UP : undefined} />
          </div>

          <div style={{ padding: "0 14px 10px", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <span style={secLabel}>Sort</span>
            <button type="button" style={seg(sort === "suite")} onClick={() => setSort("suite")}>Suite order</button>
            <button type="button" style={seg(sort === "change")} onClick={() => setSort("change")}>Biggest $ change</button>
            <button type="button" style={seg(sort === "pct")} onClick={() => setSort("pct")}>Biggest % change</button>
            <span style={{ width: 12 }} />
            <span style={secLabel}>Show</span>
            <button type="button" style={seg(unit === "month")} onClick={() => setUnit("month")}>$ / month</button>
            <button type="button" style={seg(unit === "psf")} onClick={() => setUnit("psf")}>$ / SF / yr</button>
            {tot.flagged > 0 && (
              <button type="button" style={seg(onlyFlagged)} onClick={() => setOnlyFlagged((f) => !f)}>▲ Big jumps · {tot.flagged}</button>
            )}
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: "left" }} colSpan={3} />
                  <th style={{ ...th, textAlign: "center", borderLeft: DIVIDE }} colSpan={4}>Billed today</th>
                  <th style={{ ...th, textAlign: "center", borderLeft: DIVIDE }} colSpan={4}>{year} budget</th>
                  <th style={{ ...th, textAlign: "center", borderLeft: DIVIDE }} colSpan={2}>Recoveries change</th>
                  <th style={{ ...th, textAlign: "center", borderLeft: DIVIDE }} colSpan={3}>Whole monthly bill (rent + recoveries)</th>
                </tr>
                <tr>
                  <th style={{ ...th, textAlign: "left" }}>Tenant</th><th style={{ ...th, textAlign: "left" }}>Suite</th><th style={th}>SF</th>
                  <th style={{ ...th, borderLeft: DIVIDE }}>CAM</th><th style={th}>INS</th><th style={th}>RET</th><th style={th}>Total</th>
                  <th style={{ ...th, borderLeft: DIVIDE }}>CAM</th><th style={th}>INS</th><th style={th}>RET</th><th style={th}>Total</th>
                  <th style={{ ...th, borderLeft: DIVIDE }}>$ / mo</th><th style={th}>%</th>
                  <th style={{ ...th, borderLeft: DIVIDE }}>Today</th><th style={th}>{year}</th><th style={th}>Change</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((e) => <Row key={e.unitRef + e.tenant} e={e} v={v} src={byRef.get(e.unitRef + e.tenant)} est={est} year={year} />)}
                <tr style={{ fontWeight: 800 }}>
                  <td style={{ ...td, textAlign: "left", borderTop: DIVIDE }} colSpan={2}>Total{onlyFlagged ? " · all tenants" : ""}</td>
                  <td style={{ ...td, borderTop: DIVIDE }}>{Math.round(all.reduce((a, r) => a + r.sqft, 0)).toLocaleString("en-US")}</td>
                  {(["cam", "ins", "ret", "recoveries"] as const).map((k, i) => (
                    <td key={`n${k}`} style={{ ...td, borderTop: DIVIDE, ...(i === 0 ? { borderLeft: DIVIDE } : {}) }}>{money0(tot.now[k])}</td>
                  ))}
                  {(["cam", "ins", "ret", "recoveries"] as const).map((k, i) => (
                    <td key={`x${k}`} style={{ ...td, borderTop: DIVIDE, ...(i === 0 ? { borderLeft: DIVIDE } : {}) }}>{money0(tot.next[k])}</td>
                  ))}
                  <td style={{ ...td, borderTop: DIVIDE, borderLeft: DIVIDE, color: tone(tot.change) }}>{signed(tot.change)}</td>
                  <td style={{ ...td, borderTop: DIVIDE, color: tone(tot.change) }}>{pctS(tot.changePct)}</td>
                  <td style={{ ...td, borderTop: DIVIDE, borderLeft: DIVIDE }}>{money0(tot.now.total)}</td>
                  <td style={{ ...td, borderTop: DIVIDE }}>{money0(tot.next.total)}</td>
                  <td style={{ ...td, borderTop: DIVIDE, color: tone(tot.next.total - tot.now.total) }}>{signed(tot.next.total - tot.now.total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="muted small" style={{ padding: "8px 14px 12px" }}>
            Today = the rent roll&rsquo;s monthly Operating Expense (CAM), Other Expense (INS) and Real Estate Tax. {year} budget = each category&rsquo;s budgeted recovery averaged over the months it is billed — the monthly estimate. The whole bill&rsquo;s {year} rent is its first month. Amber ▲ = up 15%+ and $100+/month.
          </div>
        </>
      )}
    </div>
  );
}

function Row({ e, v, src, est, year }: { e: EstimateRow; v: (m: number, sf: number) => string; src?: TenantRevenueRow; est?: ReimbursementEstimate; year: number }) {
  const tip = src ? tenantTip(src, est, ["cam", "ins", "ret"], "Recoveries") : null;
  const name = <span style={{ fontWeight: 600 }}>{e.tenant || "(unnamed)"}</span>;
  const n = e.now;
  const cell = (x: number | undefined) => (x == null ? "–" : Math.abs(x) < 0.5 ? "–" : v(x, e.sqft));
  return (
    <tr style={e.jump ? { background: "rgba(217,119,6,0.06)" } : undefined}>
      <td style={{ ...td, textAlign: "left", whiteSpace: "normal", minWidth: 200 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {tip ? <HoverCard title={`${e.tenant || "—"} · ${e.unitRef}`} width={420} rows={tip.rows} footer={tip.footer}>{name}</HoverCard> : name}
          <PortionPill portion={e.portion} />
          {!n && <Pill tone={TONE_NEUTRAL}>New</Pill>}
          {e.assumed && <Pill tone={TONE_NEUTRAL}>Assumed</Pill>}
        </span>
      </td>
      <td style={{ ...td, textAlign: "left" }}><code style={SUITE}>{e.unitRef}</code></td>
      <td style={td}>{e.sqft ? Math.round(e.sqft).toLocaleString("en-US") : "–"}</td>
      <td style={{ ...td, borderLeft: DIVIDE }}>{cell(n?.cam)}</td><td style={td}>{cell(n?.ins)}</td><td style={td}>{cell(n?.ret)}</td>
      <td style={{ ...td, fontWeight: 700 }}>{cell(n?.recoveries)}</td>
      <td style={{ ...td, borderLeft: DIVIDE }}>{cell(e.next.cam)}</td><td style={td}>{cell(e.next.ins)}</td><td style={td}>{cell(e.next.ret)}</td>
      <td style={{ ...td, fontWeight: 700 }}>{cell(e.next.recoveries)}</td>
      <td style={{ ...td, borderLeft: DIVIDE, fontWeight: 700, color: tone(e.change) }}>
        {e.jump ? (
          <HoverCard title={`${e.tenant} · estimates jump`} width={300}
            rows={e.jump.parts.map((p) => ({ label: p.part.toUpperCase(), value: `${money0(p.now)} → ${money0(p.next)}/mo`, color: tone(p.next - p.now) }))}
            footer={{ label: `${year} vs today`, value: `${signed(e.jump.changeDollars)} (${pctS(e.jump.changePct)})`, color: UP }}>
            <span>▲ {signed(e.change)}</span>
          </HoverCard>
        ) : signed(e.change)}
      </td>
      <td style={{ ...td, color: tone(e.change) }}>{e.jump ? <Pill tone={TONE_AMBER}>{pctS(e.changePct)}</Pill> : pctS(e.changePct)}</td>
      <td style={{ ...td, borderLeft: DIVIDE }}>{n ? money0(n.total) : "–"}</td>
      <td style={td}>{money0(e.next.total)}</td>
      <td style={{ ...td, color: e.totalChange == null ? "var(--muted)" : tone(e.totalChange) }}>{e.totalChange == null ? "–" : signed(e.totalChange)}</td>
    </tr>
  );
}

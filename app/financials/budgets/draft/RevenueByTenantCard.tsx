"use client";

// Revenue by tenant — ONE table for every suite's budget-year income: base
// rent and its CAM, insurance and real-estate-tax recoveries, month by month.
// A row per suite (vacancies and gross leases included, so a suite paying
// nothing is plain to see), a column per month, totals down and across — the
// workbook's "Summary by Month", with the recoveries beside the rent instead of
// in a second table of the same tenants.
//
// Filters: GROSS (everything) · BASE RENT · RECOVERIES · CAM · INS · RET, and
// separately ALL · CONTRACTED · SPECULATIVE. Each month is shaded by how sure
// it is: DARK green = a lease in place (the schedule / rent roll guarantees
// it), LIGHT green = a leasing decision (renewal, hold, lease-up).
//
// The totals ARE the budget's revenue lines (rent from the leases, recoveries
// from each tenant's CAM methodology on the budget's own pools), which is why
// those lines cannot be typed over in the grid. One TIES mark says so.

import { Fragment, useState } from "react";
import { Pill, TONE_AMBER, TONE_GREEN, TONE_NEUTRAL, TONE_BLUE, tiesTone } from "@/app/components/Pill";
import { HoverCard, type TipRow } from "@/app/components/HoverCard";
import type { ReimbursementEstimate } from "@/lib/financials/budgets/reimbursementEstimate";
import type { RecoveryTie, TenantRevenueRow } from "@/lib/financials/budgets/draft";
import { STEP_LABEL, SUB_LABEL } from "./stepStyles";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const money0 = (n: number) => (n < 0 ? "-" : "") + Math.abs(Math.round(n)).toLocaleString("en-US");
const pct = (n: number) => `${(+n).toFixed(2).replace(/\.?0+$/, "")}%`;
const secLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" };
const th: React.CSSProperties = { ...secLabel, padding: "7px 8px", textAlign: "right", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "5px 8px", fontSize: 13, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", borderBottom: "1px solid var(--border)" };
const CONTRACTED_BG = "rgba(22,163,74,0.22)";
const ASSUMED_BG = "rgba(22,163,74,0.07)";
const TOTAL_BORDER = "2px solid rgba(11,74,125,0.3)";

type Part = "rent" | "cam" | "ins" | "ret";
type View = "gross" | "rent" | "recoveries" | "cam" | "ins" | "ret";
type Sure = "all" | "contracted" | "assumed";
const PARTS: Record<View, Part[]> = {
  gross: ["rent", "cam", "ins", "ret"], rent: ["rent"], recoveries: ["cam", "ins", "ret"],
  cam: ["cam"], ins: ["ins"], ret: ["ret"],
};
const PART_LABEL: Record<Part, string> = { rent: "Base rent", cam: "CAM", ins: "Insurance", ret: "RE tax" };
const VIEW_LABEL: Record<View, string> = { gross: "Gross", rent: "Base rent", recoveries: "Recoveries", cam: "CAM", ins: "INS", ret: "RET" };

const STATUS: Record<TenantRevenueRow["status"], { text: string; tone: typeof TONE_NEUTRAL } | null> = {
  contracted: null,
  expiring: { text: "EXPIRES", tone: TONE_AMBER },
  holdover: { text: "HOLDOVER", tone: TONE_AMBER },
  vacant: null,
  "lease-up": { text: "LEASE-UP", tone: TONE_GREEN },
};

/** How a suite's recoveries were reached — its methodology, for the hover. */
function methodTip(r: TenantRevenueRow, est: ReimbursementEstimate | undefined): TipRow[] {
  const m = r.method;
  const rows: TipRow[] = [];
  if (!est) return rows;
  if (m?.kind === "retail") {
    if (m.grossLease) rows.push({ label: "Lease", value: "Gross — pays no recoveries", color: "#b45309" });
    rows.push({ label: "Share (PRS)", value: `CAM ${pct(m.camPrs)} · INS ${pct(m.insPrs)} · RET ${pct(m.retPrs)}` });
    if (m.adminFeePct) rows.push({ label: "Admin fee", value: pct(m.adminFeePct) });
    if (m.excludedLines) rows.push({ label: "Excluded CAM lines", value: String(m.excludedLines) });
    if (m.capPct != null) rows.push({ label: "CAM cap", value: `${pct(m.capPct)} / yr on controllables` });
    rows.push({ label: `${est.reconYear} recon due`, value: `CAM ${money0(m.recon.cam)} · INS ${money0(m.recon.ins)} · RET ${money0(m.recon.ret)}` });
    if (m.reconOcc != null) rows.push({ label: "Part year in recon", value: `${Math.round(m.reconOcc * 100)}% — scaled to a full year`, color: "#b45309" });
    rows.push({ label: "Pool change", value: `CAM ×${est.ratios.cam} · INS ×${est.ratios.ins} · RET ×${est.ratios.ret}` });
  } else if (m?.kind === "office") {
    rows.push({ label: "Pro-rata share", value: pct(m.proRataPct) });
    rows.push({ label: "Base year", value: m.noBaseStop ? "None — pays the full share" : m.baseYear ? String(m.baseYear) : "—" });
    rows.push({ label: `${est.reconYear} recon due`, value: `OpEx ${money0(m.recon.cam)} · RET ${money0(m.recon.ret)}` });
  } else if (m?.kind === "leaseup" || m?.kind === "new") {
    rows.push({ label: "Recoveries", value: m.kind === "new" && m.assumption === "base-year" ? "Base year is current — nothing yet" : `Assumed NNN, pro rata on ${m.sqft.toLocaleString("en-US")} SF` });
  }
  return rows;
}

export function RevenueByTenantCard({ rows: allRows, year, fromSchedule, est, tie, rentLine, embedded = false }: {
  rows: TenantRevenueRow[]; year: number; fromSchedule: boolean;
  est?: ReimbursementEstimate; tie: RecoveryTie[]; rentLine?: string;
  embedded?: boolean;
}) {
  const [view, setView] = useState<View>("gross");
  const [sure, setSure] = useState<Sure>("all");
  if (!allRows.length) return null;
  const yy = String(year).slice(2);
  const office = est?.kind === "office";
  const parts = PARTS[view].filter((p) => !(office && p === "ins"));
  const keepMonth = (r: TenantRevenueRow, i: number) => sure === "all" || (sure === "assumed") === !!r.assumed[i];
  const cellsOf = (r: TenantRevenueRow, ps: Part[]) => MONTHS.map((_, i) => (keepMonth(r, i) ? ps.reduce((a, p) => a + (r[p][i] || 0), 0) : 0));
  const rows = allRows.map((r) => ({ r, months: cellsOf(r, parts) }))
    .filter(({ months }) => sure === "all" || months.some((v) => Math.abs(v) > 0.5));
  const partTotals = (p: Part) => MONTHS.map((_, i) => rows.reduce((a, { r }) => a + (keepMonth(r, i) ? r[p][i] || 0 : 0), 0));
  const grandMonths = MONTHS.map((_, i) => rows.reduce((a, x) => a + x.months[i], 0));
  const allTie = tie.length === 0 || tie.every((t) => t.ties);
  const lineOf = (p: Part) => p === "rent" ? rentLine : tie.find((t) => t.basis === p)?.lines.map((l) => l.label).join(" + ");

  const seg = <V extends string>(cur: V, v: V, label: string, set: (v: any) => void) => (
    <button key={v} type="button" className={cur === v ? "btn primary" : "btn"} onClick={() => set(v)}
      style={{ fontSize: 12, padding: "4px 11px", fontWeight: 700 }} aria-pressed={cur === v}>{label}</button>
  );
  const views: View[] = office ? ["gross", "rent", "recoveries", "cam", "ret"] : ["gross", "rent", "recoveries", "cam", "ins", "ret"];

  const totalRow = (label: React.ReactNode, months: number[], strong: boolean, key: string, top = false) => (
    <tr key={key} style={{ background: strong ? "rgba(11,74,125,0.06)" : undefined }}>
      <td style={{ ...td, textAlign: "left", fontWeight: strong ? 800 : 600, borderTop: top ? TOTAL_BORDER : undefined }}>{label}</td>
      {months.map((v, i) => <td key={i} style={{ ...td, fontWeight: strong ? 800 : 600, borderTop: top ? TOTAL_BORDER : undefined }}>{money0(v)}</td>)}
      <td style={{ ...td, fontWeight: strong ? 900 : 700, borderTop: top ? TOTAL_BORDER : undefined, borderLeft: "1px solid var(--border)" }}>{money0(months.reduce((a, b) => a + b, 0))}</td>
    </tr>
  );

  return (
    <div id="revenue-by-tenant" className={embedded ? undefined : "card"} style={embedded ? { borderTop: "2px solid var(--border)" } : { padding: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={embedded ? SUB_LABEL : STEP_LABEL}>Revenue by tenant — {year}</div>
            {tie.length > 0 && (
              <HoverCard title="Tenants → the budget lines" width={320}
                rows={tie.map((t) => ({
                  label: PART_LABEL[t.basis],
                  value: t.lines.length ? `${money0(t.estimateTotal)} → ${money0(t.linesTotal)}` : `${money0(t.estimateTotal)} → no line`,
                  color: t.ties ? "#15803d" : "#b91c1c",
                }))}
                footer={{ label: "Every month", value: allTie ? "Ties to the dollar" : "See the rows below" }}>
                <Pill tone={tiesTone(allTie)}>{allTie ? "TIES TO THE BUDGET" : "DOESN'T TIE"}</Pill>
              </HoverCard>
            )}
          </div>
          <div className="muted small" style={{ marginTop: 2 }}>
            {fromSchedule ? "Rent from the rent schedule" : "Rent from today's rent roll"} and the leasing decisions above.
            {est ? ` Recoveries: ${est.reconYear} CAM methodology applied to the ${year} budget's expense pools; new tenants assumed NNN.` : ""}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", gap: 4 }}>{views.map((v) => seg(view, v, VIEW_LABEL[v], setView))}</span>
          <span style={{ display: "inline-flex", gap: 4, paddingLeft: 10, borderLeft: "1px solid var(--border)" }}>
            {seg(sure, "all", "All", setSure)}
            {seg(sure, "contracted", "Contracted", setSure)}
            {seg(sure, "assumed", "Speculative", setSure)}
          </span>
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: "left" }}>Suite · Tenant — {view === "gross" ? "rent + recoveries" : VIEW_LABEL[view].toLowerCase()}</th>
              {MONTHS.map((m) => <th key={m} style={th}>{m} {yy}</th>)}
              <th style={{ ...th, borderLeft: "1px solid var(--border)" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={14} className="muted small" style={{ ...td, textAlign: "left", padding: 14 }}>
                {sure === "assumed" ? "Nothing speculative — no renewals, holds or lease-ups assumed yet." : "Nothing contracted."}
              </td></tr>
            )}
            {rows.map(({ r, months }) => {
              const total = months.reduce((a, b) => a + b, 0);
              const st = STATUS[r.status];
              const gross = r.method?.kind === "retail" && r.method.grossLease;
              const vacant = r.status === "vacant";
              const nothing = Math.abs(total) < 0.5;
              const rentYr = r.rent.reduce((a, b) => a + b, 0);
              const recYr = [...r.cam, ...r.ins, ...r.ret].reduce((a, b) => a + b, 0);
              const tip = methodTip(r, est);
              const nameCell = (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <code style={{ fontSize: 12 }}>{r.unitRef}</code>
                  <span style={{ fontWeight: 600, color: vacant ? "var(--muted)" : "var(--text)" }}>{vacant || !r.tenant ? "Vacant" : r.tenant}</span>
                  {st && <Pill tone={st.tone}>{st.text}</Pill>}
                  {gross && <Pill tone={TONE_BLUE}>GROSS</Pill>}
                </span>
              );
              return (
                <tr key={r.unitRef + r.tenant} style={nothing ? { opacity: 0.55 } : undefined}>
                  <td style={{ ...td, textAlign: "left", minWidth: 250, whiteSpace: "normal" }}>
                    {vacant ? nameCell : (
                      <HoverCard title={`${r.unitRef} · ${r.tenant || "—"}`} width={340}
                        rows={[
                          { label: "Base rent", value: money0(rentYr) },
                          { label: "Recoveries", value: `${money0(recYr)}${office ? "" : `  (CAM ${money0(r.cam.reduce((a, b) => a + b, 0))} · INS ${money0(r.ins.reduce((a, b) => a + b, 0))} · RET ${money0(r.ret.reduce((a, b) => a + b, 0))})`}` },
                          ...tip,
                        ]}
                        footer={r.note ? { label: "Note", value: r.note } : { label: "Gross", value: money0(rentYr + recYr) }}>
                        {nameCell}
                      </HoverCard>
                    )}
                    {r.note && !vacant && <div className="muted" style={{ fontSize: 11.5 }}>{r.note}</div>}
                  </td>
                  {months.map((v, i) => {
                    const has = Math.abs(v) > 0.5;
                    return (
                      <td key={i} style={{ ...td, background: has ? (r.assumed[i] ? ASSUMED_BG : CONTRACTED_BG) : undefined, color: has ? "var(--text)" : "var(--muted)" }}>
                        {has ? money0(v) : "–"}
                      </td>
                    );
                  })}
                  <td style={{ ...td, fontWeight: 800, borderLeft: "1px solid var(--border)" }}>{nothing ? "–" : money0(total)}</td>
                </tr>
              );
            })}
            {/* One row per part in view, naming the budget line it lands on,
                then the grand total when there is more than one. */}
            {parts.map((p, k) => (
              <Fragment key={p}>
                {totalRow(
                  <>Total {PART_LABEL[p]}{lineOf(p) ? <span className="muted" style={{ fontWeight: 600, fontSize: 12 }}> → {lineOf(p)}</span> : null}</>,
                  partTotals(p), parts.length === 1, p, k === 0,
                )}
                {(() => {
                  const t = p === "rent" ? null : tie.find((x) => x.basis === p);
                  if (!t || t.ties || sure !== "all") return null;
                  return (
                    <tr><td colSpan={14} style={{ ...td, textAlign: "left", paddingLeft: 22, color: "#b91c1c", fontWeight: 600 }}>
                      {t.lines.length === 0
                        ? `This statement has no ${PART_LABEL[p]} recovery line, so ${money0(t.estimateTotal)} of tenant recoveries is not in the budget. Add the line to the property's statement mapping.`
                        : `The budget lines carry ${money0(t.linesTotal)} against ${money0(t.estimateTotal)} from the tenants — a difference of ${money0(t.linesTotal - t.estimateTotal)}.`}
                    </td></tr>
                  );
                })()}
              </Fragment>
            ))}
            {parts.length > 1 && totalRow(view === "gross" ? "Gross revenue" : "Total recoveries", grandMonths, true, "grand", true)}
          </tbody>
        </table>
      </div>
      <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", padding: "8px 14px", fontSize: 12 }} className="muted">
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 14, height: 14, borderRadius: 3, background: CONTRACTED_BG, border: "1px solid rgba(22,163,74,0.35)" }} /> Lease in place
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 14, height: 14, borderRadius: 3, background: ASSUMED_BG, border: "1px dashed rgba(22,163,74,0.45)" }} /> Assumed (leasing decision)
        </span>
        <span>Dimmed = pays nothing this year. Hover a tenant for how their figure was reached.</span>
      </div>
    </div>
  );
}

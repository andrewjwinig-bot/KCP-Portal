"use client";

// Step 3 · Recoveries — every tenant's CAM, insurance and real estate tax
// recovery for the budget year, month by month, and the budget lines they add
// up to. Laid out like "Rent by tenant" (a row per suite, a column per month,
// the same contracted / assumed shading) because it follows the SAME leasing
// decisions: a tenant pays recoveries in exactly the months it pays rent.
//
// Each category's tenant total names the budget line(s) it lands on — the
// recovery income lines in Step 4 — and one TIES mark in the header says they
// agree to the dollar in every month. Those lines are not typeable in the
// grid: they ARE this table, so the only way to move them is through what
// drives it (the pools in Step 2, the leasing decisions in Step 1, or the
// tenant's CAM methodology on its unit page).

import { Fragment, useState } from "react";
import { Pill, TONE_AMBER, TONE_GREEN, TONE_TEAL, tiesTone } from "@/app/components/Pill";
import { HoverCard, type TipRow } from "@/app/components/HoverCard";
import type { ReimbursementEstimate, ReimbTenantEstimate } from "@/lib/financials/budgets/reimbursementEstimate";
import type { RecoveryTie } from "@/lib/financials/budgets/draft";
import { STEP_LABEL } from "./stepStyles";
import { CONTRACTED_BG, ASSUMED_BG } from "./RentByTenantCard";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const money0 = (n: number) => (n < 0 ? "-" : "") + Math.abs(Math.round(n)).toLocaleString("en-US");
const pct = (n: number, d = 2) => `${(+n).toFixed(d).replace(/\.?0+$/, "")}%`;
const secLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" };
const th: React.CSSProperties = { ...secLabel, padding: "7px 8px", textAlign: "right", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "5px 8px", fontSize: 13, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", borderBottom: "1px solid var(--border)" };
const BAND = "rgba(13,148,136,0.07)";

type Cat = "cam" | "ins" | "ret";
type View = "all" | Cat;
const CAT_LABEL: Record<Cat, string> = { cam: "CAM", ins: "Insurance", ret: "RE tax" };

function monthsOf(t: ReimbTenantEstimate, view: View): number[] {
  if (view !== "all") return t[view];
  return t.cam.map((v, i) => v + t.ins[i] + t.ret[i]);
}

/** The tenant's methodology and how the budget figure was reached from it. */
function methodRows(t: ReimbTenantEstimate, est: ReimbursementEstimate): { title: string; rows: TipRow[]; footer?: TipRow } {
  const m = t.method;
  const rows: TipRow[] = [];
  const annual = `CAM ${money0(t.camAnnual)}${est.kind === "retail" ? ` · INS ${money0(t.insAnnual)}` : ""} · RET ${money0(t.retAnnual)}`;
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
    rows.push({ label: "Method", value: "Share of the budget pool's increase over the base year" });
  } else if (m?.kind === "leaseup") {
    rows.push({ label: "Assumed lease-up", value: `from ${MONTHS[m.startMonth - 1] ?? "Jan"}` });
    rows.push({ label: "Share", value: `Pro rata on ${m.sqft.toLocaleString("en-US")} SF` });
    rows.push({ label: "Admin / exclusions", value: "None — no lease on file yet" });
  }
  rows.push({ label: "Months paying", value: `${t.monthsActive} of 12${t.note ? ` — ${t.note}` : ""}` });
  return { title: `${t.unitRef} · ${t.name}`, rows, footer: { label: "Budget year", value: annual } };
}

export function RecoveriesCard({ est, tie }: { est: ReimbursementEstimate; tie: RecoveryTie[] }) {
  const [view, setView] = useState<View>("all");
  const cats: Cat[] = est.kind === "retail" ? ["cam", "ins", "ret"] : ["cam", "ret"];
  const yy = String(est.budgetYear).slice(2);
  const tenants = est.tenants;
  const allTie = tie.length > 0 && tie.every((t) => t.ties);
  const shown = view === "all" ? cats : [view];

  const seg = (v: View, label: string) => (
    <button key={v} type="button" className={view === v ? "btn primary" : "btn"} onClick={() => setView(v)}
      style={{ fontSize: 12, padding: "4px 12px", fontWeight: 700 }} aria-pressed={view === v}>{label}</button>
  );

  return (
    <div id="step-recoveries" className="card" style={{ padding: 0, overflow: "hidden", borderColor: "rgba(13,148,136,0.4)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ ...STEP_LABEL, color: "#0d9488" }}>Step 3 · Recoveries — CAM / INS / RET, {est.budgetYear}</div>
          {!est.fromBudgetPools && <Pill tone={TONE_TEAL}>PREVIEW</Pill>}
          {tie.length > 0 && (
            <HoverCard title="Step 3 → the budget lines" width={320}
              rows={tie.map((t) => ({
                label: CAT_LABEL[t.basis],
                value: t.lines.length ? `${money0(t.estimateTotal)} → ${money0(t.linesTotal)}` : `${money0(t.estimateTotal)} → no line`,
                color: t.ties ? "#15803d" : "#b91c1c",
              }))}
              footer={{ label: "Every month", value: allTie ? "Ties to the dollar" : "See the rows below" }}>
              <Pill tone={tiesTone(allTie)}>{allTie ? "TIES TO THE BUDGET" : "DOESN'T TIE"}</Pill>
            </HoverCard>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 12, flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", gap: 4 }}>
            {seg("all", "All")}
            {cats.map((c) => seg(c, c === "ins" ? "INS" : c === "ret" ? "RET" : "CAM"))}
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 14, height: 14, borderRadius: 3, background: CONTRACTED_BG, border: "1px solid rgba(22,163,74,0.35)" }} /> Lease in place
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 14, height: 14, borderRadius: 3, background: ASSUMED_BG, border: "1px dashed rgba(22,163,74,0.45)" }} /> Assumed (leasing decision)
          </span>
        </div>
      </div>
      <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--border)" }} className="muted small">
        Each tenant keeps their <b>CAM methodology</b> — PRS, admin fee, exclusions, cap and gross lease, as set on their unit page and applied in the <b>{est.reconYear} reconciliation</b> — carried onto <b>this budget&rsquo;s pools</b>.
        {est.kind === "office"
          ? " Office tenants pay their pro-rata share of the budget pool's increase over their base year."
          : ` Their ${est.reconYear} reconciled charge moves with the pool (a capped tenant no faster than its cap).`}
        {" "}The pools are the budget&rsquo;s own lines, so a CAM expense typed in Step 4, or taxes and insurance saved in Step 2, recompute these on the spot. Tenants pay in the <b>same months as their rent</b> in Step 1. Hover a tenant for how their figure was reached. These totals <b>are</b> the recovery lines in Step 4, which is why those lines can&rsquo;t be typed over.
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: "left" }}>Suite · Tenant{view !== "all" ? ` — ${CAT_LABEL[view]}` : " — CAM + INS + RET"}</th>
              {MONTHS.map((m) => <th key={m} style={th}>{m} {yy}</th>)}
              <th style={{ ...th, borderLeft: "1px solid var(--border)" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((t) => {
              const months = monthsOf(t, view);
              const total = months.reduce((a, b) => a + b, 0);
              const tip = methodRows(t, est);
              const dim = t.monthsActive === 0;
              return (
                <tr key={t.unitRef + t.name} style={dim ? { opacity: 0.6 } : undefined}>
                  <td style={{ ...td, textAlign: "left", minWidth: 250, whiteSpace: "normal" }}>
                    <HoverCard title={tip.title} rows={tip.rows} footer={tip.footer} width={340}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <code style={{ fontSize: 12 }}>{t.unitRef}</code>
                        <span style={{ fontWeight: 600 }}>{t.name}</span>
                        {t.leaseUp && <Pill tone={TONE_GREEN}>LEASE-UP</Pill>}
                        {t.method?.kind === "retail" && t.method.grossLease && <Pill tone={TONE_AMBER}>GROSS</Pill>}
                      </span>
                    </HoverCard>
                    {t.note && <div className="muted" style={{ fontSize: 11.5 }}>{t.note}</div>}
                  </td>
                  {months.map((v, i) => {
                    const has = Math.abs(v) > 0.5;
                    const on = !!t.assumed[i];
                    return (
                      <td key={i} style={{ ...td, background: has ? (on ? ASSUMED_BG : CONTRACTED_BG) : undefined, color: has ? "var(--text)" : "var(--muted)" }}>
                        {has ? money0(v) : "–"}
                      </td>
                    );
                  })}
                  <td style={{ ...td, fontWeight: 800, borderLeft: "1px solid var(--border)" }}>{Math.abs(total) > 0.5 ? money0(total) : "–"}</td>
                </tr>
              );
            })}
            {shown.map((c) => {
              const tt = tie.find((x) => x.basis === c);
              const estMonths = est.monthly[c];
              const estTotal = estMonths.reduce((a, b) => a + b, 0);
              const topBorder = "2px solid rgba(13,148,136,0.35)";
              return (
                <Fragment key={c}>
                  <tr style={{ background: BAND }}>
                    <td style={{ ...td, textAlign: "left", fontWeight: 800, borderTop: topBorder }}>
                      Total {CAT_LABEL[c]}
                      {tt?.lines.length ? <span className="muted" style={{ fontWeight: 600, fontSize: 12 }}> → {tt.lines.map((l) => l.label).join(" + ")}</span> : null}
                    </td>
                    {estMonths.map((v, i) => <td key={i} style={{ ...td, fontWeight: 800, borderTop: topBorder }}>{money0(v)}</td>)}
                    <td style={{ ...td, fontWeight: 900, borderTop: topBorder, borderLeft: "1px solid var(--border)" }}>{money0(estTotal)}</td>
                  </tr>
                  {tt && (tt.lines.length === 0 || !tt.ties) && (
                    <tr>
                      <td colSpan={14} style={{ ...td, textAlign: "left", paddingLeft: 22, color: "#b91c1c", fontWeight: 600 }}>
                        {tt.lines.length === 0
                          ? `This statement has no ${CAT_LABEL[c]} recovery line, so ${money0(tt.estimateTotal)} of tenant recoveries is not in the budget. Add the line to the property's statement mapping.`
                          : `The budget lines carry ${money0(tt.linesTotal)} against ${money0(tt.estimateTotal)} from the tenants — a difference of ${money0(tt.linesTotal - tt.estimateTotal)}.`}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

"use client";

// ONE TENANT'S YEAR, clicked from Revenue by Tenant. It replaced a hover that
// stacked every figure and every methodology fact into one crowded card
// (owner: "very busy and crowded"). Laid out the way the rest of the portal
// reads a calculation: KPI tiles for the year, a small table of what they are
// billed today against what the budget bills them, then the methodology as a
// table with a column per category — so PRS, recon due and pool change line
// up instead of being run together on one line.

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { StatPill, Pill, TONE_AMBER, TONE_BLUE } from "@/app/components/Pill";
import { th, thL, td, tdL } from "@/app/components/tableStyles";
import type { ReimbursementEstimate } from "@/lib/financials/budgets/reimbursementEstimate";
import type { TenantRevenueRow } from "@/lib/financials/budgets/draft";

type Rec = "cam" | "ins" | "ret";
const LABEL: Record<"rent" | Rec, string> = { rent: "Base Rent", cam: "CAM", ins: "Insurance", ret: "RE Tax" };
const usd = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const pct = (n: number) => `${(+n).toFixed(2).replace(/\.?0+$/, "")}%`;
const sum = (a: number[]) => a.reduce((x, y) => x + (y || 0), 0);
const secLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", marginBottom: 6 };

export function TenantDetailModal({ r, est, year, onClose }: {
  r: TenantRevenueRow; est?: ReimbursementEstimate; year: number; onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const m = r.method;
  const recs: Rec[] = office(m) ? ["cam", "ret"] : ["cam", "ins", "ret"];
  const rentYear = sum(r.rent);
  const recYear = recs.reduce((a, p) => a + sum(r[p]), 0);
  const gross = rentYear + recYear;
  const yy = (y: number) => `'${String(y).slice(2)}`;

  // Monthly: billed today → the budget's average billed month.
  const monthly = (["rent", ...recs] as ("rent" | Rec)[]).map((p) => {
    const arr = r[p];
    const active = arr.filter((v) => Math.abs(v) > 0.5).length;
    const next = active ? sum(arr) / active : 0;
    const now = p === "rent" ? r.billing?.rent ?? null : r.billing?.[p] ?? null;
    return { p, now, next, year: sum(arr) };
  }).filter((x) => x.year !== 0 || (x.now ?? 0) !== 0);

  const body = (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 120, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "70px 16px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`${r.tenant || "Vacant"} ${r.unitRef}`}
        style={{ background: "var(--card)", borderRadius: 12, width: "100%", maxWidth: 720, boxShadow: "0 20px 60px rgba(0,0,0,0.35)", borderTop: "3px solid var(--brand)" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>
              <code style={{ fontSize: 12, fontWeight: 700, color: "var(--brand)" }}>{r.unitRef}</code>
              {r.sqft > 0 ? ` · ${Math.round(r.sqft).toLocaleString("en-US")} SF` : ""}
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {r.tenant || "Vacant"}
              {m?.kind === "retail" && m.grossLease && <Pill tone={TONE_BLUE}>Gross Lease</Pill>}
              {r.assumed.some(Boolean) && <Pill tone={TONE_AMBER}>Leasing Assumption</Pill>}
            </div>
          </div>
          <button type="button" className="btn sm" onClick={onClose}>Close</button>
        </div>

        <div style={{ padding: "14px 18px 18px", display: "grid", gap: 18 }}>
          <div className="pills">
            <StatPill label={`${year} Base Rent`} value={usd(rentYear)} sub={r.sqft > 0 ? `$${(rentYear / r.sqft).toFixed(2)}/SF` : undefined} />
            <StatPill label={`${year} Recoveries`} value={usd(recYear)} sub={r.sqft > 0 ? `$${(recYear / r.sqft).toFixed(2)}/SF` : undefined} />
            <StatPill label={`${year} Gross`} value={usd(gross)} sub={r.sqft > 0 ? `$${(gross / r.sqft).toFixed(2)}/SF` : undefined} accent="var(--brand)" total />
          </div>

          {monthly.length > 0 && (
            <div>
              <div style={secLabel}>Monthly billing</div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>
                  <th style={thL} />
                  <th style={th}>Today</th>
                  <th style={th}>{year} Budget</th>
                  <th style={th}>Change</th>
                  <th style={th}>{year} Year</th>
                </tr></thead>
                <tbody>
                  {monthly.map(({ p, now, next, year: y }) => {
                    const chg = now && next ? ((next - now) / now) * 100 : null;
                    return (
                      <tr key={p}>
                        <td style={{ ...tdL, fontWeight: 600 }}>{LABEL[p]}</td>
                        <td style={{ ...td, color: "var(--muted)" }}>{now != null ? `${usd(now)}/mo` : "—"}</td>
                        <td style={td}>{next ? `${usd(next)}/mo` : "—"}</td>
                        <td style={{ ...td, color: chg == null ? "var(--muted)" : chg > 0.05 ? "#b45309" : chg < -0.05 ? "#15803d" : "var(--muted)" }}>
                          {chg == null ? "—" : `${chg >= 0 ? "+" : "−"}${Math.abs(chg).toFixed(1)}%`}
                        </td>
                        <td style={{ ...td, fontWeight: 700 }}>{usd(y)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {est && m && <Method m={m} est={est} recs={recs} yy={yy} />}

          {(r.note || r.overrideNote) && (
            <div className="muted small">{r.overrideNote ? <><b>Estimate set by hand:</b> {r.overrideNote}. </> : null}{r.note}</div>
          )}
        </div>
      </div>
    </div>
  );
  return typeof document !== "undefined" ? createPortal(body, document.body) : null;
}

const office = (m: TenantRevenueRow["method"]) => m?.kind === "office";

function Method({ m, est, recs, yy }: { m: NonNullable<TenantRevenueRow["method"]>; est: ReimbursementEstimate; recs: Rec[]; yy: (y: number) => string }) {
  if (m.kind === "retail") {
    const prs: Record<Rec, number> = { cam: m.camPrs, ins: m.insPrs, ret: m.retPrs };
    const facts = [
      m.adminFeePct ? `Admin fee ${pct(m.adminFeePct)}` : null,
      m.capPct != null ? `CAM cap ${pct(m.capPct)}/yr on controllables` : null,
      m.excludedLines ? `${m.excludedLines} CAM line${m.excludedLines === 1 ? "" : "s"} excluded` : null,
      m.reconOcc != null ? `In the ${est.reconYear} recon ${Math.round(m.reconOcc * 100)}% of the year — scaled to a full year` : null,
    ].filter(Boolean);
    return (
      <div>
        <div style={secLabel}>CAM Methodology · {est.reconYear} Reconciliation</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={thL} />{recs.map((p) => <th key={p} style={th}>{LABEL[p]}</th>)}</tr></thead>
          <tbody>
            <tr><td style={tdL}>Share (PRS)</td>{recs.map((p) => <td key={p} style={td}>{pct(prs[p])}</td>)}</tr>
            <tr><td style={tdL}>{est.reconYear} recon due</td>{recs.map((p) => <td key={p} style={td}>{usd(m.recon[p])}</td>)}</tr>
            <tr><td style={tdL}>Pool change {yy(est.reconYear)} → {yy(est.budgetYear)}</td>{recs.map((p) => {
              const c = (est.ratios[p] - 1) * 100;
              return <td key={p} style={td}>{`${c >= 0 ? "+" : "−"}${Math.abs(c).toFixed(1)}%`}</td>;
            })}</tr>
          </tbody>
        </table>
        {facts.length > 0 && <div className="muted small" style={{ marginTop: 8 }}>{facts.join(" · ")}</div>}
      </div>
    );
  }
  if (m.kind === "office") {
    return (
      <div>
        <div style={secLabel}>Office Methodology · {est.reconYear} Reconciliation</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            <tr><td style={tdL}>Pro-rata share</td><td style={td}>{pct(m.proRataPct)}</td></tr>
            <tr><td style={tdL}>Base year</td><td style={td}>{m.noBaseStop ? "None — pays the full share" : m.baseYear ? String(m.baseYear) : "—"}</td></tr>
            {recs.map((p) => <tr key={p}><td style={tdL}>{est.reconYear} recon due · {LABEL[p]}</td><td style={td}>{usd(m.recon[p])}</td></tr>)}
          </tbody>
        </table>
      </div>
    );
  }
  if (m.kind === "leaseup" || m.kind === "new") {
    return (
      <div>
        <div style={secLabel}>Methodology</div>
        <div className="small">{m.kind === "new" && m.assumption === "base-year" ? `Base year ${est.budgetYear} — nothing until ${est.budgetYear + 1}` : `Assumed NNN, pro rata on ${m.sqft.toLocaleString("en-US")} SF`}</div>
      </div>
    );
  }
  return null;
}

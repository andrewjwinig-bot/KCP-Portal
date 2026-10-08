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
import { Pill, TONE_AMBER, TONE_GREEN, TONE_NEUTRAL, TONE_BLUE, tiesTone, contributorTone, PortionPill } from "@/app/components/Pill";
import { HoverCard, type TipRow } from "@/app/components/HoverCard";
import type { ReimbursementEstimate } from "@/lib/financials/budgets/reimbursementEstimate";
import type { RecoveryTie, TenantRevenueRow } from "@/lib/financials/budgets/draft";
import { STEP_LABEL, SUB_LABEL } from "./stepStyles";
import { TenantDetailModal } from "./TenantDetailModal";
import { DecisionPill, DecisionModal, decisionLabel, type LeasingCall, type SavePayload } from "./LeasingDecision";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const money0 = (n: number) => (n < 0 ? "-" : "") + Math.abs(Math.round(n)).toLocaleString("en-US");
/** Dollars per square foot, to the cent: "$24.50". */
const psf$ = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(n).toFixed(2);
const pct = (n: number) => `${(+n).toFixed(2).replace(/\.?0+$/, "")}%`;
const secLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" };
const th: React.CSSProperties = { ...secLabel, padding: "7px 8px", textAlign: "right", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "9px 8px", fontSize: 13.5, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", borderBottom: "1px solid var(--border)" };
/** The suite, as the Rent Roll writes it — a bold brand-coloured code. */
const SUITE: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "#0b4a7d", whiteSpace: "nowrap" };
export const CONTRACTED_BG = "rgba(22,163,74,0.22)";
export const ASSUMED_BG = "rgba(22,163,74,0.07)";
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

const yr = (a: number[]) => a.reduce((x, y) => x + (y || 0), 0);
const SHORT: Record<Part, string> = { rent: "Rent", cam: "CAM", ins: "INS", ret: "RET" };

/**
 * The hover for one suite, scoped to the parts in view — filtered on RET it
 * shows only RET: the figure, the RET share, the recon's RET, the tax pool's
 * change. Gross shows everything. A methodology line that is about one part
 * (admin fee, exclusions, cap — all CAM) appears only when that part is in view.
 */
export function tenantTip(r: TenantRevenueRow, _est: ReimbursementEstimate | undefined, parts: Part[], viewLabel: string): { rows: TipRow[]; footer: TipRow } {
  // A QUICK look only — the year by part. The methodology, today's billing
  // and the pool changes live in the detail window a click opens
  // (`TenantDetailModal`); the hover that carried them all was "very busy
  // and crowded" (owner).
  const rows: TipRow[] = parts.length > 1 ? parts.map((p) => ({ label: PART_LABEL[p], value: money0(yr(r[p])) })) : [];
  const total = parts.reduce((a, p) => a + yr(r[p]), 0);
  rows.push({ label: "Click for the detail", value: "↗", color: "var(--muted)" });
  return { rows, footer: { label: parts.length > 1 ? viewLabel : `${PART_LABEL[parts[0]]}, year`, value: money0(total) } };
}


/** The leasing calls this table carries — every suite expiring, held over or
 *  vacant — made from the row's pill. */
export type LeasingProps = {
  calls: LeasingCall[];
  owner: { id: string; label: string; group?: string };
  dealCapital: { ti: number; lc: number };
  onSave: (p: SavePayload) => unknown;
  error?: string | null;
  /** Extra header content — the owner's sign-off on this property. */
  headerExtra?: React.ReactNode;
};

const canonRef = (s: string) => String(s ?? "").trim().toUpperCase().replace(/-CU$/, "");

export function RevenueByTenantCard({ rows: allRows, year, fromSchedule, est, tie, rentLine, embedded = false, leasing }: {
  rows: TenantRevenueRow[]; year: number; fromSchedule: boolean;
  est?: ReimbursementEstimate; tie: RecoveryTie[]; rentLine?: string;
  embedded?: boolean;
  leasing?: LeasingProps;
}) {
  const [view, setView] = useState<View>("gross");
  const [sure, setSure] = useState<Sure>("all");
  const [toDecide, setToDecide] = useState(false);
  const [openUnit, setOpenUnit] = useState<string | null>(null);
  // The tenant whose detail is open (click a name).
  const [detail, setDetail] = useState<TenantRevenueRow | null>(null);
  // $ or $/SF: in $/SF each month reads ANNUALIZED (× 12 ÷ the suite's SF), so
  // a month compares straight across to a lease's quoted rate.
  const [unit, setUnit] = useState<"usd" | "psf">("usd");
  if (!allRows.length) return null;
  const callOf = new Map((leasing?.calls ?? []).map((c) => [canonRef(c.unitRef), c]));
  // A lease in place is never a call owed — only expiring, holdover and
  // vacant suites count toward "To decide".
  const calls = (leasing?.calls ?? []).filter((c) => c.mode !== "contracted");
  const decided = calls.filter((c) => c.assumption);
  const openCall = openUnit ? callOf.get(canonRef(openUnit)) : undefined;
  const office = est?.kind === "office";
  const parts = PARTS[view].filter((p) => !(office && p === "ins"));
  const keepMonth = (r: TenantRevenueRow, i: number) => sure === "all" || (sure === "assumed") === !!r.assumed[i];
  const cellsOf = (r: TenantRevenueRow, ps: Part[]) => MONTHS.map((_, i) => (keepMonth(r, i) ? ps.reduce((a, p) => a + (r[p][i] || 0), 0) : 0));
  const rows = allRows.map((r) => ({ r, months: cellsOf(r, parts) }))
    .filter(({ months }) => sure === "all" || months.some((v) => Math.abs(v) > 0.5))
    .filter(({ r }) => { if (!toDecide) return true; const c = callOf.get(canonRef(r.unitRef)); return !!c && c.mode !== "contracted" && !c.assumption; });
  const partTotals = (p: Part) => MONTHS.map((_, i) => rows.reduce((a, { r }) => a + (keepMonth(r, i) ? r[p][i] || 0 : 0), 0));
  const grandMonths = MONTHS.map((_, i) => rows.reduce((a, x) => a + x.months[i], 0));
  // The SF behind the rows in view — each suite once; a recovery-only row
  // (a recon tenant matching no suite) carries none.
  const totalSf = [...new Map(rows.filter(({ r }) => !r.recoveryOnly && r.sqft > 0).map(({ r }) => [canonRef(r.unitRef), r.sqft])).values()].reduce((a, b) => a + b, 0);
  const perSf = (annual: number, sf: number) => (sf > 0 ? annual / sf : null);
  /** A month as shown: dollars, or annualized $/SF. */
  const monthShown = (v: number, sf: number) => {
    if (unit === "usd") return money0(v);
    const x = perSf(v * 12, sf);
    return x == null ? "–" : psf$(x);
  };
  const allTie = tie.length === 0 || tie.every((t) => t.ties);
  const lineOf = (p: Part) => p === "rent" ? rentLine : tie.find((t) => t.basis === p)?.lines.map((l) => l.label).join(" + ");

  const seg = <V extends string>(cur: V, v: V, label: string, set: (v: any) => void) => (
    <button key={v} type="button" className={cur === v ? "btn sm primary" : "btn sm"} onClick={() => set(v)} aria-pressed={cur === v}>{label}</button>
  );
  const views: View[] = office ? ["gross", "rent", "recoveries", "cam", "ret"] : ["gross", "rent", "recoveries", "cam", "ins", "ret"];

  // The per-part rows (Base rent, CAM, INS, RET) are quiet — small, muted,
  // tight — so the eye stays on the tenants; only the grand total is bold.
  const totalRow = (label: React.ReactNode, months: number[], strong: boolean, key: string, top = false) => {
    const cell: React.CSSProperties = strong
      ? { ...td, fontWeight: 800, borderTop: top ? TOTAL_BORDER : undefined }
      : { ...td, fontSize: 12, padding: "4px 8px", color: "var(--muted)", fontWeight: 600, borderTop: top ? TOTAL_BORDER : undefined };
    return (
      <tr key={key} style={{ background: strong ? "rgba(11,74,125,0.06)" : undefined }}>
        <td colSpan={2} style={{ ...cell, textAlign: "left" }}>{label}</td>
        {months.map((v, i) => <td key={i} style={cell}>{monthShown(v, totalSf)}</td>)}
        <td style={{ ...cell, fontWeight: strong ? 900 : 700, borderLeft: "1px solid var(--border)" }}>{money0(months.reduce((a, b) => a + b, 0))}</td>
        <td style={{ ...cell, fontWeight: strong ? 800 : 600 }}>{(() => { const x = perSf(months.reduce((a, b) => a + b, 0), totalSf); return x == null ? "–" : psf$(x); })()}</td>
      </tr>
    );
  };

  return (
    <div id="revenue-by-tenant" className={embedded ? undefined : "card"} style={embedded ? undefined : { padding: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={embedded ? SUB_LABEL : STEP_LABEL}>Revenue by tenant — {year}</div>
            {/* Only the EXCEPTION is marked: when every category ties there is
                nothing to say (and the red row under the totals names a gap). */}
            {!allTie && (
              <HoverCard title="Tenants → the budget lines" width={320}
                rows={tie.map((t) => ({
                  label: PART_LABEL[t.basis],
                  value: t.lines.length ? `${money0(t.estimateTotal)} → ${money0(t.linesTotal)}` : `${money0(t.estimateTotal)} → no line`,
                  color: t.ties ? "#15803d" : "#b91c1c",
                }))}
                footer={{ label: "Every month", value: "See the rows below" }}>
                <Pill tone={tiesTone(false)}>DOESN&rsquo;T TIE</Pill>
              </HoverCard>
            )}
            {leasing?.headerExtra}
          </div>
          <div className="muted small" style={{ marginTop: 2 }}>
            {fromSchedule ? "Rent from the rent schedule" : "Rent from today's rent roll"}{est ? ` · recoveries on the ${est.reconYear} CAM methodology` : ""}. Hover a month for $/SF and the leasing call.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, flexWrap: "wrap" }}>
          {leasing && calls.length > 0 && (
            <button type="button" className={toDecide ? "btn sm primary" : "btn sm"} onClick={() => setToDecide((t) => !t)} aria-pressed={toDecide}>To decide · {calls.length - decided.length}</button>
          )}
          <span style={{ display: "inline-flex", gap: 4 }}>{views.map((v) => seg(view, v, VIEW_LABEL[v], setView))}</span>
          <span style={{ display: "inline-flex", gap: 4, paddingLeft: 10, borderLeft: "1px solid var(--border)" }}>
            {seg(unit, "usd", "$", setUnit)}
            {seg(unit, "psf", "$/SF", setUnit)}
          </span>
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
              <th style={{ ...th, textAlign: "left" }}>Tenant — {view === "gross" ? "rent + recoveries" : VIEW_LABEL[view].toLowerCase()}</th>
              <th style={{ ...th, textAlign: "left" }}>Suite</th>
              {MONTHS.map((m) => <th key={m} style={th}>{m}</th>)}
              <th style={{ ...th, borderLeft: "1px solid var(--border)" }}>Total</th>
              <th style={th}>$/SF</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={16} className="muted small" style={{ ...td, textAlign: "left", padding: 14 }}>
                {toDecide ? "Every leasing call is made." : sure === "assumed" ? "Nothing speculative — no renewals, holds or lease-ups assumed yet." : "Nothing contracted."}
              </td></tr>
            )}
            {rows.map(({ r, months }) => {
              const total = months.reduce((a, b) => a + b, 0);
              const st = STATUS[r.status];
              const gross = r.method?.kind === "retail" && r.method.grossLease;
              const vacant = r.status === "vacant";
              const nothing = Math.abs(total) < 0.5;
              const tip = tenantTip(r, est, parts, view === "gross" ? "Gross" : VIEW_LABEL[view]);
              const call = leasing ? callOf.get(canonRef(r.unitRef)) : undefined;
              // As the Rent Roll writes a tenant: the name in 600, a vacancy in
              // muted italics.
              const nameCell = (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  {vacant || !r.tenant
                    ? <em style={{ color: "var(--muted)", fontSize: 14.5 }}>Vacant</em>
                    : <span style={{ fontWeight: 600, fontSize: 14.5, color: "var(--text)" }}>{r.tenant}</span>}
                  {/* A mixed centre's OFFICE suites — recovered on the office
                      pool. Retail is the rest, so only the exception is tagged. */}
                  {r.portion === "office" && <span style={{ marginLeft: 6 }}><PortionPill portion="office" /></span>}
                  {!call && st && <Pill tone={st.tone}>{st.text}</Pill>}
                </span>
              );
              // A suite needing a call carries its DECIDE / decision pill,
              // which stands in for EXPIRES / HOLDOVER / LEASE-UP.
              const decision = call && leasing ? <DecisionPill call={call} owner={leasing.owner} onOpen={() => setOpenUnit(call.unitRef)} /> : null;
              return (
                <tr key={r.unitRef + r.tenant} style={nothing ? { opacity: 0.55 } : undefined}>
                  <td style={{ ...td, textAlign: "left", minWidth: 230, whiteSpace: "normal" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      {vacant || !r.tenant ? nameCell : (
                        <HoverCard title={`${r.tenant || "—"} · ${r.unitRef}`} width={260} rows={tip.rows} footer={tip.footer} help={false}>
                          <button type="button" onClick={() => setDetail(r)} className="os-line-name"
                            style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", textAlign: "left" }}>{nameCell}</button>
                        </HoverCard>
                      )}
                      {decision}
                    </span>
                  </td>
                  <td style={{ ...td, textAlign: "left" }}><code style={SUITE}>{r.unitRef}</code></td>
                  {months.map((v, i) => {
                    const has = Math.abs(v) > 0.5;
                    // The OTHER unit on hover — $/SF (annualized) in the $
                    // view, dollars in the $/SF view — and, on an assumed
                    // month, the call behind it: what the RENEW / LEASE-UP
                    // pill used to say on the row.
                    const other = unit === "usd" ? (r.sqft > 0 ? `${psf$((v * 12) / r.sqft)}/SF` : null) : money0(v);
                    const made = r.assumed[i] && call ? decisionLabel(call) : null;
                    const cellTip = has ? {
                      title: `${vacant || !r.tenant ? "Vacant" : r.tenant} · ${MONTHS[i]} ${year}`,
                      rows: [
                        { label: view === "gross" ? "Rent + recoveries" : VIEW_LABEL[view], value: unit === "usd" ? money0(v) : `${monthShown(v, r.sqft)}/SF` },
                        ...(other ? [{ label: unit === "usd" ? "Per SF" : "Dollars", value: other }] : []),
                        ...(gross ? [{ label: "Lease", value: "Gross — pays no recoveries" }] : []),
                      ],
                      footer: made ? { label: "Leasing call", value: made, color: "#0b4a7d" } : { label: r.assumed[i] ? "Assumed" : "Lease in place", value: "" },
                    } : null;
                    return (
                      <td key={i} style={{ ...td, background: has ? (r.assumed[i] ? ASSUMED_BG : CONTRACTED_BG) : undefined, color: has ? "var(--text)" : "var(--muted)" }}>
                        {cellTip ? <HoverCard title={cellTip.title} rows={cellTip.rows} footer={cellTip.footer} width={280} help={false}><span>{monthShown(v, r.sqft)}</span></HoverCard> : "–"}
                      </td>
                    );
                  })}
                  <td style={{ ...td, fontWeight: 800, borderLeft: "1px solid var(--border)" }}>{nothing ? "–" : money0(total)}</td>
                  <td style={{ ...td, color: nothing ? "var(--muted)" : undefined }}>{nothing || !(r.sqft > 0) ? "–" : psf$(total / r.sqft)}</td>
                </tr>
              );
            })}
            {/* ONE total row — the view's own (owner: four subtotal rows under
                every table was busy). Its label hovers the split by part and
                the budget line each lands on; a part that does not tie to its
                line still gets its red row, because that is the exception. */}
            {totalRow(
              <HoverCard title="Where it lands" width={340} help={false}
                rows={parts.map((p) => ({ label: `${PART_LABEL[p]}${lineOf(p) ? ` → ${lineOf(p)}` : ""}`, value: money0(partTotals(p).reduce((a, b) => a + b, 0)) }))}
                footer={{ label: "Total", value: money0(grandMonths.reduce((a, b) => a + b, 0)), color: "#0b4a7d" }}>
                <span>{view === "gross" ? "Gross revenue" : view === "recoveries" ? "Total recoveries" : `Total ${PART_LABEL[parts[0]]}`}{parts.length === 1 && lineOf(parts[0]) ? <span className="muted" style={{ fontWeight: 600, fontSize: 12 }}> → {lineOf(parts[0])}</span> : null}</span>
              </HoverCard>,
              grandMonths, true, "grand", true,
            )}
            {parts.map((p) => {
              const t = p === "rent" ? null : tie.find((x) => x.basis === p);
              if (!t || t.ties || sure !== "all") return null;
              return (
                <tr key={`tie-${p}`}><td colSpan={16} style={{ ...td, textAlign: "left", paddingLeft: 22, color: "#b91c1c", fontWeight: 600 }}>
                  {t.lines.length === 0
                    ? `This statement has no ${PART_LABEL[p]} recovery line, so ${money0(t.estimateTotal)} of tenant recoveries is not in the budget. Add the line to the property's statement mapping.`
                    : `${PART_LABEL[p]}: the budget lines carry ${money0(t.linesTotal)} against ${money0(t.estimateTotal)} from the tenants — a difference of ${money0(t.linesTotal - t.estimateTotal)}.`}
                </td></tr>
              );
            })}
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
        <span>Dimmed = pays nothing this year. Click a tenant for their detail.</span>
      </div>
      {leasing?.error && <div style={{ color: "#b91c1c", fontSize: 13, padding: "0 14px 10px" }}>{leasing.error}</div>}
      {leasing && (leasing.dealCapital.ti > 0 || leasing.dealCapital.lc > 0) && (
        <div className="muted small" style={{ padding: "9px 14px", borderTop: "1px solid var(--border)" }}>
          The leasing calls carry <b style={{ color: "var(--text)" }}>${Math.round(leasing.dealCapital.ti).toLocaleString("en-US")}</b> of TI and <b style={{ color: "var(--text)" }}>${Math.round(leasing.dealCapital.lc).toLocaleString("en-US")}</b> of leasing commissions, on the Capital lines in the month each new rent starts.
        </div>
      )}
      {detail && <TenantDetailModal r={detail} est={est} year={year} onClose={() => setDetail(null)} />}
      {openCall && leasing && (
        <DecisionModal key={openCall.unitRef} call={openCall} owner={leasing.owner} budgetYear={year} fromSchedule={fromSchedule}
          onSave={leasing.onSave} onClose={() => setOpenUnit(null)} error={leasing.error} />
      )}
    </div>
  );
}

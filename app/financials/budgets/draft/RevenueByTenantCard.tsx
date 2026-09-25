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
import { estimateJump, ESTIMATE_JUMP_PCT, ESTIMATE_JUMP_MIN_DOLLARS, type EstimateJump } from "@/lib/financials/budgets/estimateJump";
import { DecisionPill, DecisionModal, type LeasingCall, type SavePayload } from "./LeasingDecision";

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
function tenantTip(r: TenantRevenueRow, est: ReimbursementEstimate | undefined, parts: Part[], viewLabel: string): { rows: TipRow[]; footer: TipRow } {
  const rows: TipRow[] = [];
  const rec = parts.filter((p) => p !== "rent") as Exclude<Part, "rent">[];
  const join = (f: (p: Exclude<Part, "rent">) => string) => rec.map((p) => (rec.length > 1 ? `${SHORT[p]} ${f(p)}` : f(p))).join(" · ");
  const m = r.method;

  // The figures themselves — one line each when there is more than one; a
  // single part's figure is the footer.
  if (parts.length > 1) for (const p of parts) rows.push({ label: PART_LABEL[p], value: money0(yr(r[p])) });

  // TODAY's monthly estimate against the budget's — what the tenant is billed
  // now (rent roll) and what the budget has them billed, so the change in
  // their escrow reads at a glance.
  if (rec.length && est) {
    const prior = est.budgetYear - 1;
    for (const p of rec) {
      const active = r[p].filter((v) => Math.abs(v) > 0.5).length;
      const next = active ? yr(r[p]) / active : 0;
      const now = r.billing?.[p] ?? null;
      if (now == null && !next) continue;
      const chg = now && next ? ` (${next >= now ? "+" : "−"}${Math.abs(((next - now) / now) * 100).toFixed(1)}%)` : "";
      rows.push({
        label: `${SHORT[p]} est. '${String(prior).slice(2)}→'${String(est.budgetYear).slice(2)}`,
        value: `${now != null ? `$${money0(now)}` : "—"} → $${money0(next)}/mo${chg}`,
      });
    }
  }

  if (rec.length && est) {
    if (m?.kind === "retail") {
      if (m.grossLease) rows.push({ label: "Lease", value: "Gross — pays no recoveries", color: "#b45309" });
      const prs = { cam: m.camPrs, ins: m.insPrs, ret: m.retPrs };
      rows.push({ label: "Share (PRS)", value: join((p) => pct(prs[p])) });
      if (rec.includes("cam")) {
        if (m.adminFeePct) rows.push({ label: "Admin fee", value: pct(m.adminFeePct) });
        if (m.excludedLines) rows.push({ label: "Excluded CAM lines", value: String(m.excludedLines) });
        if (m.capPct != null) rows.push({ label: "CAM cap", value: `${pct(m.capPct)} / yr on controllables` });
      }
      rows.push({ label: `${est.reconYear} recon due`, value: join((p) => money0(m.recon[p])) });
      if (m.reconOcc != null) rows.push({ label: "Part year in recon", value: `${Math.round(m.reconOcc * 100)}% — scaled to a full year`, color: "#b45309" });
      // How much each pool grew, recon year → budget year, as a percent — one
      // line per category in view, named for it.
      const yy = (y: number) => `'${String(y).slice(2)}`;
      for (const p of rec) {
        const chg = (est.ratios[p] - 1) * 100;
        rows.push({ label: `${SHORT[p]} change ${yy(est.reconYear)}→${yy(est.budgetYear)}`, value: `${chg >= 0 ? "+" : "−"}${Math.abs(chg).toFixed(1)}%` });
      }
    } else if (m?.kind === "office") {
      rows.push({ label: "Pro-rata share", value: pct(m.proRataPct) });
      rows.push({ label: "Base year", value: m.noBaseStop ? "None — pays the full share" : m.baseYear ? String(m.baseYear) : "—" });
      rows.push({ label: `${est.reconYear} recon due`, value: join((p) => money0(m.recon[p])) });
    } else if (m?.kind === "leaseup" || m?.kind === "new") {
      rows.push({ label: "Method", value: m.kind === "new" && m.assumption === "base-year" ? `Base year ${est.budgetYear} — nothing until ${est.budgetYear + 1}` : `Assumed NNN, pro rata on ${m.sqft.toLocaleString("en-US")} SF` });
    }
  }
  if (r.note) rows.push({ label: "Note", value: r.note });
  const total = parts.reduce((a, p) => a + yr(r[p]), 0);
  return { rows, footer: { label: parts.length > 1 ? viewLabel : `${PART_LABEL[parts[0]]}, year`, value: money0(total) } };
}

/**
 * The amber ▲ beside a tenant whose monthly recovery estimates jump from what
 * they are billed today to what the budget bills them. Its hover is the
 * tenant's bill, category by category — the conversation the property
 * manager will be having in January.
 */
function JumpMark({ j, year }: { j: EstimateJump; year: number }) {
  const yy = (y: number) => `'${String(y).slice(2)}`;
  const up = (now: number, next: number) => now > 0.5 ? ` (${next >= now ? "+" : "−"}${Math.abs(((next - now) / now) * 100).toFixed(0)}%)` : "";
  return (
    <HoverCard title="Estimates jump next year" width={320}
      rows={[
        ...j.parts.map((p) => ({ label: SHORT[p.part], value: `$${money0(p.now)} → $${money0(p.next)}/mo${up(p.now, p.next)}` })),
        { label: `Total ${yy(year - 1)} → ${yy(year)}`, value: `$${money0(j.now)} → $${money0(j.next)}/mo`, color: "#b45309" },
      ]}
      footer={{ label: "Increase", value: `+$${money0(j.changeDollars)}/mo · +${j.changePct.toFixed(0)}%` }}>
      <span aria-label="Estimates jump next year" style={{ color: "#b45309", fontSize: 13, fontWeight: 800, lineHeight: 1, cursor: "default" }}>▲</span>
    </HoverCard>
  );
}

/** The leasing calls this table carries — every suite expiring, held over or
 *  vacant — made from the row's pill. */
export type LeasingProps = {
  calls: LeasingCall[];
  owner: { id: string; label: string };
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
  const [jumpsOnly, setJumpsOnly] = useState(false);
  const [openUnit, setOpenUnit] = useState<string | null>(null);
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
  // Tenants whose recovery estimates jump — judged on the whole bill, whatever
  // the filter, because it is the tenant's reaction being anticipated.
  const jumps = new Map(allRows.map((r) => [r.unitRef + r.tenant, estimateJump(r)] as const).filter(([, j]) => j));
  const rows = allRows.map((r) => ({ r, months: cellsOf(r, parts) }))
    .filter(({ r }) => !jumpsOnly || jumps.has(r.unitRef + r.tenant))
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
            {fromSchedule ? "Rent from the rent schedule" : "Rent from today's rent roll"}{leasing ? <> — click a suite&rsquo;s <b>DECIDE</b> pill to make its leasing call.</> : "."}
            {est ? ` Recoveries: ${est.reconYear} CAM methodology applied to the ${year} budget's expense pools; new tenants assumed NNN.` : ""}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, flexWrap: "wrap" }}>
          {leasing && calls.length > 0 && (
            <button type="button" className={toDecide ? "btn sm primary" : "btn sm"} onClick={() => setToDecide((t) => !t)} aria-pressed={toDecide}>To decide · {calls.length - decided.length}</button>
          )}
          {jumps.size > 0 && (
            <HoverCard title="Estimates jumping" width={300}
              rows={[{ label: "Flagged when", value: `CAM + INS + RET rise ${ESTIMATE_JUMP_PCT}%+ and $${ESTIMATE_JUMP_MIN_DOLLARS}+/mo` }]}
              footer={{ label: "Compared", value: "today's billing → the budget" }}>
              <button type="button" className={jumpsOnly ? "btn sm primary" : "btn sm"} onClick={() => setJumpsOnly((t) => !t)} aria-pressed={jumpsOnly}
                style={jumpsOnly ? undefined : { color: "#b45309" }}>▲ Estimates up · {jumps.size}</button>
            </HoverCard>
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
                {jumpsOnly ? "No tenant's estimates jump." : toDecide ? "Every leasing call is made." : sure === "assumed" ? "Nothing speculative — no renewals, holds or lease-ups assumed yet." : "Nothing contracted."}
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
                  {gross && <Pill tone={TONE_BLUE}>GROSS</Pill>}
                </span>
              );
              const jump = jumps.get(r.unitRef + r.tenant);
              // A suite needing a call carries its DECIDE / decision pill,
              // which stands in for EXPIRES / HOLDOVER / LEASE-UP.
              const decision = call && leasing ? <DecisionPill call={call} owner={leasing.owner} onOpen={() => setOpenUnit(call.unitRef)} /> : null;
              return (
                <tr key={r.unitRef + r.tenant} style={nothing ? { opacity: 0.55 } : undefined}>
                  <td style={{ ...td, textAlign: "left", minWidth: 230, whiteSpace: "normal" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      {vacant || !r.tenant ? nameCell : (
                        <HoverCard title={`${r.tenant || "—"} · ${r.unitRef}`} width={420} rows={tip.rows} footer={tip.footer}>
                          {nameCell}
                        </HoverCard>
                      )}
                      {jump && <JumpMark j={jump} year={year} />}
                      {decision}
                    </span>
                  </td>
                  <td style={{ ...td, textAlign: "left" }}><code style={SUITE}>{r.unitRef}</code></td>
                  {months.map((v, i) => {
                    const has = Math.abs(v) > 0.5;
                    return (
                      <td key={i} style={{ ...td, background: has ? (r.assumed[i] ? ASSUMED_BG : CONTRACTED_BG) : undefined, color: has ? "var(--text)" : "var(--muted)" }}>
                        {has ? monthShown(v, r.sqft) : "–"}
                      </td>
                    );
                  })}
                  <td style={{ ...td, fontWeight: 800, borderLeft: "1px solid var(--border)" }}>{nothing ? "–" : money0(total)}</td>
                  <td style={{ ...td, color: nothing ? "var(--muted)" : undefined }}>{nothing || !(r.sqft > 0) ? "–" : psf$(total / r.sqft)}</td>
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
                    <tr><td colSpan={16} style={{ ...td, textAlign: "left", paddingLeft: 22, color: "#b91c1c", fontWeight: 600 }}>
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
        <span>Dimmed = pays nothing this year. $/SF is the year&rsquo;s total over the suite&rsquo;s SF (totals: over the {Math.round(totalSf).toLocaleString("en-US")} SF in view){unit === "psf" ? "; months in $/SF are annualized (× 12)" : ""}. Hover a tenant for how their figure was reached.</span>
      </div>
      {leasing?.error && <div style={{ color: "#b91c1c", fontSize: 13, padding: "0 14px 10px" }}>{leasing.error}</div>}
      {leasing && (leasing.dealCapital.ti > 0 || leasing.dealCapital.lc > 0) && (
        <div className="muted small" style={{ padding: "9px 14px", borderTop: "1px solid var(--border)" }}>
          The leasing calls carry <b style={{ color: "var(--text)" }}>${Math.round(leasing.dealCapital.ti).toLocaleString("en-US")}</b> of TI and <b style={{ color: "var(--text)" }}>${Math.round(leasing.dealCapital.lc).toLocaleString("en-US")}</b> of leasing commissions, on the Capital lines in the month each new rent starts.
        </div>
      )}
      {openCall && leasing && (
        <DecisionModal key={openCall.unitRef} call={openCall} owner={leasing.owner} budgetYear={year} fromSchedule={fromSchedule}
          onSave={leasing.onSave} onClose={() => setOpenUnit(null)} error={leasing.error} />
      )}
    </div>
  );
}

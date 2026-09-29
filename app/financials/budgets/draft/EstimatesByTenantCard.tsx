"use client";

// CAM ESTIMATES BY TENANT — the review before the estimates go into Skyline as
// each tenant's monthly charges, and the answer when a tenant calls. Per
// tenant: the monthly CAM / INS / RET billed TODAY (rent roll), the last
// reconciliation's actual, what the budget sets, the change, and WHY — split
// into the catch-up to the reconciled actual and the budget's pool change
// (`estimatesByTenant.ts`). An estimate can be set by hand (Drew / Alison /
// admin), with a reason; the override IS the budget's figure for that tenant,
// so the recovery lines move with it. The Skyline import is the CAM recon's own
// recurring-charge CSV.

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { StatPill, Pill, TONE_AMBER, TONE_NEUTRAL, TONE_BLUE, PortionPill } from "@/app/components/Pill";
import { HoverCard, type TipRow } from "@/app/components/HoverCard";
import { DownloadMenu } from "@/app/components/DownloadMenu";
import { estimateRows, estimateTotals, skylineEstimateRows, allFromStatement, type EstimateRow, type WhyPart } from "@/lib/financials/budgets/estimatesByTenant";
import { buildEstimatesXlsx } from "@/lib/financials/budgets/estimatesExport";
import { recoveryCheck, type GroupCheck } from "@/lib/financials/budgets/recoveryCheck";
import { chargeRowsToCSV } from "@/lib/cam/office/exports";
import type { TenantRevenueRow } from "@/lib/financials/budgets/draft";
import type { ReimbursementEstimate } from "@/lib/financials/budgets/reimbursementEstimate";

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
const LABEL = { cam: "CAM", ins: "INS", ret: "RET" } as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthName = (ym?: string | null) => (ym ? `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}` : "");
const SOURCE = { statement: "monthly statement", rentroll: "rent roll", recon: "last recon's INS due ÷ 12 (how the estimate was set)" } as const;

type Sort = "suite" | "change" | "pct";
type Only = "all" | "flagged" | "fallback" | "differs";
type Unit = "month" | "psf";

export function EstimatesByTenantCard({ rows, est, year, propertyName, propertyCode, canOverride, queued, onSaved }: {
  rows: TenantRevenueRow[]; est?: ReimbursementEstimate; year: number; propertyName: string; propertyCode: string;
  /** Drew / Alison / admin on a property tab (never the book roll-up). */
  canOverride: boolean;
  /** The draft page's write queue — every store write goes through it. */
  queued: <T>(fn: () => Promise<T>) => Promise<T>;
  onSaved: () => void;
}) {
  const [sort, setSort] = useState<Sort>("suite");
  const [unit, setUnit] = useState<Unit>("month");
  const [only, setOnly] = useState<Only>("all");
  const [editing, setEditing] = useState<EstimateRow | null>(null);
  const all = useMemo(() => estimateRows(rows, est), [rows, est]);
  const tot = useMemo(() => estimateTotals(all), [all]);
  const ry = est?.reconYear ?? null;
  const check = useMemo(() => recoveryCheck(est), [est]);
  const shown = useMemo(() => {
    const list = all.filter((r) => only === "flagged" ? !!r.jump
      : only === "fallback" ? !!r.now && !allFromStatement(r)
      : only === "differs" ? !!r.differs?.length : true);
    if (sort === "change") list.sort((a, b) => b.change - a.change);
    if (sort === "pct") list.sort((a, b) => (b.changePct ?? -Infinity) - (a.changePct ?? -Infinity));
    return list;
  }, [all, sort, only]);
  if (!all.length) return null;

  const v = (monthly: number | null | undefined, sf: number) =>
    monthly == null || Math.abs(monthly) < 0.5 ? "–" : unit === "month" ? money0(monthly) : psf(monthly, sf);
  const save = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
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
        <span style={{ fontSize: 16, fontWeight: 800 }}>CAM estimates by tenant</span>
        <span className="muted small">Monthly estimates billed today vs the {year} budget, and why they moved — reviewed here before the Skyline import</span>
        <span style={{ flex: 1 }} />
        <DownloadMenu items={[
          { label: "Skyline import (.csv)", description: `Monthly CAM / INS / RET charges, effective 1/1/${year}`,
            onClick: () => save(new Blob([chargeRowsToCSV(skylineEstimateRows(all, year))], { type: "text/csv;charset=utf-8" }), `${propertyCode}_${year}_Estimates_Skyline.csv`) },
          { label: "Review workbook (.xlsx)", description: "The table as shown, with the why",
            onClick: async () => save(new Blob([await buildEstimatesXlsx({ propertyName, propertyCode, year, reconYear: ry, rows: shown })]), `${propertyCode} ${year} CAM estimates review.xlsx`) },
        ]} />
      </div>

      <div className="pills" style={{ padding: "0 14px 12px" }}>
        <StatPill label="Billed today" value={`${money0(tot.now.total)}/mo`} sub={`${tot.tenants} tenants · CAM + INS + RET`} />
        {ry != null && <StatPill label={`${ry} actual`} value={`${money0(tot.recon.total)}/mo`} sub="reconciled amount due ÷ 12" />}
        <StatPill label={`${year} budget`} value={`${money0(tot.next.total)}/mo`} sub={tot.overridden ? `${tot.overridden} set by hand` : "monthly estimate"} />
        <StatPill label="Change" value={signed(tot.change)} sub={`${pctS(tot.changePct)} a month`} accent={tone(tot.change)} />
        <StatPill label="Big jumps" value={String(tot.flagged)} sub="≥15% and ≥$100/mo" accent={tot.flagged ? UP : undefined} />
        <StatPill label="Today from statement" value={`${tot.fromStatement} of ${tot.tenants}`}
          sub={tot.statementMonth ? `${monthName(tot.statementMonth)} statement · ${tot.fallback} fall back` : "no monthly statement imported"}
          accent={tot.fallback ? UP : undefined} />
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
          <button type="button" style={seg(only === "flagged")} onClick={() => setOnly((o) => (o === "flagged" ? "all" : "flagged"))}>▲ Big jumps · {tot.flagged}</button>
        )}
        {tot.fallback > 0 && (
          <button type="button" style={seg(only === "fallback")} onClick={() => setOnly((o) => (o === "fallback" ? "all" : "fallback"))}>Not on statement · {tot.fallback}</button>
        )}
        {tot.differs > 0 && (
          <button type="button" style={seg(only === "differs")} onClick={() => setOnly((o) => (o === "differs" ? "all" : "differs"))}>Statement ≠ rent roll · {tot.differs}</button>
        )}
        <span className="muted small" style={{ marginLeft: "auto" }}>Billed today is read off each tenant&apos;s latest monthly statement; <i>italic</i> = not on it (rent roll / recon), amber = the statement and rent roll disagree</span>
      </div>

      {check.some((c) => c.over || c.capped) && (
        <div style={{ margin: "0 14px 10px", padding: "8px 12px", borderRadius: 8, fontSize: 13,
          background: check.some((c) => c.over) ? "rgba(220,38,38,0.08)" : "rgba(217,119,6,0.10)",
          border: `1px solid ${check.some((c) => c.over) ? "rgba(220,38,38,0.35)" : "rgba(217,119,6,0.35)"}` }}>
          {check.filter((c) => c.over).map((c) => (
            <div key={c.group}><b>{c.label} over-recovers:</b> {money0(c.recovered)} a year against a {money0(c.pool)} budget pool ({pct0(c.ratio)}) — a figure set by hand is over the ceiling. Tenants would be over-billed.</div>
          ))}
          {check.filter((c) => c.capped && !c.over).map((c) => (
            <div key={c.group}><b>{c.label} capped:</b> the methodology came to {money0(c.capped!.before)} a year against a {money0(c.pool)} pool, so every tenant was scaled back to {money0(c.recovered)} ({pct0(c.ratio)}). Worth a look — a pool the draft sees differently from the recon is the usual cause.</div>
          ))}
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: "left" }} colSpan={2} />
              <th style={{ ...th, textAlign: "center", borderLeft: DIVIDE }} colSpan={4}>Billed today</th>
              {ry != null && <th style={{ ...th, textAlign: "center", borderLeft: DIVIDE }}>{ry} actual</th>}
              <th style={{ ...th, textAlign: "center", borderLeft: DIVIDE }} colSpan={4}>{year} budget{canOverride ? " · click to set" : ""}</th>
              <th style={{ ...th, textAlign: "center", borderLeft: DIVIDE }} colSpan={3}>Change</th>
            </tr>
            <tr>
              <th style={{ ...th, textAlign: "left" }}>Tenant</th><th style={{ ...th, textAlign: "left" }}>Suite</th>
              <th style={{ ...th, borderLeft: DIVIDE }}>CAM</th><th style={th}>INS</th><th style={th}>RET</th><th style={th}>Total</th>
              {ry != null && <th style={{ ...th, borderLeft: DIVIDE }}>Total</th>}
              <th style={{ ...th, borderLeft: DIVIDE }}>CAM</th><th style={th}>INS</th><th style={th}>RET</th><th style={th}>Total</th>
              <th style={{ ...th, borderLeft: DIVIDE }}>$ / mo</th><th style={th}>%</th><th style={{ ...th, textAlign: "left" }}>Why</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((e) => (
              <Row key={e.unitRef + e.tenant} e={e} v={v} ry={ry} year={year} canOverride={canOverride} onEdit={() => setEditing(e)} />
            ))}
            <tr style={{ fontWeight: 800 }}>
              <td style={{ ...td, textAlign: "left", borderTop: DIVIDE }} colSpan={2}>Total{only !== "all" ? " · all tenants" : ""}</td>
              {(["cam", "ins", "ret", "total"] as const).map((k, i) => (
                <td key={`n${k}`} style={{ ...td, borderTop: DIVIDE, ...(i === 0 ? { borderLeft: DIVIDE } : {}) }}>{money0(tot.now[k])}</td>
              ))}
              {ry != null && <td style={{ ...td, borderTop: DIVIDE, borderLeft: DIVIDE }}>{money0(tot.recon.total)}</td>}
              {(["cam", "ins", "ret", "total"] as const).map((k, i) => (
                <td key={`x${k}`} style={{ ...td, borderTop: DIVIDE, ...(i === 0 ? { borderLeft: DIVIDE } : {}) }}>{money0(tot.next[k])}</td>
              ))}
              <td style={{ ...td, borderTop: DIVIDE, borderLeft: DIVIDE, color: tone(tot.change) }}>{signed(tot.change)}</td>
              <td style={{ ...td, borderTop: DIVIDE, color: tone(tot.change) }}>{pctS(tot.changePct)}</td>
              <td style={{ ...td, borderTop: DIVIDE }} />
            </tr>
            {check.length > 0 && <CheckRow check={check} ry={ry} year={year} />}
          </tbody>
        </table>
      </div>
      <div className="muted small" style={{ padding: "8px 14px 12px" }}>
        Today = the rent roll&rsquo;s monthly Operating Expense (CAM), Other Expense (INS) and Real Estate Tax.{" "}
        {ry != null && <>{ry} actual = the tenant&rsquo;s reconciled amount due ÷ 12. </>}
        {year} = the budget&rsquo;s recovery averaged over the months billed, or the figure set by hand (<b style={{ color: "var(--brand)" }}>blue</b>) — which is what the budget carries.
        Each computed estimate is rounded to the nearest $5 (it ends in 0 or 5), in the table and the import; a hand-set one stands as keyed. Amber ▲ = up 15%+ and $100+/month.
      </div>

      {editing && (
        <OverrideModal e={editing} year={year} ry={ry} propertyCode={propertyCode} queued={queued}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onSaved(); }} />
      )}
    </div>
  );
}

const pct0 = (r: number | null | undefined) => (r == null ? "–" : `${(r * 100).toFixed(1)}%`);

/** RECOVERY RATIO — the year's recoveries ÷ the budget's recoverable pool, by
 *  group, beside the recon year's own ratio. Over 100% (or over last year's
 *  ratio, where admin fees took it higher) is over-billing (`recoveryCheck.ts`). */
function CheckRow({ check, ry, year }: { check: GroupCheck[]; ry: number | null; year: number }) {
  const g = (k: GroupCheck["group"]) => check.find((c) => c.group === k);
  const all = check.reduce((a, c) => ({ rec: a.rec + c.recovered, pool: a.pool + c.pool }), { rec: 0, pool: 0 });
  const allRecon = (() => {
    const w = check.filter((c) => c.reconRatio != null);
    const pool = w.reduce((s, c) => s + c.pool, 0);
    return pool > 0 ? w.reduce((s, c) => s + c.reconRatio! * c.pool, 0) / pool : null;
  })();
  const color = (c?: GroupCheck) => (!c ? undefined : c.over ? "#b91c1c" : c.capped ? UP : "#15803d");
  const cell = (c: GroupCheck | undefined, span: number, first = false) => (
    <td colSpan={span} style={{ ...td, borderTop: "1px dashed var(--border)", ...(first ? { borderLeft: DIVIDE } : {}), textAlign: span > 1 ? "center" : "right" }}>
      {c ? (
        <HoverCard title={`${c.label} · recovery ratio`} width={340} rows={[
          { label: `${year} recoveries`, value: money0(c.recovered) },
          { label: `${year} budget pool`, value: money0(c.pool) },
          { label: "Ratio", value: pct0(c.ratio), color: color(c) },
          ...(c.reconRatio != null ? [{ label: `${ry} recon ratio`, value: pct0(c.reconRatio) }] : []),
          { label: "Ceiling", value: `${money0(c.ceiling)} (${c.reconRatio != null && c.reconRatio > 1 ? `${ry} ratio` : "100% of the pool"})` },
          ...(c.capped ? [{ label: "Methodology came to", value: `${money0(c.capped.before)} — capped`, color: UP }] : []),
        ]}>
          <span style={{ fontWeight: 800, color: color(c) }}>{span > 1 ? `${c.label} ` : ""}{pct0(c.ratio)}{c.capped ? " · capped" : ""}</span>
        </HoverCard>
      ) : "–"}
    </td>
  );
  return (
    <tr>
      <td style={{ ...td, textAlign: "left", borderTop: "1px dashed var(--border)", fontWeight: 700 }} colSpan={2}>
        Recovery ratio <span className="muted small" style={{ fontWeight: 400 }}>· a year&apos;s recoveries ÷ the recoverable pool</span>
      </td>
      <td colSpan={4} style={{ ...td, borderTop: "1px dashed var(--border)", borderLeft: DIVIDE }} />
      {ry != null && <td style={{ ...td, borderTop: "1px dashed var(--border)", borderLeft: DIVIDE, color: "var(--muted)", fontWeight: 700 }}>{pct0(allRecon)}</td>}
      {cell(g("camIns"), 2, true)}
      {cell(g("ret"), 1)}
      <td style={{ ...td, borderTop: "1px dashed var(--border)", fontWeight: 800 }}>{pct0(all.pool > 0 ? all.rec / all.pool : null)}</td>
      <td colSpan={3} style={{ ...td, borderTop: "1px dashed var(--border)", borderLeft: DIVIDE }} />
    </tr>
  );
}

/** The why, one category at a time: today → the reconciled actual → the budget. */
function whyRows(e: EstimateRow, ry: number | null, year: number): TipRow[] {
  const rows: TipRow[] = [];
  const m0 = e.method;
  const basis = m0?.kind === "retail" ? m0.basis : undefined;
  for (const w of e.why) {
    // The calculation, step by step, where the tenant is on a retail recon:
    // the pool → the GLA it is shared over → this tenant's SF and PRS → the
    // year → the month. Every figure can be checked against the budget grid
    // and the unit page.
    const b = basis?.[w.part];
    if (b && m0?.kind === "retail") {
      rows.push({ label: `${LABEL[w.part]} — the calculation`, value: "", color: "var(--brand)" });
      if (b.flat) rows.push({ label: "  Own parcel — a fixed RET, not a pool share", value: money0(b.year) });
      else {
        const notes = [w.part === "cam" && m0.excludedLines ? `after ${m0.excludedLines} excluded line${m0.excludedLines === 1 ? "" : "s"}` : "", b.capped ? `capped at +${m0.capPct}%` : ""].filter(Boolean).join(", ");
        rows.push({ label: `  Expense (${year} budget pool${notes ? `, ${notes}` : ""})`, value: money0(b.expense) });
        rows.push({ label: "  Applicable GLA", value: b.gla > 0 ? `${b.gla.toLocaleString("en-US")} SF` : "–" });
        rows.push({ label: "  Tenant SF", value: `${b.sf.toLocaleString("en-US")} SF` });
        const computed = b.gla > 0 ? (b.sf / b.gla) * 100 : null;
        const stipulated = computed == null || Math.abs(computed - b.prs) >= 0.005;
        rows.push({ label: `  Tenant PRS${stipulated ? " (stipulated)" : " (SF ÷ GLA)"}`, value: `${b.prs.toFixed(2)}%`, color: stipulated ? UP : undefined });
        rows.push({ label: "  Tenant est. expense", value: `${money0(b.expense)} × ${b.prs.toFixed(2)}% = ${money0(b.share)}` });
        if (b.adminPct && Math.abs(b.admin) >= 0.5) rows.push({ label: `  + Admin fee ${b.adminPct}%`, value: money0(b.admin) });
        if (b.discountPct && Math.abs(b.year - b.share) >= 0.5) rows.push({ label: `  − Discount ${b.discountPct}%`, value: money0(b.year - b.share) });
        if (b.year !== b.share) rows.push({ label: "  = Tenant's year", value: money0(b.year), color: "var(--brand)" });
      }
      const final = w.year ?? b.year;
      if (Math.abs(final - b.year) >= 1 && !w.overridden) rows.push({ label: "  After the recovery-ratio check", value: money0(final), color: UP });
      if (w.annual) rows.push({ label: "  Est. monthly charge", value: `$0 — ${money0(w.annual)} collected in May`, color: "var(--muted)" });
      else if (w.overridden) rows.push({ label: "  Est. monthly charge (set by hand)", value: money0(w.next), color: "var(--brand)" });
      else rows.push({ label: "  Est. monthly charge", value: `${money0(final)} ÷ ${w.months || 12} = ${money0(w.next)}${(w.months || 12) < 12 ? ` (${w.months} mo)` : ""}`, color: "var(--brand)" });
    }
    const pool = w.poolPct != null ? `, pool ${w.poolPct >= 0 ? "+" : "−"}${Math.abs(w.poolPct).toFixed(1)}%` : "";
    rows.push({ label: `${LABEL[w.part]} today`, value: money0(w.now) });
    if (w.recon != null) rows.push({ label: `  → ${ry} actual`, value: `${money0(w.recon)} (${signed(w.catchUp ?? 0)})`, color: tone(w.catchUp ?? 0) });
    rows.push({ label: `  → ${year}${w.overridden ? " (set by hand)" : ""}`, value: `${money0(w.next)}${w.budgetChange != null ? ` (${signed(w.budgetChange)}${pool})` : ""}`, color: w.overridden ? "var(--brand)" : tone(w.next - (w.recon ?? w.now)) });
    if (w.overridden && w.computed != null) rows.push({ label: "  computed was", value: money0(w.computed), color: "var(--muted)" });
    if (w.annual) rows.push({ label: `  collected at reconciliation`, value: `${money0(w.annual)} in May ${year} · no monthly estimate`, color: "var(--muted)" });
  }
  if (e.billedFrom) {
    const src = (p: "cam" | "ins" | "ret") => e.billedFrom![p] === "statement" ? `${monthName(e.billedMonth)} statement` : SOURCE[e.billedFrom![p]];
    rows.push({ label: "Today from", value: `CAM ${src("cam")} · INS ${src("ins")} · RET ${src("ret")}`, color: "var(--muted)" });
    for (const d of e.differs ?? []) rows.push({ label: `  ${LABEL[d.part]}: statement vs rent roll`, value: `${money0(d.statement)} vs ${money0(d.rentRoll)}`, color: UP });
  }
  if (e.uo) rows.push({ label: "U&O billed today (not an estimate)", value: money0(e.uo), color: "var(--muted)" });
  const m = e.method;
  if (m?.kind === "retail" && !m.basis) {
    rows.push({ label: "Share (CAM / INS / RET)", value: `${m.camPrs.toFixed(2)}% / ${m.insPrs.toFixed(2)}% / ${m.retPrs.toFixed(2)}%` });
    if (m.adminFeePct) rows.push({ label: "Admin fee", value: `${m.adminFeePct}%` });
    if (m.capPct != null) rows.push({ label: "CAM cap", value: `${m.capPct}% a year`, color: UP });
    if (m.excludedLines) rows.push({ label: "Excluded CAM lines", value: String(m.excludedLines) });
  } else if (m?.kind === "office") {
    rows.push({ label: "Pro-rata share", value: `${m.proRataPct.toFixed(2)}%` });
    rows.push({ label: "Base year", value: m.noBaseStop ? "None (full NNN)" : m.baseYear ? String(m.baseYear) : "–" });
    // Op Ex is stopped LINE BY LINE: each line's budget against its base.
    if (m.lines?.length) {
      const over = m.lines.filter((l) => l.over > 0);
      rows.push({ label: `Op Ex, line by line (${year} budget vs base)`, value: "", color: "var(--muted)" });
      for (const l of over.slice(0, 10)) rows.push({ label: `  ${l.label}${l.fromLine ? "" : " *"}`, value: `${money0(l.budget)} − ${money0(l.base)} = ${money0(l.over)}`, color: UP });
      if (over.length > 10) rows.push({ label: `  ${over.length - 10} more lines over base`, value: money0(over.slice(10).reduce((a, l) => a + l.over, 0)), color: "var(--muted)" });
      const under = m.lines.length - over.length;
      if (under) rows.push({ label: `  ${under} line${under === 1 ? "" : "s"} at or under base`, value: "$0", color: "var(--muted)" });
      const tot = over.reduce((a, l) => a + l.over, 0);
      rows.push({ label: `  Over base × ${m.proRataPct.toFixed(2)}%`, value: `${money0(tot)} × share = ${money0(tot * m.proRataPct / 100)}/yr`, color: "var(--brand)" });
      if (m.lines.some((l) => !l.fromLine)) rows.push({ label: "  * no budget line for that account — grown at the building's Op Ex rate", value: "", color: "var(--muted)" });
    }
  }
  return rows;
}

function Row({ e, v, ry, year, canOverride, onEdit }: {
  e: EstimateRow; v: (m: number | null | undefined, sf: number) => string; ry: number | null; year: number; canOverride: boolean; onEdit: () => void;
}) {
  const n = e.now;
  const w = (p: "cam" | "ins" | "ret") => e.why.find((x) => x.part === p);
  const nextCell = (p: "cam" | "ins" | "ret" | "total") => {
    const over = p === "total" ? e.overridden : !!w(p)?.overridden;
    return (
      <td key={p} onClick={canOverride ? onEdit : undefined}
        style={{ ...td, ...(p === "cam" ? { borderLeft: DIVIDE } : {}), ...(p === "total" ? { fontWeight: 700 } : {}),
          ...(canOverride ? { background: "var(--input-cell)", cursor: "pointer" } : {}),
          ...(over ? { color: "var(--input-typed)", fontWeight: 800 } : {}) }}>
        {p !== "total" && e.annual?.[p]
          ? <span className="muted" style={{ fontStyle: "italic", fontSize: 12, fontWeight: 400, lineHeight: 1.25, display: "inline-block" }}>at recon<br />{money0(e.annual[p]!)} in May</span>
          : v(e.next[p], e.sqft)}
      </td>
    );
  };
  return (
    <tr style={e.jump ? { background: "rgba(217,119,6,0.06)" } : undefined}>
      <td style={{ ...td, textAlign: "left", whiteSpace: "normal", minWidth: 150 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 600 }}>{e.tenant || "(unnamed)"}</span>
          <PortionPill portion={e.portion} />
          {!n && <Pill tone={TONE_NEUTRAL}>New</Pill>}
          {e.assumed && <Pill tone={TONE_NEUTRAL}>Assumed</Pill>}
          {e.overridden && <Pill tone={TONE_BLUE}>Set by hand</Pill>}
        </span>
      </td>
      <td style={{ ...td, textAlign: "left" }}><code style={SUITE}>{e.unitRef}</code></td>
      {(["cam", "ins", "ret"] as const).map((p) => {
        const off = !!n && e.billedFrom?.[p] !== "statement";
        const diff = e.differs?.some((d) => d.part === p);
        return (
          <td key={p} style={{ ...td, ...(p === "cam" ? { borderLeft: DIVIDE } : {}),
            ...(off ? { fontStyle: "italic", color: "var(--muted)" } : {}),
            ...(diff ? { background: "rgba(217,119,6,0.12)" } : {}) }}>
            {v(n?.[p], e.sqft)}
          </td>
        );
      })}
      <td style={{ ...td, fontWeight: 700 }}>{v(n?.total, e.sqft)}</td>
      {ry != null && <td style={{ ...td, borderLeft: DIVIDE, color: "var(--muted)" }}>{v(e.recon?.total, e.sqft)}</td>}
      {nextCell("cam")}{nextCell("ins")}{nextCell("ret")}{nextCell("total")}
      <td style={{ ...td, borderLeft: DIVIDE, fontWeight: 700, color: tone(e.change) }}>{e.jump ? `▲ ${signed(e.change)}` : signed(e.change)}</td>
      <td style={{ ...td, color: tone(e.change) }}>{e.jump ? <Pill tone={TONE_AMBER}>{pctS(e.changePct)}</Pill> : pctS(e.changePct)}</td>
      <td style={{ ...td, textAlign: "left", whiteSpace: "normal", minWidth: 200, maxWidth: 260, fontSize: 12.5 }}>
        <HoverCard title={`${e.tenant || "—"} · ${e.unitRef} · why`} width={460} rows={whyRows(e, ry, year)}
          footer={{ label: `${year} vs today, a month`, value: `${signed(e.change)} (${pctS(e.changePct)})`, color: tone(e.change) }}>
          <span>{e.reason}</span>
        </HoverCard>
      </td>
    </tr>
  );
}

/** Set a tenant's monthly estimate by hand — with the reason the tenant will be given. */
function OverrideModal({ e, year, ry, propertyCode, queued, onClose, onSaved }: {
  e: EstimateRow; year: number; ry: number | null; propertyCode: string;
  queued: <T>(fn: () => Promise<T>) => Promise<T>; onClose: () => void; onSaved: () => void;
}) {
  const parts = (["cam", "ins", "ret"] as const);
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(parts.map((p) => [p, String(e.next[p] || "")])));
  const [note, setNote] = useState(e.overrideNote ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const post = (body: object) => queued(async () => {
    const r = await fetch("/api/financials/budgets/estimate-overrides", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, propertyCode, unitRef: e.unitRef, ...body }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error ?? "Couldn't save.");
  });
  const submit = async (clear = false) => {
    setBusy(true); setErr(null);
    try {
      if (clear) await post({ clear: true });
      else {
        // Only the categories that differ from the computed figure are overridden.
        const body: Record<string, unknown> = { note };
        for (const p of parts) {
          const n = Number(vals[p].replace(/[$,\s]/g, "") || 0);
          const w = e.why.find((x) => x.part === p);
          const computed = w?.computed ?? w?.next ?? 0;
          if (w?.overridden || Math.round(n) !== Math.round(computed)) body[p] = n;
        }
        await post(body);
      }
      onSaved();
    } catch (x) { setErr(x instanceof Error ? x.message : "Couldn't save."); setBusy(false); }
  };
  const body = (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 120, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "80px 16px", overflowY: "auto" }}>
      <div onClick={(ev) => ev.stopPropagation()} role="dialog" aria-label="Set estimate"
        style={{ background: "var(--card)", borderRadius: 12, width: "100%", maxWidth: 560, boxShadow: "0 20px 60px rgba(0,0,0,0.35)", borderTop: "3px solid var(--brand)" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
          <div style={secLabel}>{year} monthly estimate · set by hand</div>
          <div style={{ fontSize: 17, fontWeight: 800, marginTop: 2 }}>{e.tenant} · <code style={SUITE}>{e.unitRef}</code></div>
          <div className="muted small" style={{ marginTop: 2 }}>What you set here is the budget&rsquo;s figure for this tenant — the recovery lines and the Skyline import carry it.</div>
        </div>
        <div style={{ padding: "12px 18px", display: "grid", gap: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              <th style={{ ...th, textAlign: "left" }} /><th style={th}>Today</th>{ry != null && <th style={th}>{ry} actual</th>}<th style={th}>Computed</th><th style={th}>{year} estimate</th>
            </tr></thead>
            <tbody>
              {parts.map((p) => {
                const w = e.why.find((x) => x.part === p);
                return (
                  <tr key={p}>
                    <td style={{ ...td, textAlign: "left", fontWeight: 700 }}>{LABEL[p]}</td>
                    <td style={td}>{money0(w?.now ?? 0)}</td>
                    {ry != null && <td style={td}>{w?.recon != null ? money0(w.recon) : "–"}</td>}
                    <td style={{ ...td, color: "var(--muted)" }}>{money0(w?.computed ?? w?.next ?? 0)}</td>
                    <td style={{ ...td, background: "var(--input-cell)" }}>
                      <input value={vals[p]} inputMode="decimal" aria-label={`${LABEL[p]} monthly estimate`}
                        onChange={(ev) => setVals((s) => ({ ...s, [p]: ev.target.value }))} style={{ width: 100, textAlign: "right" }} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={secLabel}>Why — what the tenant will be told (required)</span>
            <textarea value={note} onChange={(ev) => setNote(ev.target.value)} rows={3}
              placeholder="e.g. Taxes reassessed on appeal; phase the increase in over two years" />
          </label>
          {err && <div className="small" style={{ color: "#b91c1c" }}>{err}</div>}
        </div>
        <div style={{ padding: "12px 18px", borderTop: "1px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end" }}>
          {e.overridden && <button type="button" className="btn sm" disabled={busy} onClick={() => submit(true)}>Back to computed</button>}
          <span style={{ flex: 1 }} />
          <button type="button" className="btn sm" onClick={onClose}>Cancel</button>
          <button type="button" className="btn sm primary" disabled={busy || !note.trim()} onClick={() => submit()}>{busy ? "Saving…" : "Save estimate"}</button>
        </div>
      </div>
    </div>
  );
  return typeof document !== "undefined" ? createPortal(body, document.body) : null;
}

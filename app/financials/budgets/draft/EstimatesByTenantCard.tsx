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

import { StatusBanner } from "@/app/components/StatusBanner";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { StatPill, Pill, TONE_AMBER, TONE_NEUTRAL, TONE_BLUE, PortionPill } from "@/app/components/Pill";
import { HoverCard, type TipRow } from "@/app/components/HoverCard";
import { DownloadMenu } from "@/app/components/DownloadMenu";
import { estimateRows, estimateTotals, skylineEstimateRows, allFromStatement, type EstimateRow, type WhyPart } from "@/lib/financials/budgets/estimatesByTenant";
import { buildEstimatesXlsx } from "@/lib/financials/budgets/estimatesExport";
import { recoveryCheck, type GroupCheck } from "@/lib/financials/budgets/recoveryCheck";
import { chargeRowsToCSV } from "@/lib/cam/office/exports";
import { SegChoice } from "@/app/financials/reprojections/ReprojTable";
import type { TenantRevenueRow } from "@/lib/financials/budgets/draft";
import type { ReimbursementEstimate } from "@/lib/financials/budgets/reimbursementEstimate";

const money0 = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const signed = (n: number) => (Math.abs(n) < 0.5 ? "–" : `${n > 0 ? "+" : "−"}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`);
const pctS = (n: number | null) => (n == null ? "new" : Math.abs(n) < 0.05 ? "0%" : `${n > 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}%`);
const psf = (monthly: number, sf: number) => (sf > 0 ? `$${((monthly * 12) / sf).toFixed(2)}` : "–");
const secLabel: React.CSSProperties = { fontSize: "var(--fs-11)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" };
const th: React.CSSProperties = { ...secLabel, padding: "7px 8px", textAlign: "right", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "9px 8px", fontSize: "var(--fs-13-5)", textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", borderBottom: "1px solid var(--border)" };
const SUITE: React.CSSProperties = { fontSize: "var(--fs-12)", fontWeight: 700, color: "var(--c-0b4a7d)", whiteSpace: "nowrap" };
const DIVIDE = "2px solid var(--border)";
const UP = "var(--c-b45309)", DOWN = "var(--c-15803d)";
const tone = (n: number) => (n > 0.5 ? UP : n < -0.5 ? DOWN : "var(--muted)");
const LABEL = { cam: "CAM", ins: "INS", ret: "RET" } as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthName = (ym?: string | null) => (ym ? `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}` : "");

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
    fontSize: "var(--fs-12)", fontWeight: 700, padding: "4px 10px", borderRadius: 999, cursor: "pointer",
    border: `1px solid ${active ? "var(--brand)" : "var(--border)"}`, background: active ? "var(--tint-brand-bg, rgba(11,74,125,0.10))" : "var(--card)",
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

      {check.some((c) => c.over) && (
        <StatusBanner compact tone="warning" style={{ margin: "0 14px 10px" }} title="Recoveries to review">
          {check.filter((c) => c.over).map((c) => (
            <div key={c.group}><b>{c.label}:</b> {money0(c.recovered)} a year against a {money0(c.pool)} budget pool ({pct0(c.ratio)}) — above what admin fees explain. Check the tenants&apos; shares and any estimate set by hand before importing.</div>
          ))}
        </StatusBanner>
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
  const color = (c?: GroupCheck) => (!c ? undefined : c.over ? UP : "var(--c-15803d)");
  const cell = (c: GroupCheck | undefined, span: number, first = false) => (
    <td colSpan={span} style={{ ...td, borderTop: "1px dashed var(--border)", ...(first ? { borderLeft: DIVIDE } : {}), textAlign: span > 1 ? "center" : "right" }}>
      {c ? (
        <HoverCard title={`${c.label} · recovery ratio`} width={340} rows={[
          { label: `${year} recoveries`, value: money0(c.recovered) },
          { label: `${year} budget pool`, value: money0(c.pool) },
          { label: "Ratio", value: pct0(c.ratio), color: color(c) },
          ...(c.reconRatio != null ? [{ label: `${ry} recon ratio`, value: pct0(c.reconRatio) }] : []),
          { label: "Review above", value: money0(c.ceiling) },
        ]}>
          <span style={{ fontWeight: 800, color: color(c) }}>{span > 1 ? `${c.label} ` : ""}{pct0(c.ratio)}</span>
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

/** The why, ONE ROW per category: today → the budget, and what moved it
 *  (the catch-up to the reconciled actual, the pool's change). The working
 *  (share, admin, cap, lines) is on each category cell's own hover. */
function whyRows(e: EstimateRow, ry: number | null, year: number): TipRow[] {
  const rows: TipRow[] = [];
  for (const w of e.why) {
    const parts = [
      w.recon != null && Math.abs(w.catchUp ?? 0) >= 1 ? `${signed(w.catchUp ?? 0)} to ${ry} actual` : "",
      w.budgetChange != null && Math.abs(w.budgetChange) >= 1 ? `${signed(w.budgetChange)} budget${w.poolPct != null ? ` (pool ${w.poolPct >= 0 ? "+" : "−"}${Math.abs(w.poolPct).toFixed(0)}%)` : ""}` : "",
    ].filter(Boolean).join(" · ");
    rows.push({
      label: `${LABEL[w.part]}${w.overridden ? " · set by hand" : w.annual ? " · at recon" : parts ? ` · ${parts}` : ""}`,
      value: w.annual ? `${money0(w.annual)} in May` : `${money0(w.now)} → ${money0(w.next)}`,
      color: w.overridden ? "var(--brand)" : tone(w.next - w.now),
    });
  }
  // The one exception worth reading: today's billing disagrees between sources.
  for (const d of e.differs ?? []) rows.push({ label: `${LABEL[d.part]} · statement ≠ rent roll`, value: `${money0(d.statement)} vs ${money0(d.rentRoll)}`, color: UP });
  return rows;
}

/** One category's calculation, for the hover on that 2027 cell: the pool →
 *  the GLA → the tenant's SF and PRS → the year → the month (retail), or the
 *  Op Ex lines over base × the share (office). */
function calcTip(e: EstimateRow, part: "cam" | "ins" | "ret", year: number, ry: number | null = null): { rows: TipRow[]; footer?: TipRow; body?: React.ReactNode; width?: number } | null {
  const w = e.why.find((x) => x.part === part);
  const m = e.method;
  if (!w) return null;
  const rows: TipRow[] = [];
  const monthly = (final: number): TipRow => w.annual
    ? { label: "Est. monthly charge", value: `$0 · ${money0(w.annual)} at recon (May)`, color: "var(--muted)" }
    : w.overridden
      ? { label: "Est. monthly charge (set by hand)", value: money0(w.next), color: "var(--brand)" }
      : { label: "Est. monthly charge", value: `${money0(final)} ÷ ${w.months || 12} = ${money0(w.next)}`, color: "var(--brand)" };
  const b = m?.kind === "retail" ? m.basis?.[part] : undefined;
  if (b?.lines?.length && m?.kind === "retail") {
    const final = w.year ?? b.year;
    return { rows: [], body: <CamWorksheet b={b} year={year} ry={ry ?? year - 2} final={final} />, footer: monthly(final), width: 380 };
  }
  if (b && m?.kind === "retail") {
    if (b.flat) rows.push({ label: "Own parcel — fixed RET", value: money0(b.year) });
    else {
      const notes = [part === "cam" && m.excludedLines ? `${m.excludedLines} line${m.excludedLines === 1 ? "" : "s"} excluded` : "", b.capped ? `capped +${m.capPct}%` : ""].filter(Boolean).join(", ");
      if (b.actual != null) rows.push({ label: `${part === "ins" ? "Property insurance" : "Expense"} ${year} budget`, value: money0(b.expense) });
      else rows.push({ label: `Expense (${year} pool${notes ? `, ${notes}` : ""})`, value: money0(b.expense) });
      rows.push({ label: "Applicable GLA", value: b.gla > 0 ? `${b.gla.toLocaleString("en-US")} SF` : "–" });
      rows.push({ label: "Tenant SF", value: `${b.sf.toLocaleString("en-US")} SF` });
      const computed = b.gla > 0 ? (b.sf / b.gla) * 100 : null;
      const stipulated = computed == null || Math.abs(computed - b.prs) >= 0.005;
      rows.push({ label: `Tenant PRS${stipulated ? " (stipulated)" : ""}`, value: `${b.prs.toFixed(2)}%`, color: stipulated ? UP : undefined });
      rows.push({ label: "Tenant est. expense", value: money0(b.share) });
      if (b.adminPct && Math.abs(b.admin) >= 0.5) rows.push({ label: `+ Admin fee ${b.adminPct}%`, value: money0(b.admin) });
      if (b.discountPct && Math.abs(b.year - b.share) >= 0.5) rows.push({ label: `− Discount ${b.discountPct}%`, value: money0(b.year - b.share) });
      if (b.year !== b.share) rows.push({ label: "Tenant's year", value: money0(b.year) });
    }
    const final = w.year ?? b.year;
    if (Math.abs(final - b.year) >= 1 && !w.overridden) rows.push({ label: "After recovery-ratio check", value: money0(final), color: UP });
    return { rows, footer: monthly(final) };
  }
  if (m?.kind === "office" && part === "cam" && m.lines?.length) {
    const over = m.lines.filter((l) => l.over > 0);
    rows.push({ label: "Base year", value: m.noBaseStop ? "None (full NNN)" : m.baseYear ? String(m.baseYear) : "–" });
    for (const l of over.slice(0, 8)) rows.push({ label: `${l.label}${l.fromLine ? "" : " *"}`, value: `${money0(l.budget)} − ${money0(l.base)} = ${money0(l.over)}`, color: UP });
    if (over.length > 8) rows.push({ label: `${over.length - 8} more lines over base`, value: money0(over.slice(8).reduce((a, l) => a + l.over, 0)), color: "var(--muted)" });
    const under = m.lines.length - over.length;
    if (under) rows.push({ label: `${under} line${under === 1 ? "" : "s"} at or under base`, value: "$0", color: "var(--muted)" });
    const tot = over.reduce((a, l) => a + l.over, 0);
    rows.push({ label: `Over base × ${m.proRataPct.toFixed(2)}%`, value: money0((tot * m.proRataPct) / 100) });
    if (m.lines.some((l) => !l.fromLine)) rows.push({ label: "* no budget line — building's Op Ex rate", value: "", color: "var(--muted)" });
    return { rows, footer: monthly(w.year ?? 0) };
  }
  return null;
}

/** The owner's CAM estimate worksheet, in the hover: each line's recon-year
 *  actual, this year's projection and the budget (struck where the tenant is
 *  excluded), then GLA → SF → PRS → tenant expense → admin fee → total. */
function CamWorksheet({ b, year, ry, final }: { b: NonNullable<Extract<NonNullable<EstimateRow["method"]>, { kind: "retail" }>["basis"]>["cam"] & object; year: number; ry: number; final: number }) {
  const lines = b.lines ?? [];
  const num: React.CSSProperties = { textAlign: "right", padding: "1px 0 1px 10px", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
  const lab: React.CSSProperties = { padding: "1px 0", whiteSpace: "nowrap" };
  const head: React.CSSProperties = { ...num, fontSize: "var(--fs-10-5)", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em" };
  const n0 = (v: number | null) => (v == null ? "–" : money0(v));
  const billed = lines.filter((l) => l.billed);
  const tot = (k: "actual" | "budget") => billed.reduce((a, l) => a + l[k], 0);
  const adminEx = lines.filter((l) => l.billed && l.adminExcluded).map((l) => l.label);
  const kv = (label: string, value: string, strong = false, color?: string) => (
    <tr><td style={{ ...lab, fontWeight: strong ? 800 : 400, color: color ?? (strong ? "var(--text)" : "var(--muted)") }}>{label}</td>
      <td style={{ ...num, fontWeight: strong ? 800 : 700, color }}>{value}</td></tr>
  );
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--fs-12)" }}>
      <thead><tr><th style={{ ...head, textAlign: "left", padding: 0 }}>Common area maintenance</th>
        <th style={head}>{year} budget</th></tr></thead>
      <tbody>
        {lines.map((l) => {
          const off: React.CSSProperties = l.billed ? {} : { textDecoration: "line-through", color: "var(--muted)" };
          return (
            <tr key={l.label}>
              <td style={{ ...lab, ...off }}>{l.label}{l.billed && l.adminExcluded ? " †" : ""}{l.from === "ratio" ? " *" : ""}</td>
              <td style={{ ...num, ...off, fontWeight: l.billed ? 700 : 400 }}>{n0(l.budget)}</td>
            </tr>
          );
        })}
        <tr style={{ borderTop: "1px solid var(--border)" }}>
          <td style={{ ...lab, fontWeight: 800 }}>Total</td>
          <td style={{ ...num, fontWeight: 800 }}>{money0(tot("budget"))}</td>
        </tr>
        {b.capped && kv("Controllable CAM capped → pool", money0(b.expense), false, UP)}
        <tr><td colSpan={2} style={{ height: 6 }} /></tr>
        {kv("Center GLA", b.gla > 0 ? `${b.gla.toLocaleString("en-US")} SF` : "–")}
        {kv("Tenant square feet", `${b.sf.toLocaleString("en-US")} SF`)}
        {kv(`Tenant proportional share${b.gla > 0 && Math.abs((b.sf / b.gla) * 100 - b.prs) >= 0.005 ? " (stipulated)" : ""}`, `${b.prs.toFixed(2)}%`)}
        {kv("Tenant CAM expense", money0(b.share))}
        {b.adminPct ? kv(`Administrative fee ${b.adminPct}%${adminEx.length ? ` († excluded — on ${money0(b.adminBase ?? 0)})` : ""}`, money0(b.admin)) : null}
        {kv("Total tenant expense / budget", money0(b.year), true)}
        {Math.abs(final - b.year) >= 1 && kv("After the recovery-ratio check", money0(final), false, UP)}
        {lines.some((l) => l.from === "ratio") && <tr><td colSpan={2} style={{ ...lab, color: "var(--muted)", fontSize: "var(--fs-11)", paddingTop: 4 }}>* no budget line found — grown at the pool&apos;s rate</td></tr>}
      </tbody>
    </table>
  );
}

/** The recon year's own working, for the hover on its column: each
 *  category's pool × the tenant's share (+ admin), the year ÷ 12. */
function reconTip(e: EstimateRow, ry: number): { rows: TipRow[]; footer: TipRow } | null {
  const m = e.method;
  if (m?.kind !== "retail" || !m.reconCalc || !e.recon) return null;
  const c = m.reconCalc;
  // One row per category: the year due and its month.
  const rows: TipRow[] = [];
  if (m.recon.cam) rows.push({ label: `CAM${c.capped ? " · capped" : ""}`, value: `${money0(m.recon.cam)} · ${money0(e.recon.cam)}/mo` });
  if (m.recon.ins) rows.push({ label: "INS", value: `${money0(m.recon.ins)} · ${money0(e.recon.ins)}/mo` });
  if (m.recon.ret) rows.push({ label: c.flatRet != null ? "RET · own parcel" : "RET", value: `${money0(m.recon.ret)} · ${money0(e.recon.ret)}/mo` });
  if (!rows.length) return null;
  return { rows, footer: { label: `${ry} due, a month`, value: money0(e.recon.total) } };
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
        {(() => {
          const body = p !== "total" && e.annual?.[p]
            ? <span className="muted" style={{ fontStyle: "italic", fontSize: "var(--fs-12)", fontWeight: 400, lineHeight: 1.25, display: "inline-block" }}>at recon<br />{money0(e.annual[p]!)} in May</span>
            : <>{v(e.next[p], e.sqft)}</>;
          const tip = p !== "total" ? calcTip(e, p, year, ry) : null;
          return tip ? <HoverCard title={`${e.tenant || "—"} · ${LABEL[p]} ${year}`} width={tip.width ?? 320} rows={tip.rows} body={tip.body} footer={tip.footer}>{body}</HoverCard> : body;
        })()}
      </td>
    );
  };
  return (
    <tr style={e.jump ? { background: "var(--tint-amber-bg, rgba(217,119,6,0.06))" } : undefined}>
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
            ...(diff ? { background: "var(--tint-amber-bg, rgba(217,119,6,0.12))" } : {}) }}>
            {v(n?.[p], e.sqft)}
          </td>
        );
      })}
      <td style={{ ...td, fontWeight: 700 }}>{v(n?.total, e.sqft)}</td>
      {ry != null && <td style={{ ...td, borderLeft: DIVIDE, color: "var(--muted)" }}>{(() => {
        const tip = reconTip(e, ry);
        return tip ? <HoverCard title={`${e.tenant || "—"} · ${ry} reconciliation`} width={330} rows={tip.rows} footer={tip.footer}>{v(e.recon?.total, e.sqft)}</HoverCard> : v(e.recon?.total, e.sqft);
      })()}</td>}
      {nextCell("cam")}{nextCell("ins")}{nextCell("ret")}{nextCell("total")}
      <td style={{ ...td, borderLeft: DIVIDE, fontWeight: 700, color: tone(e.change) }}>{e.jump ? `▲ ${signed(e.change)}` : signed(e.change)}</td>
      <td style={{ ...td, color: tone(e.change) }}>{e.jump ? <Pill tone={TONE_AMBER}>{pctS(e.changePct)}</Pill> : pctS(e.changePct)}</td>
      <td style={{ ...td, textAlign: "left", whiteSpace: "normal", minWidth: 200, maxWidth: 260, fontSize: "var(--fs-12-5)" }}>
        <HoverCard title={`${e.tenant || "—"} · ${e.unitRef} · why`} width={400} rows={whyRows(e, ry, year)}
          footer={{ label: `${year} vs today, a month`, value: `${signed(e.change)} (${pctS(e.changePct)})`, color: tone(e.change) }}>
          <span>{e.reason}</span>
        </HoverCard>
      </td>
    </tr>
  );
}

type BUnit = "annual" | "monthly" | "psf";
type BPart = "cam" | "ins" | "ret";
type BRow = {
  key: string; label: string; part: BPart;
  /** The expense line: the recon year's actual and this budget. */
  priorPool: number | null; pool: number | null;
  /** The tenant's part of it, a year: on this budget, and on the recon year's actual. */
  annual: number; prior: number | null;
  struck?: boolean; note?: string;
};

/** Every expense behind the tenant's computed estimate, as its own row: each
 *  CAM line's slice of the pool at the tenant's share, the admin fee, insurance
 *  and taxes — beside the same line in the recon year, so the change in the
 *  estimate can be explained expense by expense. Both columns add to the
 *  totals (a recovery-ratio trim, or the recon's cap / occupancy, is its own
 *  row). */
function breakdownRows(e: EstimateRow): BRow[] {
  const out: BRow[] = [];
  const m = e.method;
  for (const p of ["cam", "ins", "ret"] as const) {
    const w = e.why.find((x) => x.part === p);
    if (!w) continue;
    const final = w.annual ? w.annual : w.year ?? (w.computed ?? w.next) * (w.months || 12);
    const priorTotal = w.recon != null ? w.recon * 12 : null;
    let sum = 0, priorSum = 0;
    const b = m?.kind === "retail" ? m.basis?.[p] : undefined;
    if (b?.lines?.length) {
      const billed = b.lines.filter((l) => l.billed);
      const tot = billed.reduce((a, l) => a + l.budget, 0);
      const scale = tot > 0 ? b.expense / tot : 0;
      const share = b.prs / 100;
      for (const l of b.lines) {
        const v = l.billed ? l.budget * scale * share : 0;
        const pv = l.billed ? l.actual * share : 0;
        sum += v; priorSum += pv;
        out.push({ key: `${p}:${l.label}`, label: `${l.label}${l.from === "ratio" ? " *" : ""}`, part: p,
          priorPool: l.actual, pool: l.budget, annual: v, prior: pv,
          struck: !l.billed, note: !l.billed ? "Excluded by lease" : undefined });
      }
      if (b.adminPct && (Math.abs(b.admin) >= 0.5)) {
        const priorBase = billed.filter((l) => !l.adminExcluded).reduce((a, l) => a + l.actual, 0);
        const pv = (b.adminPct / 100) * share * priorBase;
        sum += b.admin; priorSum += pv;
        out.push({ key: `${p}:admin`, label: `Administrative fee ${b.adminPct}%`, part: p,
          priorPool: null, pool: null, annual: b.admin, prior: pv,
          note: billed.some((l) => l.adminExcluded) ? "Not charged on every line" : undefined });
      }
      if (b.capped) out.push({ key: `${p}:cap`, label: "Controllable CAM cap", part: p, priorPool: null, pool: b.expense - tot, annual: 0, prior: null, note: "Already taken off each line above" });
    } else if (m?.kind === "office" && p === "cam" && m.lines?.length) {
      for (const l of m.lines) {
        const v = l.over > 0 ? (l.over * m.proRataPct) / 100 : 0;
        sum += v;
        out.push({ key: `${p}:${l.label}`, label: `${l.label}${l.fromLine ? "" : " *"}`, part: p,
          priorPool: null, pool: l.budget, annual: v, prior: null, struck: v === 0,
          note: v === 0 ? `At or under its ${m.baseYear ?? "base-year"} base of ${money0(l.base)}` : `Over its base of ${money0(l.base)} by ${money0(l.over)}` });
      }
      // Office recons are not kept line by line, so last year is one row.
      if (priorTotal != null) {
        out.push({ key: `${p}:prior`, label: "Last reconciliation (not split by line)", part: p, priorPool: null, pool: null, annual: 0, prior: priorTotal });
        priorSum = priorTotal;
      }
    } else if (final || priorTotal) {
      const label = p === "cam" ? "Common area maintenance" : p === "ins" ? "Property insurance" : "Real estate taxes";
      out.push({ key: `${p}:all`, label, part: p, priorPool: b?.actual ?? null, pool: b ? b.expense : null, annual: final, prior: priorTotal,
        note: b?.flat ? "Own parcel — a fixed amount" : w.annual ? "Collected at reconciliation, not monthly" : undefined });
      sum = final; priorSum = priorTotal ?? 0;
    }
    if (Math.abs(final - sum) >= 1) out.push({ key: `${p}:check`, label: `${LABEL[p]} recovery-ratio check`, part: p, priorPool: null, pool: null, annual: final - sum, prior: 0 });
    // What the recon billed beyond its lines at that share: cap, part year, rounding.
    if (priorTotal != null && Math.abs(priorTotal - priorSum) >= 1)
      out.push({ key: `${p}:recon-adj`, label: `${LABEL[p]} cap, occupancy & rounding (last recon)`, part: p, priorPool: null, pool: null, annual: 0, prior: priorTotal - priorSum });
  }
  return out;
}

function EstimateBreakdown({ e, year, ry }: { e: EstimateRow; year: number; ry: number | null }) {
  const [unit, setUnit] = useState<BUnit>("monthly");
  const [order, setOrder] = useState<"change" | "share">(ry != null ? "change" : "share");
  const rows = useMemo(() => breakdownRows(e), [e]);
  const total = rows.reduce((a, r) => a + r.annual, 0);
  if (!rows.length || (Math.abs(total) < 1 && !rows.some((r) => r.prior))) return null;
  const months = (p: BPart) => e.why.find((x) => x.part === p)?.months || 12;
  const conv = (annual: number, p: BPart) =>
    unit === "annual" ? annual : unit === "monthly" ? annual / months(p) : e.sqft > 0 ? annual / e.sqft : 0;
  const fmt = (v: number) => (unit === "psf" ? `$${v.toFixed(2)}` : money0(v));
  const fmtS = (v: number) => (unit === "psf" ? (Math.abs(v) < 0.005 ? "–" : `${v > 0 ? "+" : "−"}$${Math.abs(v).toFixed(2)}`) : signed(v));
  const per = unit === "annual" ? "a year" : unit === "monthly" ? "a month" : "per SF";
  const hasPrior = ry != null && rows.some((r) => r.prior != null);
  const change = (r: BRow) => (r.prior == null ? null : conv(r.annual - r.prior, r.part));
  const quiet = (r: BRow) => r.struck || (Math.abs(r.annual) < 0.5 && Math.abs(r.prior ?? 0) < 0.5);
  const live = rows.filter((r) => !quiet(r)).sort((a, b) =>
    order === "change" ? Math.abs(change(b) ?? 0) - Math.abs(change(a) ?? 0) : b.annual - a.annual);
  const idle = rows.filter(quiet);
  const max = Math.max(...live.map((r) => r.annual), 1);
  const sumBy = (k: "annual" | "prior") => (["cam", "ins", "ret"] as const)
    .reduce((a, p) => a + conv(rows.filter((r) => r.part === p).reduce((s, r) => s + (r[k] ?? 0), 0), p), 0);
  const totNow = sumBy("annual"), totPrior = sumBy("prior"), totChange = totNow - totPrior;
  const overridden = e.why.some((w) => w.overridden);

  // The sentence to read to the tenant: the change, and the three expenses that moved it most.
  const drivers = live.filter((r) => (change(r) ?? 0) * Math.sign(totChange) > 0)
    .sort((a, b) => Math.abs(change(b) ?? 0) - Math.abs(change(a) ?? 0)).slice(0, 3);
  const poolPct = (r: BRow) => (r.priorPool && r.pool != null && r.priorPool > 0 ? ((r.pool - r.priorPool) / r.priorPool) * 100 : null);
  const driverText = (r: BRow) => {
    const pct = poolPct(r);
    const name = r.label.replace(/ \*$/, "");
    return `${name} ${pct != null ? `${pct >= 0 ? "up" : "down"} ${Math.abs(pct).toFixed(0)}% (${fmtS(change(r) ?? 0)})` : fmtS(change(r) ?? 0)}`;
  };

  const line = (r: BRow) => {
    const muted = quiet(r);
    const off: React.CSSProperties = muted ? { color: "var(--muted)" } : {};
    const share = total ? (r.annual / total) * 100 : 0;
    const c = change(r);
    const pct = poolPct(r);
    return (
      <tr key={r.key}>
        <td style={{ ...td, textAlign: "left", whiteSpace: "normal", minWidth: 180, ...off }}>
          <span style={r.struck ? { textDecoration: "line-through" } : undefined}>{r.label}</span>
          <span className="muted" style={{ fontSize: "var(--fs-11)", fontWeight: 700, marginLeft: 6 }}>{LABEL[r.part]}</span>
          {r.note && <div className="muted" style={{ fontSize: "var(--fs-12)" }}>{r.note}</div>}
        </td>
        {hasPrior && <td style={{ ...td, ...off }}>{r.priorPool != null ? money0(r.priorPool) : "–"}</td>}
        <td style={{ ...td, ...off }}>{r.pool != null ? money0(r.pool) : "–"}</td>
        {hasPrior && <td style={{ ...td, color: pct == null ? "var(--muted)" : tone(pct) }}>{pct == null ? "–" : pctS(pct)}</td>}
        <td style={{ ...td, borderLeft: DIVIDE, fontWeight: muted ? 400 : 700, ...off }}>{Math.abs(r.annual) < 0.5 ? "–" : fmt(conv(r.annual, r.part))}</td>
        {hasPrior && <td style={{ ...td, fontWeight: 700, color: c == null ? "var(--muted)" : tone(unit === "psf" ? c * 100 : c) }}>{c == null ? "–" : fmtS(c)}</td>}
        <td style={{ ...td, minWidth: 104, ...off }}>
          {Math.abs(r.annual) >= 0.5 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 44, height: 6, borderRadius: 3, background: "var(--hairline)", overflow: "hidden", display: "inline-block" }}>
                <span style={{ display: "block", height: "100%", width: `${Math.max(0, Math.min(100, (r.annual / max) * 100))}%`, background: "var(--brand)" }} />
              </span>
              {share.toFixed(0)}%
            </span>
          )}
        </td>
      </tr>
    );
  };
  const foot: React.CSSProperties = { ...td, fontWeight: 800, borderTop: "2px solid var(--border)", borderBottom: "none" };
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <span style={secLabel}>What makes up the {year} estimate</span>
        <span style={{ display: "inline-flex", gap: 12, flexWrap: "wrap" }}>
          {hasPrior && <SegChoice<"change" | "share"> label="Sort" options={[{ value: "change", label: "Change" }, { value: "share", label: "Size" }]} value={order} onChange={setOrder} />}
          <SegChoice<BUnit> options={[{ value: "annual", label: "Annual" }, { value: "monthly", label: "Monthly" }, { value: "psf", label: "$/SF" }]} value={unit} onChange={setUnit} />
        </span>
      </div>
      {hasPrior && Math.abs(totChange) >= (unit === "psf" ? 0.005 : 0.5) && (
        <div style={{ fontSize: "var(--fs-14)" }}>
          <b style={{ color: tone(unit === "psf" ? totChange * 100 : totChange) }}>{totChange > 0 ? "Up" : "Down"} {fmt(Math.abs(totChange))} {per}</b> from the {ry} reconciliation
          {drivers.length ? <> — mostly {drivers.map(driverText).join(", ")}.</> : "."}
        </div>
      )}
      <div style={{ maxHeight: 380, overflow: "auto", border: "1px solid var(--border)", borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ position: "sticky", top: 0, background: "var(--card)", zIndex: 1 }}>
            <tr>
              <th style={{ ...th, textAlign: "left" }} />
              <th colSpan={hasPrior ? 3 : 1} style={{ ...th, textAlign: "center", borderBottom: "none" }}>The expense</th>
              <th colSpan={hasPrior ? 3 : 2} style={{ ...th, textAlign: "center", borderBottom: "none", borderLeft: DIVIDE }}>This tenant, {per}</th>
            </tr>
            <tr>
              <th style={{ ...th, textAlign: "left" }}>Expense</th>
              {hasPrior && <th style={th}>{ry} actual</th>}
              <th style={th}>{year} budget</th>
              {hasPrior && <th style={th}>Change</th>}
              <th style={{ ...th, borderLeft: DIVIDE }}>{year}</th>
              {hasPrior && <th style={th}>vs {ry}</th>}
              <th style={th}>Of estimate</th>
            </tr>
          </thead>
          <tbody>
            {live.map(line)}
            {idle.map(line)}
            <tr>
              <td colSpan={hasPrior ? 4 : 2} style={{ ...foot, textAlign: "left" }}>{hasPrior ? `${ry} reconciliation ${fmt(totPrior)} to ${year} estimate` : `${year} estimate (computed)`}</td>
              <td style={{ ...foot, borderLeft: DIVIDE }}>{fmt(totNow)}</td>
              {hasPrior && <td style={{ ...foot, color: tone(unit === "psf" ? totChange * 100 : totChange) }}>{fmtS(totChange)}</td>}
              <td style={foot}>100%</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="muted" style={{ fontSize: "var(--fs-12)" }}>
        A CAM line is the line at the tenant&rsquo;s share ({e.method?.kind === "retail" && e.method.basis?.cam ? `${e.method.basis.cam.prs.toFixed(2)}%` : "PRS"}), the {ry ?? "recon"} column at the same share.
        {unit === "monthly" ? " A month is the year ÷ the months billed, before the $5 rounding." : ""}
        {unit === "psf" ? ` $/SF on ${e.sqft.toLocaleString("en-US")} SF.` : ""}
        {rows.some((r) => r.label.endsWith(" *")) ? " * No budget line found — grown at the pool's rate." : ""}
        {overridden ? " This is the computed estimate; the figure set by hand is in the table above." : ""}
      </div>
    </div>
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
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 120, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", overflowY: "auto" }}>
      <div onClick={(ev) => ev.stopPropagation()} role="dialog" aria-label="Set estimate"
        style={{ background: "var(--card)", borderRadius: 12, width: "100%", maxWidth: 900, boxShadow: "0 20px 60px rgba(0,0,0,0.35)" }}>
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
          <EstimateBreakdown e={e} year={year} ry={ry} />
          <label style={{ display: "grid", gap: 4 }}>
            <span style={secLabel}>Why — what the tenant will be told (required)</span>
            <textarea value={note} onChange={(ev) => setNote(ev.target.value)} rows={3}
              placeholder="e.g. Taxes reassessed on appeal; phase the increase in over two years" />
          </label>
          {err && <div className="small" style={{ color: "var(--c-b91c1c)" }}>{err}</div>}
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

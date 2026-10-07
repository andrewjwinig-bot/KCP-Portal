"use client";

// The Reprojections grid — section cards, subtotal cards and the group
// headings — shared by Reprojections and the T-12 so the two read as one
// document. `labels` names the twelve month columns (a T-12 runs Sep 25 … Aug
// 26 rather than Jan … Dec) and `totalLabel` the year column.

import React from "react";
import { AccountListCard } from "@/app/components/AccountListCard";

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
export const BRAND = "#0b4a7d";
const MONTH_TINT = "rgba(15,23,42,0.035)";
export const ACTUAL_TINT = "rgba(21,128,61,0.10)";
const ACTUAL_EDGE = "2px solid rgba(21,128,61,0.5)";

// line + 12 months + Full Year + Ann Bud + Var = 100%
const COL = { line: 17, month: 5, full: 9, bud: 7, varc: 7 };
// Actuals-only mode drops the Ann Bud + Var columns: line + 12 months + Total.
const COL_ACT = { line: 17, month: 5, full: 23 };

export type Mode = "reproject" | "actuals";
export const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

export type Totals = { actual: number[]; budget: number[]; blended: number[]; reprojTotal: number; budgetTotal: number; variance: number | null };
type Line = { label: string; mask: string } & Totals;
export type Section = { name: string; role: string; lines: Line[]; subtotal: Totals };
export type Reprojection = {
  propertyCode: string; propertyName: string; year: number; actualThroughMonth: number;
  sections: Section[];
  rollups: Record<"totalRevenues" | "totalOperatingExpenses" | "netOperatingIncome" | "capital" | "cashFlowBeforeDebtService" | "totalDebtService" | "cashFlowAfterDebtService", Totals>;
  unbudgetedAccounts: { account: string; actualTotal: number; name?: string | null }[];
};

const isZero = (v: number) => Math.abs(v) < 0.5;
export function money(n: number, psf = false, sqft = 0): string {
  if (psf && sqft > 0) {
    const v = n / sqft;
    if (isZero(v)) return "—";
    return `${v < 0 ? "-" : ""}$${Math.abs(v).toFixed(2)}`;
  }
  if (isZero(n)) return "—";
  return `${n < 0 ? "-" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
}
function fmtVarPct(v: number | null, budget: number): string {
  if (v == null || Math.abs(budget) < 0.5) return "";
  const p = (v / Math.abs(budget)) * 100;
  return `${p > 0 ? "+" : ""}${p.toFixed(1)}%`;
}
export const varColor = (v: number | null) => (v == null ? "var(--muted)" : v >= 0 ? "#15803d" : "#b91c1c");

// ── Budget-matching chrome ───────────────────────────────────────────────────
export function HeaderSelect({ value, onChange, displayLabel, ariaLabel, muted, children }: {
  value: string; onChange: (v: string) => void; displayLabel: string; ariaLabel: string; muted?: boolean; children: React.ReactNode;
}) {
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 6px", borderRadius: 8, cursor: "pointer", maxWidth: "100%", minWidth: 0 }}>
      <span style={{ fontSize: 22, fontWeight: 800, color: muted ? "var(--muted)" : "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{displayLabel}</span>
      <span aria-hidden style={{ fontSize: 11, lineHeight: 1, color: muted ? "var(--muted)" : "var(--text)", opacity: 0.6, flexShrink: 0 }}>▾</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={ariaLabel}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer", border: 0, padding: 0, margin: 0, appearance: "auto", background: "transparent" }}>
        {children}
      </select>
    </span>
  );
}

const segBase: React.CSSProperties = { fontSize: 11, fontWeight: 700, padding: "4px 10px", border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", cursor: "pointer", letterSpacing: "0.04em", textTransform: "uppercase" };
const segActive: React.CSSProperties = { background: BRAND, color: "#fff", borderColor: BRAND };
export function SegToggle({ label, leftLabel, rightLabel, leftActive, onLeft, onRight, disabled }: {
  label: string; leftLabel: string; rightLabel: string; leftActive: boolean; onLeft: () => void; onRight: () => void; disabled?: boolean;
}) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span className="muted small" style={{ fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>{label}</span>
      <div style={{ display: "inline-flex", borderRadius: 6, overflow: "hidden", opacity: disabled ? 0.5 : 1 }}>
        <button type="button" disabled={disabled} onClick={() => !disabled && onLeft()} style={{ ...segBase, borderRadius: "6px 0 0 6px", ...(leftActive ? segActive : {}) }}>{leftLabel}</button>
        <button type="button" disabled={disabled} onClick={() => !disabled && onRight()} style={{ ...segBase, borderLeft: "none", borderRadius: "0 6px 6px 0", ...(leftActive ? {} : segActive) }}>{rightLabel}</button>
      </div>
    </div>
  );
}

export function GroupHeader({ label }: { label: string }) {
  return (
    <div style={{ marginTop: 4, paddingBottom: 6, borderBottom: `2px solid ${BRAND}`, fontSize: 18, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: BRAND }}>{label}</div>
  );
}

export type ViewOpts = { psf: boolean; sqft: number; hideEmpty: boolean; showGL: boolean; through: number; mode: Mode;
  /** The twelve month headings (default Jan…Dec) and the year column's. */
  labels?: readonly string[]; totalLabel?: string;
  /** Every month is an actual (the T-12): no green actual shading. */
  plain?: boolean };

function lineEmpty(t: Totals, mode: Mode): boolean {
  if (mode === "actuals") return isZero(sum(t.actual));
  return isZero(t.reprojTotal) && isZero(t.budgetTotal);
}

export type NoteFor = (lineKey: string) => { note: string; ai: boolean } | null;

/** Open a line's GL transactions — a month (`scope: "month"`, period 1–12) or
 *  the year to date (`scope: "ytd"`, period = the last posted month). The
 *  operating statements' own drill-down; the page owns the modal. */
export type OnDrill = (d: { mask: string; label: string; sign: 1 | -1; period: number; scope: "month" | "ytd"; monthLabel: string }) => void;

export function ReprojTable({ data, view, noteFor, osHref, onDrill }: { data: Reprojection; view: ViewOpts; noteFor: NoteFor; osHref: string; onDrill?: OnDrill }) {
  const r = data.rollups;
  const byRole = (roles: string[]) => data.sections.filter((s) => roles.includes(s.role));
  const revenueSecs = byRole(["revenue", "reimbursement"]);
  const expenseSecs = byRole(["reimbursable-expense", "non-reimbursable-expense", "residential-expense"]);
  const capitalSecs = byRole(["capital"]);
  const debtSecs = byRole(["debt-service"]);
  const groupHasActivity = (secs: Section[]) => secs.some((s) => s.lines.some((l) => !lineEmpty(l, view.mode)) || !lineEmpty(s.subtotal, view.mode));
  const showCapital = capitalSecs.length > 0 && (!view.hideEmpty || groupHasActivity(capitalSecs));
  const showDebt = debtSecs.length > 0 && (!view.hideEmpty || groupHasActivity(debtSecs));

  return (
    <>
      <GroupHeader label="Revenues" />
      {revenueSecs.map((s) => <SectionCard key={s.name} sec={s} view={view} noteFor={noteFor} osHref={osHref} onDrill={onDrill} />)}
      <SubtotalCard label="Total Revenues" t={r.totalRevenues} view={view} />

      <GroupHeader label="Operating Expenses" />
      {expenseSecs.map((s) => <SectionCard key={s.name} sec={s} view={view} noteFor={noteFor} osHref={osHref} onDrill={onDrill} />)}
      <SubtotalCard label="Total Operating Expenses" t={r.totalOperatingExpenses} view={view} />
      <SubtotalCard label="Net Operating Income" t={r.netOperatingIncome} view={view} strong />

      {showCapital && <GroupHeader label="Capital Improvements" />}
      {showCapital && capitalSecs.map((s) => <SectionCard key={s.name} sec={s} view={view} noteFor={noteFor} osHref={osHref} onDrill={onDrill} hideSubtotal />)}
      {showDebt ? (
        <>
          <SubtotalCard label="Cash Flow Before Debt Service" t={r.cashFlowBeforeDebtService} view={view} strong />
          <GroupHeader label="Debt Service" />
          {debtSecs.map((s) => <SectionCard key={s.name} sec={s} view={view} noteFor={noteFor} osHref={osHref} onDrill={onDrill} />)}
          <SubtotalCard label="Total Debt Service" t={r.totalDebtService} view={view} />
          <SubtotalCard label="Cash Flow After Debt Service" t={r.cashFlowAfterDebtService} view={view} strong />
        </>
      ) : (
        <SubtotalCard label="Cash Flow" t={r.cashFlowBeforeDebtService} view={view} strong />
      )}

      {data.unbudgetedAccounts.length > 0 && (
        <AccountListCard
          title="Unbudgeted Actuals — not in any reprojection line"
          description="GL accounts with activity that don't map to a budget/statement line — surfaced so the full-year reprojection isn't silently short."
          accent="#b45309"
          rows={data.unbudgetedAccounts.map((r) => ({ account: r.account, name: r.name, amount: r.actualTotal }))}
          format={(n) => money(n)}
        />
      )}
    </>
  );
}

function Colgroup({ through, mode, plain }: { through: number; mode: Mode; plain?: boolean }) {
  const actuals = mode === "actuals";
  return (
    <colgroup>
      <col style={{ width: `${(actuals ? COL_ACT : COL).line}%` }} />
      {MONTHS.map((m, i) => (
        <col key={m} style={{ width: `${(actuals ? COL_ACT : COL).month}%`, background: plain ? (i % 2 === 0 ? MONTH_TINT : undefined) : i < through ? ACTUAL_TINT : actuals ? undefined : i % 2 === 0 ? MONTH_TINT : undefined }} />
      ))}
      <col style={{ width: `${(actuals ? COL_ACT : COL).full}%` }} />
      {!actuals && <col style={{ width: `${COL.bud}%` }} />}
      {!actuals && <col style={{ width: `${COL.varc}%` }} />}
    </colgroup>
  );
}

const td: React.CSSProperties = { textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 12.5 };

function figureCells(t: Totals, view: ViewOpts, opts: { bold?: boolean; color?: string; drill?: (period: number, scope: "month" | "ytd") => void } = {}) {
  const { psf, sqft, through, mode } = view;
  const actuals = mode === "actuals";
  // Actuals mode shows the real per-month figure and a Full Year = sum of
  // actuals; only imported months carry a value (later months read blank).
  const cells = actuals ? t.actual : t.blended;
  const totalVal = actuals ? sum(t.actual) : t.reprojTotal;
  // Only a POSTED month has GL behind it; a budget month has nothing to open.
  const click = (i: number) => (opts.drill && i < through && Math.abs(t.actual[i] ?? 0) >= 0.5
    ? { onClick: () => opts.drill!(i + 1, "month"), className: "os-cell", title: "Click for GL transactions" } : {});
  const totalClick = opts.drill && through > 0 && Math.abs(sum(t.actual.slice(0, through))) >= 0.5
    ? { onClick: () => opts.drill!(through, "ytd"), className: "os-cell", title: "Click for the year-to-date GL transactions" } : {};
  return (
    <>
      {cells.map((v, i) => (
        <td key={i} {...click(i)} style={{
          ...td,
          fontWeight: opts.bold ? 800 : undefined,
          borderLeft: i === through && through > 0 ? ACTUAL_EDGE : undefined,
          color: opts.color ?? (v < 0 ? "#b91c1c" : i < through ? "var(--text)" : "var(--muted)"),
        }}>{actuals && i >= through ? "" : money(v, psf, sqft)}</td>
      ))}
      <td {...totalClick} style={{ ...td, borderLeft: "1px solid var(--border)", fontSize: opts.bold ? 14 : 13, fontWeight: 900, color: opts.color ?? BRAND }}>{money(totalVal, psf, sqft)}</td>
      {!actuals && <td style={{ ...td, fontWeight: opts.bold ? 800 : undefined, color: opts.color ?? "var(--muted)" }}>{money(t.budgetTotal, psf, sqft)}</td>}
      {!actuals && (
        <td style={{ ...td, fontWeight: 800, color: opts.color ?? varColor(t.variance) }} title={fmtVarPct(t.variance, t.budgetTotal)}>
          {t.variance == null ? "—" : money(t.variance, psf, sqft)}
        </td>
      )}
    </>
  );
}

function HeaderRow({ through, mode, labels, totalLabel }: { through: number; mode: Mode; labels?: readonly string[]; totalLabel?: string }) {
  const actuals = mode === "actuals";
  return (
    <tr>
      <th>Line</th>
      {(labels ?? MONTHS).map((m, i) => (
        <th key={i} style={{ textAlign: "right", borderLeft: i === through && through > 0 ? ACTUAL_EDGE : undefined }}>{m}</th>
      ))}
      <th style={{ textAlign: "right", borderLeft: "1px solid var(--border)", color: BRAND }}>{totalLabel ?? "Full Year"}</th>
      {!actuals && <th style={{ textAlign: "right" }}>Ann Bud</th>}
      {!actuals && <th style={{ textAlign: "right" }}>Var</th>}
    </tr>
  );
}

function SectionCard({ sec, view, noteFor, osHref, hideSubtotal, onDrill }: { sec: Section; view: ViewOpts; noteFor: NoteFor; osHref: string; hideSubtotal?: boolean; onDrill?: OnDrill }) {
  // Revenue is stored as a credit, so its GL rows read positive with sign −1 —
  // the operating statement's own rule.
  const sign: 1 | -1 = sec.role === "revenue" || sec.role === "reimbursement" ? -1 : 1;
  const lines = view.hideEmpty ? sec.lines.filter((l) => !lineEmpty(l, view.mode)) : sec.lines;
  if (lines.length === 0 && view.hideEmpty) return null;
  return (
    <div className="card" style={{ padding: 0 }}>
      <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", background: "rgba(15,23,42,0.03)", fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase" }}>{sec.name}</div>
      <div className="tableWrap">
        <table style={{ tableLayout: "fixed", width: "100%", minWidth: 1180 }}>
          <Colgroup through={view.through} mode={view.mode} plain={view.plain} />
          <thead><HeaderRow through={view.through} mode={view.mode} labels={view.labels} totalLabel={view.totalLabel} /></thead>
          <tbody>
            {lines.map((l) => {
              const n = noteFor(`${sec.name}::${l.label}`);
              return (
              <tr key={l.label}>
                <td style={{ textAlign: "left" }}>
                  {l.label}
                  {n && (
                    <a href={osHref} title={`${n.ai ? "✨ AI note — " : ""}${n.note}\n\n(click → Operating Statements)`}
                      aria-label="Variance note" style={{ marginLeft: 6, textDecoration: "none", cursor: "pointer" }}>
                      {n.ai ? "✨" : "📝"}
                    </a>
                  )}
                  {view.showGL && <div className="muted" style={{ fontSize: 10.5, fontVariantNumeric: "tabular-nums", marginTop: 1 }}>{l.mask}</div>}
                </td>
                {figureCells(l, view, onDrill ? { drill: (period, scope) => onDrill({ mask: l.mask, label: l.label, sign, period, scope, monthLabel: MONTHS[period - 1] }) } : {})}
              </tr>
            );})}
            {!hideSubtotal && (
              <tr style={{ background: "rgba(11,74,125,0.06)" }}>
                <td style={{ fontWeight: 900, letterSpacing: "0.04em", textTransform: "uppercase", color: BRAND, fontSize: 12.5 }}>{sec.role === "revenue" ? "Total Revenue and Other" : `Total ${sec.name}`}</td>
                {figureCells(sec.subtotal, view, { bold: true, color: BRAND })}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SubtotalCard({ label, t, view, strong }: { label: string; t: Totals; view: ViewOpts; strong?: boolean }) {
  return (
    <div className="card" style={{ padding: 0, borderColor: BRAND, background: strong ? "rgba(11,74,125,0.06)" : "rgba(11,74,125,0.04)" }}>
      <div className="tableWrap" style={{ marginTop: 0 }}>
        <table style={{ tableLayout: "fixed", width: "100%", minWidth: 1180 }}>
          <Colgroup through={view.through} mode={view.mode} plain={view.plain} />
          <tbody>
            <tr style={{ fontWeight: 800 }}>
              <td style={{ fontSize: strong ? 14 : 13, fontWeight: 900, letterSpacing: "0.04em", textTransform: "uppercase", color: BRAND, verticalAlign: "middle", borderBottom: "none" }}>{label}</td>
              {figureCells(t, view, { bold: true, color: BRAND })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}


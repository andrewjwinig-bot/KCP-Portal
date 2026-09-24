"use client";

// A budget line's history MONTH BY MONTH — the budget being set, this year's
// reprojection, this year's budget, then each prior year's actuals and their
// average — so seasonality and one-off spikes are read where they happen
// rather than flattened into an annual average. Every actual cell opens that
// month's GL (the operating statements' own drill-down), so "what was that
// March?" is one click.

import { useState } from "react";
import { LineDetailModal } from "@/app/financials/operating-statements/LineDetailModal";
import { Pill, TONE_NEUTRAL, type PillTone } from "@/app/components/Pill";
import { HoverCard } from "@/app/components/HoverCard";
import { CellInput } from "./BudgetStatementTable";
import type { LineYear } from "@/lib/financials/budgets/lineHistory";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const money0 = (n: number) => (Math.abs(n) < 0.5 ? "–" : (n < 0 ? "-" : "") + Math.abs(Math.round(n)).toLocaleString("en-US"));
const sum = (a: number[]) => a.reduce((s, n) => s + (n || 0), 0);
const MONTH_TINT = "rgba(15,23,42,0.035)";
const head: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", padding: "8px 6px", textAlign: "right", whiteSpace: "nowrap", borderBottom: "1px solid var(--border)" };
const cell: React.CSSProperties = { padding: "8px 6px", fontSize: 13.5, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", borderBottom: "1px solid var(--border)" };
const lab: React.CSSProperties = { ...cell, textAlign: "left", fontSize: 14, fontWeight: 600 };

type Row = {
  key: string; label: string; months: (number | null)[];
  /** The GL year behind each cell, when it can be opened. */
  glYear?: number;
  /** The year's GL was imported monthly totals only — no transactions to open. */
  totalsOnly?: "lean" | "partial";
  /** Cells that are the year's budget rather than its actual (a reprojection's tail). */
  projectedFrom?: number;
  tone?: "budget" | "draft" | "avg";
};

export function HistoryMonthly({ years, budgetYear, draftMonths, draftTyped, badge, onEdit, viewKey, propertyCode, label, mask, sign }: {
  years: LineYear[]; budgetYear: number; draftMonths: number[] | null;
  /** The draft's typed months — tinted, as in the grid. */
  draftTyped?: boolean[];
  /** The line's source pill ("+3%", "Tax +3%"…) — shown only while nothing on
   *  the line is typed, so it never claims a basis the figures left behind. */
  badge?: { tone: PillTone; text: string } | null;
  /** Present when this viewer may type the line: a month, or "all" to spread
   *  an annual typed into the Total — the grid's own save. */
  onEdit?: (month: number | "all", value: number | null) => void;
  viewKey: string; propertyCode: string; label: string; mask: string; sign: 1 | -1;
}) {
  const [open, setOpen] = useState<{ year: number; period: number; scope: "month" | "ytd" } | null>(null);
  // The 2027 Budget cell open for typing (12 = the Total).
  const [editAt, setEditAt] = useState<number | null>(null);
  const showBadge = !!badge && !(draftTyped ?? []).some(Boolean);
  const basis = years.find((y) => y.year === budgetYear - 1);
  const prior = years.filter((y) => y.year < budgetYear - 1 && y.months).sort((a, b) => b.year - a.year);
  const complete = prior.filter((y) => y.monthsCovered >= 12);

  const rows: Row[] = [];
  if (draftMonths) rows.push({ key: "draft", label: `${budgetYear} Budget`, months: draftMonths, tone: "draft" });
  if (basis) {
    // The reprojection: what has posted so far, then the budget for the rest.
    const covered = basis.months ? basis.monthsCovered : 0;
    const reproj = MONTHS.map((_, i) => (i < covered ? basis.months?.[i] ?? 0 : basis.budgetMonths?.[i] ?? null));
    rows.push({ key: "reproj", label: `${basis.year} Reproj.`, months: reproj, glYear: covered > 0 ? basis.year : undefined, projectedFrom: covered });
    if (basis.budgetMonths) rows.push({ key: "bud", label: `${basis.year} Budget`, months: basis.budgetMonths, tone: "budget" });
  }
  for (const y of prior) rows.push({ key: `a${y.year}`, label: `${y.year} Actual${y.monthsCovered < 12 ? ` (${y.monthsCovered} mo)` : ""}`, months: y.months!, glYear: y.year,
    totalsOnly: y.detail === "lean" || y.detail === "partial" ? y.detail : undefined });
  if (complete.length >= 2) {
    rows.push({ key: "avg", label: `${complete.length}-yr average`, tone: "avg",
      months: MONTHS.map((_, i) => complete.reduce((s, y) => s + (y.months?.[i] ?? 0), 0) / complete.length) });
  }

  return (
    <>
      <div style={{ overflowX: "auto", marginTop: 14, border: "1px solid var(--border)", borderRadius: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 960, tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "14%" }} />
            {MONTHS.map((m, i) => <col key={m} style={{ width: "6.35%", ...(i % 2 === 0 ? { background: MONTH_TINT } : {}) }} />)}
            <col style={{ width: "9.8%" }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ ...head, textAlign: "left" }} />
              {MONTHS.map((m) => <th key={m} style={head}>{m}</th>)}
              <th style={head}>Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const total = sum(r.months.map((v) => v ?? 0));
              const rowStyle: React.CSSProperties = r.tone === "draft" ? { background: "rgba(22,163,74,0.08)" } : r.tone === "avg" ? { background: "rgba(11,74,125,0.05)" } : {};
              const labelColor = r.tone === "draft" ? "#15803d" : r.tone === "avg" ? "var(--brand)" : r.tone === "budget" ? "var(--muted)" : "var(--text)";
              return (
                <tr key={r.key} style={{ ...rowStyle, ...(r.tone === "avg" ? { borderTop: "2px solid rgba(11,74,125,0.3)" } : {}) }}>
                  <td style={{ ...lab, color: labelColor, fontWeight: r.tone ? 700 : 600 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      {r.label}
                      {r.tone === "draft" && showBadge && <Pill tone={badge!.tone}>{badge!.text}</Pill>}
                      {r.totalsOnly && (
                        <HoverCard title={`${r.glYear} — totals only`} width={300} rows={[]}
                          footer={{ label: "No GL detail", value: `${r.totalsOnly === "partial" ? "Part of this year's" : "This year's"} GL was imported "monthly totals only". Re-upload it on Operating Statements with that box unticked to drill into the transactions.` }}>
                          <Pill tone={TONE_NEUTRAL}>TOTALS ONLY</Pill>
                        </HoverCard>
                      )}
                    </span>
                  </td>
                  {r.months.map((v, i) => {
                    if (r.tone === "draft" && onEdit) {
                      const typed = !!draftTyped?.[i];
                      return (
                        <td key={i} className="os-cell" onClick={editAt !== i ? () => setEditAt(i) : undefined}
                          style={{ ...cell, cursor: "text", fontWeight: 700, background: "var(--input-cell)", ...(typed ? { color: "var(--input-typed)", fontWeight: 800 } : {}), ...(editAt === i ? { padding: "2px 3px" } : {}) }}>
                          {editAt === i ? (
                            <CellInput initial={v ?? 0} onDone={(val, move) => {
                              const changed = val === null ? typed : val !== undefined && Math.round(val) !== Math.round(v ?? 0);
                              if (changed) onEdit(i, val as number | null);
                              const next = i + move;
                              setEditAt(move !== 0 && next >= 0 && next <= 11 ? next : null);
                            }} />
                          ) : money0(v ?? 0)}
                        </td>
                      );
                    }
                    const projected = r.projectedFrom != null && i >= r.projectedFrom;
                    const canOpen = r.glYear != null && !projected && v != null;
                    return (
                      <td key={i} className={canOpen ? "os-cell" : undefined}
                        onClick={canOpen ? () => setOpen({ year: r.glYear!, period: i + 1, scope: "month" }) : undefined}
                        style={{ ...cell, cursor: canOpen ? "pointer" : undefined, fontWeight: r.tone === "draft" ? 700 : 400,
                          color: r.tone === "budget" || projected ? "var(--muted)" : undefined, fontStyle: projected ? "italic" : undefined }}>
                        {v == null ? "" : money0(v)}
                      </td>
                    );
                  })}
                  {r.tone === "draft" && onEdit ? (
                    <td className="os-cell" onClick={editAt !== 12 ? () => setEditAt(12) : undefined}
                      style={{ ...cell, fontWeight: 800, color: "#15803d", cursor: "text", background: "var(--input-cell)", ...(editAt === 12 ? { padding: "2px 3px" } : {}) }}>
                      {editAt === 12 ? (
                        <CellInput initial={total} onDone={(val) => {
                          if (val != null && Math.round(val) !== Math.round(total)) onEdit("all", val);
                          setEditAt(null);
                        }} />
                      ) : money0(total)}
                    </td>
                  ) : (
                  <td className={r.glYear != null ? "os-cell" : undefined}
                    onClick={r.glYear != null ? () => setOpen({ year: r.glYear!, period: r.projectedFrom != null ? Math.max(1, r.projectedFrom) : 12, scope: "ytd" }) : undefined}
                    style={{ ...cell, fontWeight: 800, cursor: r.glYear != null ? "pointer" : undefined, color: r.tone === "draft" ? "#15803d" : undefined }}>
                    {money0(total)}
                  </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="muted small" style={{ marginTop: 6 }}>
        {onEdit ? <>Type into the {budgetYear} Budget row — a month, or the Total to spread it evenly. </> : null}Click any actual month to see its GL — every charge that made it up. <i>Italics</i> in the reprojection are this year&rsquo;s budget for the months not yet posted.
      </div>
      {open && (
        <LineDetailModal viewKey={viewKey} property={propertyCode} year={open.year} period={open.period}
          monthLabel={MONTHS_LONG[open.period - 1]} line={{ mask, label, sign }} initialTab="gl" initialScope={open.scope}
          onClose={() => setOpen(null)} />
      )}
    </>
  );
}

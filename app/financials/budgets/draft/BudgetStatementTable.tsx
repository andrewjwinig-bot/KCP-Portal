"use client";

// The draft budget, laid out as a FULL-YEAR OPERATING STATEMENT.
//
// A budget is read the way the statement it will be measured against is read:
// the same Revenues / Operating Expenses / NOI / Capital / Debt Service ladder,
// a column for every month, then the year. So this deliberately copies the
// operating statement's Full-Year grid (`FullYearTable` in
// app/financials/operating-statements/page.tsx) — the same header metrics,
// section bands, subtotal and rollup rows — rather than a card per section
// showing one annual figure, which hid the monthly shape the budget is made of
// (a tax bill in May and November, a premium in March, snow in winter).
//
// Beside the year: this year's forecast (what it is grown from) and the change,
// so every line is read against where it is coming from. Each line carries the
// small pill saying WHERE its months came from — leases, a figure someone
// entered, the recovery estimate, or the default — and clicking it opens the
// line's trailing years.

import { Fragment } from "react";
import { Pill, type PillTone } from "@/app/components/Pill";
import type { BudgetDraft, BudgetDraftSection } from "@/lib/financials/budgets/draft";
import type { SectionRole } from "@/lib/financials/operating-statements/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const COLOR_BRAND = "#0b4a7d";
const GROUP_DIV = "1px solid var(--border)";
const num: React.CSSProperties = { textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 13, padding: "6px 8px", whiteSpace: "nowrap", verticalAlign: "middle" };
const lab: React.CSSProperties = { textAlign: "left", fontSize: 13, padding: "6px 10px", verticalAlign: "middle" };
const head: React.CSSProperties = { fontSize: 11, fontWeight: 800, color: "var(--muted)", padding: "6px 8px", whiteSpace: "nowrap", textAlign: "right", verticalAlign: "bottom" };

const money0 = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const sum = (a: number[]) => a.reduce((s, n) => s + (n || 0), 0);
const addInto = (acc: number[], xs: number[]) => { for (let i = 0; i < 12; i++) acc[i] += xs[i] || 0; };

type Variant = "line" | "subtotal" | "rollup" | "rollupStrong";

function Row({ label, months, total, basis, variant = "line", badge, onClick, favorableUp }: {
  label: string; months: number[]; total: number; basis: number | null; variant?: Variant;
  badge?: { tone: PillTone; text: string }; onClick?: () => void;
  /** Revenue-like: up is good. Expense-like: down is good. */
  favorableUp: boolean;
}) {
  const bold = variant !== "line";
  const upper = variant === "rollup" || variant === "rollupStrong";
  const rowStyle: React.CSSProperties | undefined =
    variant === "subtotal" ? { background: "rgba(11,74,125,0.06)", borderTop: "2px solid rgba(11,74,125,0.30)" }
    : variant === "rollupStrong" ? { background: "rgba(11,74,125,0.06)" }
    : variant === "rollup" ? { background: "rgba(11,74,125,0.035)" }
    : undefined;
  const cell = (v: number, key: string | number, extra?: React.CSSProperties) => (
    <td key={key} style={{ ...num, ...(bold ? { fontWeight: 800 } : {}), ...extra }}>
      {Math.abs(v) < 0.5 ? <span style={{ color: "var(--muted)" }}>–</span> : money0(v)}
    </td>
  );
  const change = basis == null ? null : total - basis;
  const pct = change == null || Math.abs(basis ?? 0) < 0.5 ? null : (change / Math.abs(basis!)) * 100;
  const good = change == null || Math.abs(change) < 0.5 ? null : (change > 0) === favorableUp;
  return (
    <tr style={{ ...rowStyle, ...(onClick ? { cursor: "pointer" } : {}) }} className={onClick ? "os-cell" : undefined} onClick={onClick}>
      <td style={{ ...lab, ...(bold ? { fontWeight: 800, color: COLOR_BRAND } : {}), ...(upper ? { textTransform: "uppercase", letterSpacing: "0.04em" } : {}), minWidth: 210 }}>
        {label}
        {badge && <div style={{ marginTop: 2 }}><Pill tone={badge.tone}>{badge.text}</Pill></div>}
      </td>
      {months.map((m, i) => cell(m, i, i === 0 ? { borderLeft: GROUP_DIV } : undefined))}
      {cell(total, "t", { borderLeft: GROUP_DIV, color: COLOR_BRAND, fontWeight: 800 })}
      {basis == null ? <td style={num} /> : cell(basis, "b", { color: "var(--muted)" })}
      <td style={{ ...num, ...(bold ? { fontWeight: 800 } : {}), color: good == null ? "var(--muted)" : good ? "#15803d" : "#b91c1c" }}>
        {pct == null ? (change == null || Math.abs(change) < 0.5 ? "–" : money0(change)) : `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`}
      </td>
    </tr>
  );
}

export function BudgetStatementTable({ draft, badgeFor, onLine }: {
  draft: BudgetDraft;
  badgeFor: (source: BudgetDraft["sections"][number]["lines"][number]["source"]) => { tone: PillTone; text: string };
  onLine: (sec: BudgetDraftSection, line: BudgetDraftSection["lines"][number]) => void;
}) {
  const byRole = (roles: SectionRole[]) => draft.sections.filter((s) => roles.includes(s.role));
  const revenue = byRole(["revenue", "reimbursement"]);
  const expense = byRole(["reimbursable-expense", "non-reimbursable-expense", "residential-expense"]);
  const capital = byRole(["capital"]);
  const debt = byRole(["debt-service"]);
  const yy = String(draft.budgetYear).slice(2);
  const by = String(draft.basisYear).slice(2);
  const cols = 1 + 12 + 3;

  const basisOf = (secs: BudgetDraftSection[]) => secs.reduce((s, sec) => s + sum(sec.lines.map((l) => l.basisTotal)), 0);
  const monthsOf = (secs: BudgetDraftSection[]) => { const m = new Array(12).fill(0); for (const s of secs) addInto(m, s.subtotal); return m; };
  const r = draft.rollups;
  const capM = monthsOf(capital), debtM = monthsOf(debt);
  const cfbM = r.netOperatingIncome.months.map((v, i) => v - capM[i]);
  const cfaM = cfbM.map((v, i) => v - debtM[i]);
  const noiBasis = basisOf(revenue) - basisOf(expense);

  const group = (label: string) => (
    <tr key={`g-${label}`}>
      <td colSpan={cols} style={{ padding: "12px 12px 6px", borderBottom: `2px solid ${COLOR_BRAND}`, fontSize: 14, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: COLOR_BRAND }}>{label}</td>
    </tr>
  );
  const section = (sec: BudgetDraftSection, favorableUp: boolean, subtotal = true) => (
    <Fragment key={sec.name}>
      <tr>
        <td colSpan={cols} style={{ padding: "8px 12px", background: "rgba(15,23,42,0.03)", fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase" }}>{sec.name}</td>
      </tr>
      {sec.lines.map((l) => (
        <Row key={l.label + l.mask} label={l.label} months={l.months} total={l.total} basis={l.basisTotal}
          badge={badgeFor(l.source)} onClick={() => onLine(sec, l)} favorableUp={favorableUp} />
      ))}
      {subtotal && <Row label={`Total ${sec.name}`} months={sec.subtotal} total={sec.total} basis={sum(sec.lines.map((l) => l.basisTotal))} variant="subtotal" favorableUp={favorableUp} />}
    </Fragment>
  );

  const body: React.ReactNode[] = [];
  body.push(group("Revenues"));
  revenue.forEach((s) => body.push(section(s, true)));
  body.push(<Row key="tr" label="Total Revenues" months={r.totalRevenues.months} total={r.totalRevenues.total} basis={basisOf(revenue)} variant="rollup" favorableUp />);
  body.push(group("Operating Expenses"));
  expense.forEach((s) => body.push(section(s, false)));
  body.push(<Row key="te" label="Total Operating Expenses" months={r.totalOperatingExpenses.months} total={r.totalOperatingExpenses.total} basis={basisOf(expense)} variant="rollup" favorableUp={false} />);
  body.push(<Row key="noi" label="Net Operating Income" months={r.netOperatingIncome.months} total={r.netOperatingIncome.total} basis={noiBasis} variant="rollupStrong" favorableUp />);
  if (capital.length) {
    body.push(group("Capital"));
    capital.forEach((s) => body.push(section(s, false, false)));
  }
  if (debt.length) {
    body.push(<Row key="cfb" label="Cash Flow Before Debt Service" months={cfbM} total={sum(cfbM)} basis={noiBasis - basisOf(capital)} variant="rollupStrong" favorableUp />);
    body.push(group("Debt Service"));
    debt.forEach((s) => body.push(section(s, false)));
    body.push(<Row key="cfa" label="Cash Flow After Debt Service" months={cfaM} total={sum(cfaM)} basis={noiBasis - basisOf(capital) - basisOf(debt)} variant="rollupStrong" favorableUp />);
  } else {
    body.push(<Row key="cf" label="Cash Flow" months={cfbM} total={sum(cfbM)} basis={noiBasis - basisOf(capital)} variant="rollupStrong" favorableUp />);
  }

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div className="tableWrap" style={{ marginTop: 0 }}>
        <table style={{ width: "100%", minWidth: 320 + 15 * 76, borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...head, textAlign: "left" }}>Line</th>
              {MONTHS.map((m, i) => <th key={m} style={{ ...head, ...(i === 0 ? { borderLeft: GROUP_DIV } : {}) }}>{m} {yy}</th>)}
              <th style={{ ...head, borderLeft: GROUP_DIV, color: COLOR_BRAND }}>Budget {yy}</th>
              <th style={head}>Forecast {by}</th>
              <th style={head}>Change</th>
            </tr>
          </thead>
          <tbody>{body}</tbody>
        </table>
      </div>
      <div className="muted small" style={{ padding: "10px 14px", borderTop: "1px solid var(--border)" }}>
        <b>Forecast {by}</b> is this year&rsquo;s actuals to date plus budget for the rest — what each line is built from. Click any line for its trailing years.
      </div>
    </div>
  );
}

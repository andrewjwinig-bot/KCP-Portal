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
// entered, the recovery estimate, or the default — and clicking its NAME opens
// the line's trailing years.
//
// Every month is TYPEABLE (for Drew / admin): click a cell, type, Tab to the
// next month. A typed month replaces only that month and is tinted so it reads
// as a decision rather than a computation; clearing it hands the month back to
// the computed figure. Typing into the Budget column spreads an annual evenly.
// The three Budget Inputs lines (taxes, insurance, building maintenance) are
// NOT typeable here — their owners key them on /budget-inputs, and two places
// to set one figure is how they would disagree. Nor are the CAM / INS / RET
// recovery lines: they are Step 3's tenant totals, and a typed month would
// break the tie to the tenants and their methodology. Nor is rent, or the TI
// and commissions the deals carry — those are Step 1's leases and decisions.

import { Fragment, useRef, useState } from "react";
import { Pill, type PillTone } from "@/app/components/Pill";
import type { BudgetDraft, BudgetDraftSection } from "@/lib/financials/budgets/draft";
import type { SectionRole } from "@/lib/financials/operating-statements/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const COLOR_BRAND = "#0b4a7d";
const GROUP_DIV = "1px solid var(--border)";
const num: React.CSSProperties = { textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 13, padding: "5px 8px", whiteSpace: "nowrap", verticalAlign: "middle" };
const lab: React.CSSProperties = { textAlign: "left", fontSize: 13, padding: "5px 10px", verticalAlign: "middle" };
const head: React.CSSProperties = { fontSize: 11, fontWeight: 800, color: "var(--muted)", padding: "6px 8px", whiteSpace: "nowrap", textAlign: "right", verticalAlign: "bottom" };

const money0 = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const sum = (a: number[]) => a.reduce((s, n) => s + (n || 0), 0);
const addInto = (acc: number[], xs: number[]) => { for (let i = 0; i < 12; i++) acc[i] += xs[i] || 0; };

type Variant = "line" | "sub" | "subtotal" | "rollup" | "rollupStrong";
type Line = BudgetDraftSection["lines"][number];
/** Which cell is open for typing: a line key and a month (12 = the Budget column). */
type EditAt = { row: string; m: number } | null;
const TYPED_BG = "rgba(11,74,125,0.09)";

/** "$1,200", "1200", "(1,200)", "-1200" → a number; blank → null. */
function parseTyped(s: string): number | null | undefined {
  const t = s.trim();
  if (!t) return null;
  const neg = /^\(.*\)$/.test(t) || t.startsWith("-");
  const n = Number(t.replace(/[\s$,()]/g, "").replace(/^-/, ""));
  if (!Number.isFinite(n)) return undefined;
  return neg ? -n : n;
}

function CellInput({ initial, onDone }: { initial: number; onDone: (v: number | null | undefined, move: 0 | 1 | -1) => void }) {
  const [v, setV] = useState(String(Math.round(initial)));
  // Tab/Enter finish the cell and unmount it; a blur on the way out must not
  // commit it a second time.
  const done = useRef(false);
  const finish = (val: number | null | undefined, move: 0 | 1 | -1) => {
    if (done.current) return;
    done.current = true;
    onDone(val, move);
  };
  return (
    <input autoFocus value={v} inputMode="decimal"
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => finish(parseTyped(v), 0)}
      onKeyDown={(e) => {
        if (e.key === "Escape") { e.preventDefault(); finish(undefined, 0); }
        else if (e.key === "Enter") { e.preventDefault(); finish(parseTyped(v), 0); }
        else if (e.key === "Tab") { e.preventDefault(); finish(parseTyped(v), e.shiftKey ? -1 : 1); }
      }}
      style={{ width: "100%", minWidth: 64, textAlign: "right" }} />
  );
}

function Row({ label, months, total, basis, variant = "line", badge, onLabel, favorableUp, typed, rowKey, edit, setEdit, onCommit, onReset, badgeHref, toggle }: {
  label: string; months: number[]; total: number; basis: number | null; variant?: Variant;
  badge?: { tone: PillTone; text: string }; onLabel?: () => void;
  /** Revenue-like: up is good. Expense-like: down is good. */
  favorableUp: boolean;
  typed?: boolean[];
  /** Set when the row's months can be typed. */
  rowKey?: string; edit?: EditAt; setEdit?: (e: EditAt) => void;
  onCommit?: (m: number | "all", v: number | null) => void;
  onReset?: () => void;
  badgeHref?: string;
  /** A line with sub-lines carries a disclosure to open them. */
  toggle?: { open: boolean; onToggle: () => void };
}) {
  const sub = variant === "sub";
  const bold = variant !== "line" && !sub;
  const upper = variant === "rollup" || variant === "rollupStrong";
  const rowStyle: React.CSSProperties | undefined =
    variant === "subtotal" ? { background: "rgba(11,74,125,0.06)", borderTop: "2px solid rgba(11,74,125,0.30)" }
    : variant === "rollupStrong" ? { background: "rgba(11,74,125,0.06)" }
    : variant === "rollup" ? { background: "rgba(11,74,125,0.035)" }
    : undefined;
  const editable = !!rowKey && !!setEdit && !!onCommit;
  const cell = (v: number, key: string | number, extra?: React.CSSProperties, m?: number) => {
    const open = editable && m != null && edit?.row === rowKey && edit?.m === m;
    const isTyped = m != null && m < 12 && !!typed?.[m];
    const style: React.CSSProperties = {
      ...num, ...(bold ? { fontWeight: 800 } : {}), ...extra,
      ...(isTyped ? { background: TYPED_BG, fontWeight: 700 } : {}),
      ...(editable && m != null ? { cursor: "text" } : {}),
      ...(open ? { padding: "2px 4px" } : {}),
    };
    return (
      <td key={key} style={style} className={editable && m != null ? "os-cell" : undefined}
        onClick={editable && m != null && !open ? () => setEdit!({ row: rowKey!, m }) : undefined}>
        {open ? (
          <CellInput initial={v} onDone={(val, move) => {
            // Only a CHANGE is a decision: tabbing across a month leaves it
            // computed, and blanking a month that was never typed does nothing.
            const changed = val === null ? isTyped : val !== undefined && Math.round(val) !== Math.round(v);
            if (changed) onCommit!(m === 12 ? "all" : m!, val as number | null);
            const next = m! + move;
            setEdit!(move !== 0 && next >= 0 && next <= 11 ? { row: rowKey!, m: next } : null);
          }} />
        ) : Math.abs(v) < 0.5 ? <span style={{ color: "var(--muted)" }}>–</span> : money0(v)}
      </td>
    );
  };
  const change = basis == null ? null : total - basis;
  const pct = change == null || Math.abs(basis ?? 0) < 0.5 ? null : (change / Math.abs(basis!)) * 100;
  const good = change == null || Math.abs(change) < 0.5 ? null : (change > 0) === favorableUp;
  return (
    <tr style={rowStyle}>
      <td style={{ ...lab, ...(bold ? { fontWeight: 800, color: COLOR_BRAND } : {}), ...(upper ? { textTransform: "uppercase", letterSpacing: "0.04em" } : {}), minWidth: 210, whiteSpace: "nowrap" }}>
        {/* The name and its source pill on ONE line, so every row is one row tall. */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, ...(sub ? { paddingLeft: 22, fontSize: 12, color: "var(--muted)" } : {}) }}>
        {toggle && (
          <button type="button" onClick={toggle.onToggle} aria-expanded={toggle.open} aria-label={toggle.open ? "Hide sub-lines" : "Show sub-lines"}
            style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0, width: 14, color: "var(--muted)", fontSize: 11, lineHeight: 1 }}>
            {toggle.open ? "▾" : "▸"}
          </button>
        )}
        {!toggle && variant === "line" && <span style={{ width: 14 }} />}
        {onLabel ? (
          <span role="button" tabIndex={0} onClick={onLabel} onKeyDown={(e) => { if (e.key === "Enter") onLabel(); }}
            style={{ cursor: "pointer", textDecoration: "underline dotted", textUnderlineOffset: 3 }}>{label}</span>
        ) : label}
        {(badge || (onReset && typed?.some(Boolean))) && (
          <span style={{ display: "inline-flex", gap: 6, alignItems: "center", marginLeft: "auto" }}>
            {badge && (badgeHref ? <a href={badgeHref} style={{ textDecoration: "none" }}><Pill tone={badge.tone}>{badge.text} →</Pill></a> : <Pill tone={badge.tone}>{badge.text}</Pill>)}
            {onReset && typed?.some(Boolean) && (
              <button type="button" onClick={onReset} title="Reset typed months" aria-label="Reset typed months"
                style={{ border: "none", background: "transparent", color: "var(--muted)", cursor: "pointer", fontSize: 13, padding: 0, lineHeight: 1 }}>↺</button>
            )}
          </span>
        )}
        </div>
      </td>
      {months.map((m, i) => cell(m, i, i === 0 ? { borderLeft: GROUP_DIV } : undefined, i))}
      {cell(total, "t", { borderLeft: GROUP_DIV, color: COLOR_BRAND, fontWeight: 800 }, editable ? 12 : undefined)}
      {basis == null ? <td style={num} /> : cell(basis, "b", { color: "var(--muted)" })}
      <td style={{ ...num, ...(bold ? { fontWeight: 800 } : {}), color: good == null ? "var(--muted)" : good ? "#15803d" : "#b91c1c" }}>
        {pct == null ? (change == null || Math.abs(change) < 0.5 ? "–" : money0(change)) : `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`}
      </td>
    </tr>
  );
}

export function BudgetStatementTable({ draft, badgeFor, onLine, onEdit }: {
  draft: BudgetDraft;
  badgeFor: (source: Line["source"]) => { tone: PillTone; text: string };
  onLine: (sec: BudgetDraftSection, line: Line) => void;
  /** Present when the viewer may type months; month "all" = an annual spread
   *  evenly; `account` types one sub-line (a GL account) of the line. */
  onEdit?: (sec: BudgetDraftSection, line: Line, month: number | "all", value: number | null, account?: string) => void;
}) {
  const [edit, setEdit] = useState<EditAt>(null);
  // Lines opened to their sub-lines. Closed by default, so the statement reads
  // at the level it is presented; open one to budget its GL accounts.
  const [open, setOpen] = useState<Set<string>>(new Set());
  const withSubs = draft.sections.flatMap((sec) => sec.lines.filter((l) => l.subLines?.length).map((l) => `${sec.name}::${l.label}`));
  const allOpen = withSubs.length > 0 && withSubs.every((k) => open.has(k));
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
      {sec.lines.map((l) => {
        const key = `${sec.name}::${l.label}`;
        const subs = l.subLines ?? [];
        const viaSubs = subs.some((x) => x.typeable);
        // A line budgeted through its sub-lines is their SUM — typed there, not here.
        // A recovery line IS Step 3 — each tenant's share under their CAM
        // methodology — so it is changed there, never typed over here.
        // Rent (and the deals' TI / commissions) likewise IS Step 1.
        const locked = !!l.inputKind || l.source === "cam-estimate" || l.source === "leases";
        const typeable = !!onEdit && !locked && !viaSubs;
        const isOpen = open.has(key);
        return (
          <Fragment key={l.label + l.mask}>
            <Row label={l.label} months={l.months} total={l.total} basis={l.basisTotal}
              badge={badgeFor(l.source)} badgeHref={l.inputKind ? "#step-expenses" : l.source === "cam-estimate" ? "#revenue-by-tenant" : l.source === "leases" ? "#step-rent" : undefined}
              onLabel={() => onLine(sec, l)} favorableUp={favorableUp} typed={viaSubs ? undefined : l.typed}
              rowKey={typeable ? key : undefined} edit={edit} setEdit={typeable ? setEdit : undefined}
              onCommit={typeable ? (m, v) => onEdit!(sec, l, m, v) : undefined}
              onReset={typeable ? () => onEdit!(sec, l, "all", null) : undefined}
              toggle={subs.length ? { open: isOpen, onToggle: () => setOpen((o) => { const n = new Set(o); if (n.has(key)) n.delete(key); else n.add(key); return n; }) } : undefined} />
            {isOpen && subs.map((x) => {
              const subTypeable = !!onEdit && x.typeable;
              const subKey = `${key}#${x.account}`;
              return (
                <Row key={subKey} variant="sub" label={`${x.account}${x.name ? ` · ${x.name}` : ""}`}
                  months={x.months} total={x.total} basis={x.basisTotal} favorableUp={favorableUp} typed={x.typed}
                  rowKey={subTypeable ? subKey : undefined} edit={edit} setEdit={subTypeable ? setEdit : undefined}
                  onCommit={subTypeable ? (m, v) => onEdit!(sec, l, m, v, x.account) : undefined}
                  onReset={subTypeable ? () => onEdit!(sec, l, "all", null, x.account) : undefined} />
              );
            })}
          </Fragment>
        );
      })}
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
              <th style={{ ...head, textAlign: "left" }}>
                Line
                {withSubs.length > 0 && (
                  <button type="button" onClick={() => setOpen(allOpen ? new Set() : new Set(withSubs))}
                    style={{ marginLeft: 10, border: "none", background: "transparent", color: "var(--brand)", cursor: "pointer", fontSize: 11, fontWeight: 700, padding: 0 }}>
                    {allOpen ? "▾ Collapse sub-lines" : "▸ Show sub-lines"}
                  </button>
                )}
              </th>
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
        <b>Leases</b> rent roll &amp; leasing calls · <b>Recoveries</b> each tenant&rsquo;s CAM methodology (Step 1) · <b>Entered</b> keyed in Step 2 · <b>Tax +3%</b> this year&rsquo;s taxes +3% · <b>+3%</b> this year&rsquo;s forecast grown by month · <b>Flat</b> carried unchanged · <b>Loans</b> the Debt Tracker&rsquo;s schedules. <b>Forecast {by}</b> = actuals to date + budget for the rest. Click a line&rsquo;s name for its history.
        {onEdit && <><br />Click a month to type (Tab = next month, blank = back to computed); type into <b>Budget {yy}</b> to spread an annual. <span style={{ background: TYPED_BG, padding: "0 4px", borderRadius: 3 }}>Tinted</span> = typed; ↺ resets a line.</>}
      </div>
    </div>
  );
}

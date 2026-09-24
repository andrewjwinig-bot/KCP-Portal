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
import { NoteMark, type LineNote } from "./LineNote";
import { HoverCard } from "@/app/components/HoverCard";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const COLOR_BRAND = "#0b4a7d";
// THE TABLE LOOKS LIKE THE OPERATING BUDGETS PAGE (app/financials/budgets/
// page.tsx — `BudgetTableColgroup`, `BudgetLineRow`, `SubtotalCard`,
// `GroupHeader`): a card per section under a brand group heading, the global
// table cells, every other month column tinted, fixed percentage columns so
// each card's months line up with the next, and the cross-section totals in
// their own brand-bordered cards. The draft is the budget before it is
// published there, so the two must read as the same document.
const MONTH_TINT = "rgba(15,23,42,0.035)";
const COL_PCT = { line: 25, month: 4.8, budget: 7, reproj: 6.2, change: 4.2 };
function Colgroup() {
  return (
    <colgroup>
      <col style={{ width: `${COL_PCT.line}%` }} />
      {MONTHS.map((m, i) => <col key={m} style={{ width: `${COL_PCT.month}%`, ...(i % 2 === 0 ? { background: MONTH_TINT } : {}) }} />)}
      <col style={{ width: `${COL_PCT.budget}%` }} />
      <col style={{ width: `${COL_PCT.reproj}%` }} />
      <col style={{ width: `${COL_PCT.change}%` }} />
    </colgroup>
  );
}
const TABLE: React.CSSProperties = { tableLayout: "fixed", width: "100%", minWidth: 1180 };
const num: React.CSSProperties = { textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 12, whiteSpace: "nowrap", verticalAlign: "middle", paddingLeft: 6, paddingRight: 6 };
const lab: React.CSSProperties = { textAlign: "left", verticalAlign: "middle", fontSize: 14 };
const headR: React.CSSProperties = { textAlign: "right", whiteSpace: "nowrap" };

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

export function CellInput({ initial, onDone }: { initial: number; onDone: (v: number | null | undefined, move: 0 | 1 | -1) => void }) {
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

function Row({ label, months, total, basis, variant = "line", badge, onLabel, favorableUp, typed, rowKey, edit, setEdit, onCommit, onReset, badgeHref, toggle, onAccept, note, depth = 1, priorYear, labelNote }: {
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
  /** A keyed input (taxes, insurance, building maintenance) not yet entered:
   *  keep the figure as shown and mark it entered, in one click. */
  onAccept?: () => void;
  /** The line's note mark — present on every budget line. */
  note?: { note?: LineNote; onOpen: () => void };
  /** A sub-line's depth: 1 = a bucket or GL account, 2 = an item under it. */
  depth?: number;
  /** Set when `basis` is LAST YEAR'S BUDGET rather than the reprojection —
   *  an item has no actuals to reproject. Rendered in italics, with a hover. */
  priorYear?: number;
  /** The budget workbook's own note on the row. */
  labelNote?: string;
}) {
  const sub = variant === "sub";
  const subtotal = variant === "subtotal";
  const rowStyle: React.CSSProperties | undefined =
    subtotal ? { background: "rgba(11,74,125,0.06)", borderTop: "2px solid rgba(11,74,125,0.30)" }
    : sub ? { background: "rgba(11,74,125,0.035)" }
    : undefined;
  const editable = !!rowKey && !!setEdit && !!onCommit;
  const cell = (v: number, key: string | number, extra?: React.CSSProperties, m?: number) => {
    const open = editable && m != null && edit?.row === rowKey && edit?.m === m;
    const isTyped = m != null && m < 12 && !!typed?.[m];
    const style: React.CSSProperties = {
      ...num, ...(subtotal ? { fontWeight: 800, fontSize: 13.5, color: COLOR_BRAND } : {}), ...extra,
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
      <td style={{ ...lab, ...(subtotal ? { fontWeight: 800, color: COLOR_BRAND, textTransform: "uppercase", letterSpacing: "0.04em", fontSize: 13.5 } : {}), ...(sub ? { borderLeft: `3px solid ${COLOR_BRAND}`, paddingLeft: depth > 1 ? 46 : 26, fontSize: depth > 1 ? 11.5 : 12, ...(depth > 1 ? { color: "var(--muted)" } : {}) } : {}), whiteSpace: "nowrap", overflow: "hidden" }}>
        {/* The name and its source pill on ONE line, so every row is one row tall. */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {toggle && (
          <button type="button" onClick={toggle.onToggle} aria-expanded={toggle.open} aria-label={toggle.open ? "Hide sub-lines" : "Show sub-lines"}
            style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0, width: 14, flex: "0 0 14px", color: "var(--muted)", fontSize: 11, lineHeight: 1 }}>
            {toggle.open ? "▾" : "▸"}
          </button>
        )}
        {!toggle && (variant === "line" || (sub && depth === 1)) && <span style={{ flex: "0 0 14px" }} />}
        {onLabel ? (
          <span role="button" tabIndex={0} onClick={onLabel} onKeyDown={(e) => { if (e.key === "Enter") onLabel(); }}
            className="os-line-name" style={{ cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{label}</span>
        ) : labelNote ? (
          <HoverCard title={label} width={280} rows={[]} footer={{ label: "Budget note", value: labelNote }}>
            <span style={{ borderBottom: "1px dotted var(--muted)", cursor: "default" }}>{label}</span>
          </HoverCard>
        ) : label}
        {note && <NoteMark label={label} note={note.note} onOpen={note.onOpen} />}
        {(badge || onAccept || (onReset && typed?.some(Boolean))) && (
          <span style={{ display: "inline-flex", gap: 6, alignItems: "center", marginLeft: "auto", flex: "0 0 auto" }}>
            {onAccept && (
              <button type="button" onClick={onAccept} className="btn" aria-label={`Accept ${label} as shown`}
                style={{ fontSize: 11, fontWeight: 700, padding: "1px 8px" }}>Accept</button>
            )}
            {badge && (badgeHref ? <a href={badgeHref} style={{ textDecoration: "none" }}><Pill tone={badge.tone}>{badge.text} →</Pill></a> : <Pill tone={badge.tone}>{badge.text}</Pill>)}
            {onReset && typed?.some(Boolean) && (
              <button type="button" onClick={onReset} title="Reset typed months" aria-label="Reset typed months"
                style={{ border: "none", background: "transparent", color: "var(--muted)", cursor: "pointer", fontSize: 13, padding: 0, lineHeight: 1 }}>↺</button>
            )}
          </span>
        )}
        </div>
      </td>
      {months.map((m, i) => cell(m, i, undefined, i))}
      {cell(total, "t", subtotal ? { fontSize: 14, fontWeight: 800 } : { fontSize: 14, fontWeight: 600 }, editable ? 12 : undefined)}
      {basis == null ? <td style={num} /> : priorYear ? (
        <td style={{ ...num, color: "var(--muted)", fontStyle: "italic" }}>
          <HoverCard title={`${priorYear} budget`} width={260} rows={[]} footer={{ label: "Items have no reprojection", value: money0(basis) }}>
            <span>{Math.abs(basis) < 0.5 ? "–" : money0(basis)}</span>
          </HoverCard>
        </td>
      ) : cell(basis, "b", { color: "var(--muted)" })}
      <td style={{ ...num, ...(subtotal ? { fontWeight: 800 } : {}), color: good == null ? "var(--muted)" : good ? "#15803d" : "#b91c1c" }}>
        {pct == null ? (change == null || Math.abs(change) < 0.5 ? "–" : money0(change)) : `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`}
      </td>
    </tr>
  );
}

/** A small italic metric row — occupancy, the recovery ratio — that reads
 *  the statement rather than adding to it. Pre-formatted strings; "" = blank. */
function StatRow({ label, months, total, basis, change, changeGood }: {
  label: string; months: string[]; total: string; basis: string; change: string; changeGood?: boolean | null;
}) {
  return (
    <tr>
      <td style={{ ...lab, fontWeight: 700, color: "var(--muted)", whiteSpace: "nowrap" }}>{label}</td>
      {months.map((m, i) => <td key={i} style={{ ...num, fontSize: 13 }}>{m}</td>)}
      <td style={{ ...num, fontSize: 13, fontWeight: 700 }}>{total}</td>
      <td style={{ ...num, color: "var(--muted)" }}>{basis}</td>
      <td style={{ ...num, color: changeGood == null ? "var(--muted)" : changeGood ? "#15803d" : "#b91c1c" }}>{change}</td>
    </tr>
  );
}

/** A brand group heading between the section cards — the Operating Budgets
 *  page's `GroupHeader`. */
function GroupHeader({ label }: { label: string }) {
  return (
    <div style={{ marginTop: 4, paddingBottom: 6, borderBottom: `2px solid ${COLOR_BRAND}`, fontSize: 18, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: COLOR_BRAND }}>
      {label}
    </div>
  );
}

/** A cross-section total (Total Revenues, NOI, cash flow) in its own card —
 *  the Operating Budgets page's `SubtotalCard`, plus this page's reprojection
 *  and change columns. */
function RollupCard({ label, months, total, basis, favorableUp }: {
  label: string; months: number[]; total: number; basis: number; favorableUp: boolean;
}) {
  const change = total - basis;
  const pct = Math.abs(basis) < 0.5 ? null : (change / Math.abs(basis)) * 100;
  const good = Math.abs(change) < 0.5 ? null : (change > 0) === favorableUp;
  const cell: React.CSSProperties = { ...num, fontSize: 13, fontWeight: 800, borderBottom: "none" };
  return (
    <div className="card" style={{ padding: 0, borderColor: COLOR_BRAND, background: "rgba(11,74,125,0.04)" }}>
      <div className="tableWrap" style={{ marginTop: 0 }}>
        <table style={TABLE}>
          <Colgroup />
          <tbody>
            <tr>
              <td style={{ ...lab, fontSize: 13, fontWeight: 900, letterSpacing: "0.04em", textTransform: "uppercase", color: COLOR_BRAND, borderBottom: "none" }}>{label}</td>
              {months.map((m, i) => <td key={i} style={{ ...cell, color: m < 0 ? "#b91c1c" : undefined }}>{money0(m)}</td>)}
              <td style={{ ...cell, fontSize: 14, fontWeight: 900, color: total < 0 ? "#b91c1c" : COLOR_BRAND }}>{money0(total)}</td>
              <td style={{ ...cell, fontWeight: 600, fontSize: 12, color: "var(--muted)" }}>{money0(basis)}</td>
              <td style={{ ...cell, fontSize: 12, color: good == null ? "var(--muted)" : good ? "#15803d" : "#b91c1c" }}>
                {pct == null ? "–" : `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function BudgetStatementTable({ draft, badgeFor, onLine, onEdit, notes, onNote, canType }: {
  draft: BudgetDraft;
  /** Which lines this viewer may type (Greg: the expense lines). Absent = all. */
  canType?: (section: string, label: string) => boolean;
  /** Notes on the lines, keyed `section::label`. */
  notes?: Record<string, LineNote>;
  /** Opens the note dialog for a line. */
  onNote?: (sec: BudgetDraftSection, label: string) => void;
  badgeFor: (source: Line["source"]) => { tone: PillTone; text: string };
  onLine: (sec: BudgetDraftSection, line: Line) => void;
  /** Present when the viewer may type months; month "all" = an annual spread
   *  evenly; `account` types one sub-line (a GL account) of the line. */
  onEdit?: (sec: BudgetDraftSection, line: Line, month: number | "all" | "accept", value: number | null, account?: string) => void;
}) {
  const [edit, setEdit] = useState<EditAt>(null);
  const [toggled, setToggled] = useState<Set<string>>(new Set());
  // A bucket's ITEMS (Sprinkler Inspection, Backflow…) fold under it, closed
  // by default: the bucket's total is what reads down the page, the items are
  // there when you want them.
  const [openBuckets, setOpenBuckets] = useState<Set<string>>(new Set());
  // EVERYTHING starts collapsed (the owner's call): the statement reads at the
  // level it is presented, and a line opens to its buckets, a bucket to its
  // items, only when asked. `toggled` holds the lines opened.
  const isOpenKey = (k: string) => toggled.has(k);
  const byRole = (roles: SectionRole[]) => draft.sections.filter((s) => roles.includes(s.role));
  const revenue = byRole(["revenue", "reimbursement"]);
  const expense = byRole(["reimbursable-expense", "non-reimbursable-expense", "residential-expense"]);
  const capital = byRole(["capital"]);
  const debt = byRole(["debt-service"]);

  const basisOf = (secs: BudgetDraftSection[]) => secs.reduce((s, sec) => s + sum(sec.lines.map((l) => l.basisTotal)), 0);
  const monthsOf = (secs: BudgetDraftSection[]) => { const m = new Array(12).fill(0); for (const s of secs) addInto(m, s.subtotal); return m; };
  const r = draft.rollups;
  const capM = monthsOf(capital), debtM = monthsOf(debt);
  const cfbM = r.netOperatingIncome.months.map((v, i) => v - capM[i]);
  const cfaM = cfbM.map((v, i) => v - debtM[i]);
  const noiBasis = basisOf(revenue) - basisOf(expense);

  // One card per statement section: a header strip, the column heads, its
  // lines, its subtotal — and, on the reimbursements, the recovery ratio.
  const pctS = (v: number | null, dp = 1) => (v == null ? "" : `${v.toFixed(dp)}%`);
  const pts = (a: number | null, b: number | null) => (a == null || b == null ? "" : `${a - b >= 0 ? "+" : "−"}${Math.abs(a - b).toFixed(1)} pts`);
  const head = (
    <thead>
      <tr>
        <th>Line</th>
        {MONTHS.map((m) => <th key={m} style={headR}>{m}</th>)}
        <th style={{ ...headR, color: COLOR_BRAND }}>Budget</th>
        <th style={headR}>{draft.basisYear} Reproj.</th>
        <th style={headR}>Change</th>
      </tr>
    </thead>
  );

  // THE RECOVERY RATIO — reimbursements as a share of the recoverable expense
  // pool, for the year (a monthly ratio would swing on a tax bill's month).
  const reimb = byRole(["reimbursement"]);
  const pool = byRole(["reimbursable-expense"]);
  const poolBudget = pool.reduce((a, x) => a + x.total, 0);
  const poolBasis = basisOf(pool);
  const ratioRow = reimb.length && Math.abs(poolBudget) > 0.5 ? (() => {
    const ratio = (reimb.reduce((a, x) => a + x.total, 0) / poolBudget) * 100;
    const ratioBasis = Math.abs(poolBasis) > 0.5 ? (basisOf(reimb) / poolBasis) * 100 : null;
    return <StatRow key="recovery-ratio" label="Recovery ratio (% of pool)" months={new Array(12).fill("")} total={pctS(ratio)} basis={pctS(ratioBasis)} change={pts(ratio, ratioBasis)} changeGood={ratioBasis == null || Math.abs(ratio - ratioBasis) < 0.05 ? null : ratio > ratioBasis} />;
  })() : null;
  const lastReimb = reimb[reimb.length - 1]?.name;

  const section = (sec: BudgetDraftSection, favorableUp: boolean, subtotal = true) => {
    const secSubs = sec.lines.filter((l) => l.subLines?.length).map((l) => `${sec.name}::${l.label}`);
    const secOpen = secSubs.length > 0 && secSubs.every(isOpenKey);
    const setSec = (o: boolean) => setToggled((t) => { const n = new Set(t); for (const k of secSubs) { if (o) n.add(k); else n.delete(k); } return n; });
    return (
      <div key={sec.name} className="card" style={{ padding: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 14px", borderBottom: "1px solid var(--border)", background: "rgba(15,23,42,0.03)" }}>
          <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase" }}>{sec.name}</span>
          {secSubs.length > 0 && (
            <button type="button" onClick={() => setSec(!secOpen)}
              style={{ border: "none", background: "transparent", color: "var(--brand)", cursor: "pointer", fontSize: 11, fontWeight: 700, padding: 0, letterSpacing: "0.04em", textTransform: "uppercase" }}>
              {secOpen ? "▾ Hide sub-lines" : "▸ Show sub-lines"}
            </button>
          )}
        </div>
        <div className="tableWrap" style={{ marginTop: 0 }}>
          <table style={TABLE}>
            <Colgroup />
            {head}
            <tbody>
              {sec.lines.map((l) => {
                const key = `${sec.name}::${l.label}`;
                const subs = l.subLines ?? [];
                const viaSubs = subs.some((x) => x.typeable);
                // A line budgeted through its sub-lines is their SUM — typed there, not here.
                // A recovery line IS Step 3 — each tenant's share under their CAM
                // methodology — so it is changed there, never typed over here.
                // Rent (and the deals' TI / commissions) likewise IS Step 1.
                // Taxes, insurance and building maintenance ARE typeable here — they
                // save to the Budget Inputs store (the same figures Greg keys on his
                // page), so the grid and his page cannot disagree.
                // A payroll share is set by the book's total above the grid.
        const locked = l.source === "cam-estimate" || l.source === "leases" || l.source === "pool";
                const mayType = !!onEdit && (!canType || canType(sec.name, l.label));
                const typeable = mayType && !locked && !viaSubs;
                const keyed = !!l.inputKind;
                const entered = keyed && l.source === "entered";
                const isOpen = isOpenKey(key);
                return (
                  <Fragment key={l.label + l.mask}>
                    <Row label={l.label} months={l.months} total={l.total} basis={l.basisTotal}
                      badge={badgeFor(l.source)} badgeHref={l.source === "cam-estimate" ? "#revenue-by-tenant" : l.source === "leases" ? "#step-rent" : undefined}
                      onLabel={() => onLine(sec, l)} favorableUp={favorableUp}
                      typed={viaSubs ? undefined : entered ? new Array(12).fill(true) : l.typed}
                      onAccept={typeable && keyed && !entered ? () => onEdit!(sec, l, "accept", null) : undefined}
                      note={onNote ? { note: notes?.[key], onOpen: () => onNote(sec, l.label) } : undefined}
                      rowKey={typeable ? key : undefined} edit={edit} setEdit={typeable ? setEdit : undefined}
                      onCommit={typeable ? (m, v) => onEdit!(sec, l, m, v) : undefined}
                      onReset={typeable ? () => onEdit!(sec, l, "all", null) : undefined}
                      toggle={subs.length ? { open: isOpen, onToggle: () => setToggled((o) => { const n = new Set(o); if (n.has(key)) n.delete(key); else n.add(key); return n; }) } : undefined} />
                    {isOpen && subs.flatMap((x) => {
                      // A SEEDED bucket (Contractual, Recurring…) and its
                      // items: each reads against last year's budget, and a
                      // bucket with items is their sum — typed through them.
                      const seeded = x.bucket === "seeded";
                      const rowFor = (y: typeof x, depth: number, toggle?: { open: boolean; onToggle: () => void }) => {
                        const typeableY = mayType && y.typeable;
                        const k = `${key}#${y.account}`;
                        const noteLabel = `${l.label}#${y.account}`;
                        return (
                          <Row key={k} variant="sub" depth={depth} toggle={toggle} label={y.label ?? `${y.account}${y.name ? ` · ${y.name}` : ""}`}
                            months={y.months} total={y.total}
                            basis={seeded ? (y.prior ?? 0) : y.bucket === "extra" ? null : y.basisTotal} priorYear={seeded ? draft.basisYear : undefined}
                            labelNote={y.note}
                            favorableUp={favorableUp}
                            typed={y.bucket === "base" && entered ? new Array(12).fill(true) : y.typed}
                            onAccept={typeableY && y.bucket === "base" && keyed && !entered ? () => onEdit!(sec, l, "accept", null, y.account) : undefined}
                            rowKey={typeableY ? k : undefined} edit={edit} setEdit={typeableY ? setEdit : undefined}
                            onCommit={typeableY ? (m, v) => onEdit!(sec, l, m, v, y.account) : undefined}
                            onReset={typeableY ? () => onEdit!(sec, l, "all", null, y.account) : undefined}
                            note={onNote && seeded ? { note: notes?.[`${sec.name}::${noteLabel}`], onOpen: () => onNote(sec, noteLabel) } : undefined} />
                        );
                      };
                      const bKey = `${key}#${x.account}`;
                      const hasItems = !!x.items?.length;
                      const bOpen = openBuckets.has(bKey);
                      const toggleB = hasItems ? { open: bOpen, onToggle: () => setOpenBuckets((o) => { const n = new Set(o); if (n.has(bKey)) n.delete(bKey); else n.add(bKey); return n; }) } : undefined;
                      return [rowFor(x, 1, toggleB), ...(hasItems && bOpen ? x.items!.map((it) => rowFor(it, 2)) : [])];
                    })}
                  </Fragment>
                );
              })}
              {subtotal && <Row label={`Total ${sec.name}`} months={sec.subtotal} total={sec.total} basis={sum(sec.lines.map((l) => l.basisTotal))} variant="subtotal" favorableUp={favorableUp} />}
              {sec.name === lastReimb && ratioRow}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const body: React.ReactNode[] = [];

  // OCCUPANCY, month by month, off the same suites as Revenue by tenant: a
  // suite is occupied in a month it pays rent. Its own card at the top, as on
  // the Operating Budgets page; "Today" is the current roll.
  const suites = (draft.tenantRevenue ?? []).filter((t) => !t.recoveryOnly && t.sqft > 0);
  const totalSf = suites.reduce((a, t) => a + t.sqft, 0);
  if (totalSf > 0) {
    const occSf = MONTHS.map((_, i) => suites.reduce((a, t) => a + ((t.rent[i] || 0) > 0.5 ? t.sqft : 0), 0));
    const avgSf = sum(occSf) / 12;
    const todaySf = suites.reduce((a, t) => a + (t.status === "vacant" || t.status === "lease-up" ? 0 : t.sqft), 0);
    const p = (sf: number) => (sf / totalSf) * 100;
    const sf = (n: number) => Math.round(n).toLocaleString("en-US");
    const up = Math.abs(avgSf - todaySf) < 0.5 ? null : avgSf > todaySf;
    body.push(
      <div key="occ" className="card" style={{ padding: 0 }}>
        <div className="tableWrap" style={{ marginTop: 0 }}>
          <table style={TABLE}>
            <Colgroup />
            <thead>
              <tr>
                <th />
                {MONTHS.map((m) => <th key={m} style={headR}>{m}</th>)}
                <th style={headR}>Avg</th>
                <th style={headR}>Today</th>
                <th style={headR}>Change</th>
              </tr>
            </thead>
            <tbody>
              <StatRow label="Occupancy %" months={occSf.map((v) => pctS(p(v)))} total={pctS(p(avgSf))} basis={pctS(p(todaySf))} change={pts(p(avgSf), p(todaySf))} changeGood={up} />
              <StatRow label={`Occupancy SF (of ${sf(totalSf)})`} months={occSf.map(sf)} total={sf(avgSf)} basis={sf(todaySf)} change={up == null ? "–" : `${up ? "+" : "−"}${sf(Math.abs(avgSf - todaySf))}`} changeGood={up} />
            </tbody>
          </table>
        </div>
      </div>,
    );
  }

  body.push(<GroupHeader key="g-rev" label="Revenues" />);
  revenue.forEach((x) => body.push(section(x, true)));
  body.push(<RollupCard key="tr" label="Total Revenues" months={r.totalRevenues.months} total={r.totalRevenues.total} basis={basisOf(revenue)} favorableUp />);
  body.push(<GroupHeader key="g-opex" label="Operating Expenses" />);
  expense.forEach((x) => body.push(section(x, false)));
  body.push(<RollupCard key="te" label="Total Operating Expenses" months={r.totalOperatingExpenses.months} total={r.totalOperatingExpenses.total} basis={basisOf(expense)} favorableUp={false} />);
  body.push(<RollupCard key="noi" label="Net Operating Income" months={r.netOperatingIncome.months} total={r.netOperatingIncome.total} basis={noiBasis} favorableUp />);
  if (capital.length) {
    body.push(<GroupHeader key="g-cap" label="Capital Improvements" />);
    capital.forEach((x) => body.push(section(x, false, false)));
  }
  if (debt.length) {
    body.push(<RollupCard key="cfb" label="Cash Flow Before Debt Service" months={cfbM} total={sum(cfbM)} basis={noiBasis - basisOf(capital)} favorableUp />);
    body.push(<GroupHeader key="g-debt" label="Debt Service" />);
    debt.forEach((x) => body.push(section(x, false)));
    body.push(<RollupCard key="cfa" label="Cash Flow After Debt Service" months={cfaM} total={sum(cfaM)} basis={noiBasis - basisOf(capital) - basisOf(debt)} favorableUp />);
  } else {
    body.push(<RollupCard key="cf" label="Cash Flow" months={cfbM} total={sum(cfbM)} basis={noiBasis - basisOf(capital)} favorableUp />);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {body}
      <div className="muted small" style={{ padding: "2px 4px" }}>
        <b>Leases</b> rent roll &amp; leasing calls · <b>Recoveries</b> each tenant&rsquo;s CAM methodology (Revenues, below) · <b>Entered</b> keyed here · <b>Tax +3%</b> this year&rsquo;s taxes +3% · <b>+3%</b> this year&rsquo;s reprojection grown by month · <b>Flat</b> carried unchanged · <b>Loans</b> the Debt Tracker&rsquo;s schedules · <b>Payroll</b> this property&rsquo;s share of the book&rsquo;s payroll total — click the line to enter it · <b>Items</b> built item by item from the {draft.basisYear} budget (contracts and recurring +3%, Big Projects from $0), its figures in <i>italics</i> in the {draft.basisYear} column. <b>{draft.basisYear} Reproj.</b> = the {draft.basisYear} reprojection: actuals to date + budget for the rest. Click a line&rsquo;s name for its history.
        {onEdit && <><br />Click a month to type (Tab = next month, blank = back to computed); type into <b>Budget</b> to spread an annual. <span style={{ background: TYPED_BG, padding: "0 4px", borderRadius: 3 }}>Tinted</span> = typed; ↺ resets a line.</>}
      </div>
    </div>
  );
}

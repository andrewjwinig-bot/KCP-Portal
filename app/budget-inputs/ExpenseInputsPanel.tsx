"use client";

// The Expenses step's table — taxes, insurance, building maintenance keyed by
// the person who knows them, each above this year's budget, actual and
// forecast. ONE component, rendered in two places: inside the master budget
// page (Step 3, for the property on screen) and on /budget-inputs, which is
// Greg's whole view of the budget (he can reach nothing else). Two copies of
// this form would drift the way pages always have.

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { StatPill, Pill, TONE_GREEN, TONE_BLUE, TONE_NEUTRAL } from "@/app/components/Pill";
import { th, td, thL, tdL } from "@/app/components/tableStyles";
import LoadingState from "@/app/components/LoadingState";
import { EXPENSE_INPUT_LABEL, spreadLike, spreadPattern, type ExpenseInputKind, type SpreadShape } from "@/lib/financials/budgets/expenseInputs";
import type { BudgetInputProperty, BudgetInputKindRow } from "@/app/api/budget-inputs/route";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const OWNER: Record<ExpenseInputKind, string> = { ret: "Drew", insurance: "Drew", "building-maintenance": "Greg" };
const money0 = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const num = (n: number) => (Math.round(n) === 0 ? "—" : Math.round(n).toLocaleString("en-US"));
const sum = (a: number[]) => a.reduce((s, n) => s + (n || 0), 0);
const cellIn: React.CSSProperties = { width: 64, textAlign: "right", padding: "3px 6px", fontSize: 12.5, fontVariantNumeric: "tabular-nums" };

type Resp = { year: number; basisYear: number; book: string; growthPct: number; user: string; properties: BudgetInputProperty[] };

/**
 * `embedded` — inside the master page: one property, every line shown (a
 * collaborator sees the others' figures read-only), no page chrome. Otherwise
 * the standalone page: a contributor sees only the lines they key.
 */
export function ExpenseInputsPanel({ year, bookId, only, embedded = false, onSaved }: {
  year: number; bookId: string; only: string | null; embedded?: boolean;
  /** After a save — the master page re-projects the draft. */
  onSaved?: () => void;
}) {
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((quiet = false) => {
    if (!quiet) setLoading(true);
    return fetch(`/api/budget-inputs?year=${year}&book=${bookId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (j.error) { setError(j.error); setData(null); } else { setData(j); setError(null); } })
      .catch((e) => setError(e?.message ?? "Failed to load"))
      .finally(() => setLoading(false));
  }, [year, bookId]);
  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    const props = (data?.properties ?? []).filter((p) => !only || p.code === only);
    const anyEditable = props.some((p) => p.kinds.some((k) => k.editable));
    // Standalone: a contributor sees only what they key (Drew and admin see
    // all of it). Embedded in the master page: everyone sees every line, and
    // the ones they don't own are read-only.
    return props
      .map((p) => ({ ...p, kinds: p.kinds.filter((k) => (embedded || !anyEditable || k.editable) && (!onlyOpen || !k.entered)) }))
      .filter((p) => p.kinds.length || p.missingBasis);
  }, [data, only, onlyOpen, embedded]);

  const all = rows.flatMap((p) => p.kinds);
  const entered = all.filter((k) => k.entered).length;

  const save = useCallback(async (code: string, kind: ExpenseInputKind, body: { annual?: number; months?: number[]; clear?: boolean }) => {
    const res = await fetch("/api/budget-inputs", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, propertyCode: code, kind, ...body }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.error) { setError(j.error ?? "Couldn't save — please try again."); return false; }
    await load(true);
    onSaved?.();
    return true;
  }, [year, load, onSaved]);

  const table = (
    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1180 }}>
      <thead>
        <tr>
          <th style={thL}>Line</th>
          {MONTHS.map((m) => <th key={m} style={th}>{m}</th>)}
          <th style={th}>{data?.year} total</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p, pi) => (
          <Fragment key={p.code}>
            {/* The property band — left out when the master page already
                names the one property on screen. */}
            {(!embedded || p.missingBasis) && (
              <tr style={{ background: "rgba(11,74,125,0.07)", borderTop: pi ? "2px solid var(--border)" : "none" }}>
                <td style={{ ...tdL, paddingTop: 10, paddingBottom: 10, whiteSpace: "normal" }} colSpan={14}>
                  {!embedded && <span style={{ fontWeight: 800 }}>{p.code} — {p.name}</span>}
                  {p.missingBasis && <span className="muted" style={{ fontSize: 12, marginLeft: embedded ? 0 : 10 }}>no {data?.basisYear} GL or budget loaded — nothing to measure against yet</span>}
                </td>
              </tr>
            )}
            {p.kinds.map((k) => (
              <KindRows key={k.kind} code={p.code} row={k} basisYear={data!.basisYear} year={data!.year} onSave={save} />
            ))}
          </Fragment>
        ))}
      </tbody>
    </table>
  );

  return (
    <>
      {!embedded && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div className="pills" style={{ justifyContent: "flex-start" }}>
            <StatPill label="Entered" value={`${entered} / ${all.length}`} accent={all.length && entered === all.length ? "#15803d" : "#b45309"} />
          </div>
          <label className="muted small" style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />
            Only what&rsquo;s still to enter
          </label>
        </div>
      )}

      {error && <div className="small" style={{ color: "#b91c1c", fontWeight: 700, padding: embedded ? "8px 14px" : 0 }}>· {error}</div>}

      {loading && !data ? (
        embedded ? <div className="muted small" style={{ padding: 14 }}>Loading this year&rsquo;s figures…</div>
          : <LoadingState status="Loading this year's figures…" context="Budget, actual and forecast for each property" columns={3} rows={4} />
      ) : !rows.length ? (
        <div className={embedded ? "muted small" : "card muted small"} style={{ padding: 18 }}>{onlyOpen ? "Everything here is entered." : "Nothing to enter here."}</div>
      ) : embedded ? (
        <div style={{ overflowX: "auto" }}>{table}</div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: "auto" }}>{table}</div>
      )}
    </>
  );
}

function KindRows({ code, row, basisYear, year, onSave }: {
  code: string; row: BudgetInputKindRow; basisYear: number; year: number;
  onSave: (code: string, kind: ExpenseInputKind, body: { annual?: number; months?: number[]; clear?: boolean }) => Promise<boolean>;
}) {
  // Every line takes EITHER twelve months (a tax bill in May and November, a
  // premium in its renewal month) OR a total — taxes and insurance spread like
  // this year, maintenance evenly. Whichever was typed last is what saves.
  const pattern = row.kind === "building-maintenance" ? new Array(12).fill(1) : row.basisForecast;
  const [cells, setCells] = useState<string[]>(() => row.months.map((v) => String(v)));
  const [annual, setAnnual] = useState<string>(() => String(sum(row.months)));
  const [mode, setMode] = useState<"months" | "annual" | null>(null);
  const [busy, setBusy] = useState(false);
  // Follow the server after a save or a reload.
  useEffect(() => { setCells(row.months.map((v) => String(v))); setAnnual(String(sum(row.months))); setMode(null); }, [row.months]);

  const parse = (v: string) => Number(v.replace(/[,$\s]/g, "")) || 0;
  const cellNums = cells.map(parse);
  const annualNum = parse(annual);
  const dirty = mode === "months" ? cellNums.some((v, i) => v !== row.months[i]) : mode === "annual" ? annualNum !== sum(row.months) : false;

  const status = row.entered
    ? <Pill tone={TONE_GREEN}>ENTERED</Pill>
    : row.kind === "ret" ? <Pill tone={TONE_BLUE}>DEFAULT +3%</Pill> : <Pill tone={TONE_NEUTRAL}>NOT YET</Pill>;

  async function commit(body: { annual?: number; months?: number[]; clear?: boolean }) {
    setBusy(true);
    await onSave(code, row.kind, body);
    setBusy(false);
  }
  const save = () => commit(mode === "months" ? { months: cellNums } : { annual: annualNum });
  const cancel = () => { setCells(row.months.map((v) => String(v))); setAnnual(String(sum(row.months))); setMode(null); };
  // Re-lay the CURRENT total across the year in a chosen shape; the months are
  // then what saves, and any of them can still be typed over.
  const reshape = (shape: SpreadShape) => {
    const total = cellNums.reduce((a, b) => a + b, 0);
    setCells(spreadLike(total, spreadPattern(shape, row.basisForecast)).map(String));
    setMode("months");
  };
  const onKey = (e: React.KeyboardEvent) => { if (e.key === "Enter" && dirty) save(); if (e.key === "Escape") cancel(); };

  const ref = (label: string, months: number[], note?: string) => (
    <tr style={{ color: "var(--muted)" }}>
      <td style={{ ...tdL, fontSize: 12, paddingTop: 3, paddingBottom: 3, paddingLeft: 26 }}>{label}{note ? <span style={{ marginLeft: 6, fontSize: 11 }}>{note}</span> : null}</td>
      {months.map((v, i) => <td key={i} style={{ ...td, fontSize: 12, paddingTop: 3, paddingBottom: 3 }}>{num(v)}</td>)}
      <td style={{ ...td, fontSize: 12, paddingTop: 3, paddingBottom: 3, fontWeight: 700 }}>{money0(sum(months))}</td>
    </tr>
  );

  return (
    <>
      <tr style={{ borderTop: "1px solid var(--border)" }}>
        <td style={{ ...tdL, whiteSpace: "normal", minWidth: 210 }}>
          <div style={{ fontWeight: 700 }}>{EXPENSE_INPUT_LABEL[row.kind]} {status}</div>
          <div className="muted" style={{ fontSize: 11.5 }}>
            {OWNER[row.kind]}{row.editable ? " · type any month or the total, or pick a spread" : " · read-only"}
            {row.lines.length > 1 ? ` · lands on ${row.lines.join(", ")}` : ""}
          </div>
          {row.editable && (
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 6 }}>
              <select className="select-sm" style={{ width: "auto" }} value="" aria-label={`Spread ${EXPENSE_INPUT_LABEL[row.kind]} across the year`}
                onChange={(e) => { if (e.target.value) reshape(e.target.value as SpreadShape); }}>
                <option value="">Spread…</option>
                <option value="like-basis">Like {basisYear}</option>
                <option value="even">Evenly, monthly</option>
                <option value="quarterly">Quarterly (Jan · Apr · Jul · Oct)</option>
                <option value="semiannual">Twice a year (Jan · Jul)</option>
                <optgroup label="All in one month">
                  {MONTHS.map((m, i) => <option key={m} value={`month-${i}`}>All in {m}</option>)}
                </optgroup>
              </select>
              {dirty ? (
                <>
                  <button className="btn primary" disabled={busy} style={{ fontSize: 12, padding: "4px 12px" }} onClick={save}>{busy ? "Saving…" : "Save"}</button>
                  <button className="btn" disabled={busy} style={{ fontSize: 12, padding: "4px 12px" }} onClick={cancel}>Cancel</button>
                </>
              ) : !row.entered ? (
                // Accept the figure as it stands — the default IS the answer
                // for most properties, and that should be one click.
                <button className="btn" disabled={busy} style={{ fontSize: 12, padding: "4px 12px" }}
                  onClick={() => commit({ months: row.months })}>{busy ? "…" : "Accept as shown"}</button>
              ) : (
                <button className="btn" disabled={busy} style={{ fontSize: 12, padding: "4px 12px" }}
                  onClick={() => commit({ clear: true })}>Reset to default</button>
              )}
            </div>
          )}
        </td>
        {cellNums.map((v, i) => (
          <td key={i} style={{ ...td, paddingLeft: 3, paddingRight: 3 }}>
            {row.editable ? (
              <input value={cells[i]} inputMode="numeric" aria-label={`${EXPENSE_INPUT_LABEL[row.kind]} ${MONTHS[i]} ${year}`} style={cellIn}
                onKeyDown={onKey}
                onChange={(e) => {
                  const next = cells.map((x, j) => (j === i ? e.target.value : x));
                  setCells(next); setMode("months");
                  setAnnual(String(next.map(parse).reduce((a, b) => a + b, 0)));
                }} />
            ) : <span style={{ fontWeight: 600 }}>{num(v)}</span>}
          </td>
        ))}
        <td style={{ ...td, fontWeight: 800 }}>
          {row.editable ? (
            <input value={annual} inputMode="numeric" aria-label={`${EXPENSE_INPUT_LABEL[row.kind]} ${year} total`} style={{ ...cellIn, width: 96, fontWeight: 800 }}
              onKeyDown={onKey}
              onChange={(e) => {
                setAnnual(e.target.value); setMode("annual");
                setCells(spreadLike(parse(e.target.value), pattern).map(String));
              }} />
          ) : money0(sum(row.months))}
        </td>
      </tr>
      {ref(`${basisYear} budget`, row.basisBudget)}
      {ref(`${basisYear} actual`, row.basisActual, row.actualThrough ? `through ${MONTHS[row.actualThrough - 1]}` : undefined)}
      {ref(`${basisYear} forecast`, row.basisForecast, "actual, then budget")}
    </>
  );
}

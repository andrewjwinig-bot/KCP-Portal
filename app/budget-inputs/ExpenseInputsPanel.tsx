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
import { EXPENSE_INPUT_LABEL, spreadLike, type ExpenseInputKind } from "@/lib/financials/budgets/expenseInputs";
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
          <th style={th} />
        </tr>
      </thead>
      <tbody>
        {rows.map((p, pi) => (
          <Fragment key={p.code}>
            {/* The property band — left out when the master page already
                names the one property on screen. */}
            {(!embedded || p.missingBasis) && (
              <tr style={{ background: "rgba(11,74,125,0.07)", borderTop: pi ? "2px solid var(--border)" : "none" }}>
                <td style={{ ...tdL, paddingTop: 10, paddingBottom: 10, whiteSpace: "normal" }} colSpan={15}>
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
  const monthly = row.kind === "building-maintenance";
  const [cells, setCells] = useState<string[]>(() => row.months.map((v) => String(v)));
  const [annual, setAnnual] = useState<string>(() => String(sum(row.months)));
  const [busy, setBusy] = useState(false);
  // Follow the server after a save or a reload.
  useEffect(() => { setCells(row.months.map((v) => String(v))); setAnnual(String(sum(row.months))); }, [row.months]);

  const cellNums = cells.map((c) => Number(c.replace(/[,$\s]/g, "")) || 0);
  const dirtyMonths = monthly && cellNums.some((v, i) => v !== row.months[i]);
  const annualNum = Number(annual.replace(/[,$\s]/g, "")) || 0;
  const dirtyAnnual = !monthly && annualNum !== sum(row.months);
  // What the months WILL be once the annual is saved — shown live, so the
  // spread is read before it is committed.
  const shown = monthly ? cellNums : dirtyAnnual ? spreadLike(annualNum, row.basisForecast) : row.months;

  const status = row.entered
    ? <Pill tone={TONE_GREEN}>ENTERED</Pill>
    : row.kind === "ret" ? <Pill tone={TONE_BLUE}>DEFAULT +3%</Pill> : <Pill tone={TONE_NEUTRAL}>NOT YET</Pill>;

  async function commit(body: { annual?: number; months?: number[]; clear?: boolean }) {
    setBusy(true);
    await onSave(code, row.kind, body);
    setBusy(false);
  }

  const ref = (label: string, months: number[], note?: string) => (
    <tr style={{ color: "var(--muted)" }}>
      <td style={{ ...tdL, fontSize: 12, paddingTop: 3, paddingBottom: 3, paddingLeft: 26 }}>{label}{note ? <span style={{ marginLeft: 6, fontSize: 11 }}>{note}</span> : null}</td>
      {months.map((v, i) => <td key={i} style={{ ...td, fontSize: 12, paddingTop: 3, paddingBottom: 3 }}>{num(v)}</td>)}
      <td style={{ ...td, fontSize: 12, paddingTop: 3, paddingBottom: 3, fontWeight: 700 }}>{money0(sum(months))}</td>
      <td />
    </tr>
  );

  return (
    <>
      <tr style={{ borderTop: "1px solid var(--border)" }}>
        <td style={{ ...tdL, whiteSpace: "normal", minWidth: 190 }}>
          <div style={{ fontWeight: 700 }}>{EXPENSE_INPUT_LABEL[row.kind]} {status}</div>
          <div className="muted" style={{ fontSize: 11.5 }}>
            {OWNER[row.kind]} · {monthly ? "twelve months" : "annual, spread like this year"}
            {row.lines.length > 1 ? ` · lands on ${row.lines.join(", ")}` : ""}
          </div>
        </td>
        {shown.map((v, i) => (
          <td key={i} style={{ ...td, paddingLeft: 4, paddingRight: 4 }}>
            {monthly && row.editable ? (
              <input value={cells[i]} inputMode="numeric" aria-label={`${MONTHS[i]} ${year}`} style={cellIn}
                onChange={(e) => setCells((c) => c.map((x, j) => (j === i ? e.target.value : x)))} />
            ) : <span style={{ fontWeight: 600 }}>{num(v)}</span>}
          </td>
        ))}
        <td style={{ ...td, fontWeight: 800 }}>
          {!monthly && row.editable ? (
            <input value={annual} inputMode="numeric" aria-label={`Annual ${EXPENSE_INPUT_LABEL[row.kind]}`} style={{ ...cellIn, width: 96, fontWeight: 800 }}
              onChange={(e) => setAnnual(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && dirtyAnnual) commit({ annual: annualNum }); }} />
          ) : money0(sum(shown))}
        </td>
        <td style={{ ...td, whiteSpace: "nowrap" }}>
          {row.editable && (
            <div style={{ display: "inline-flex", gap: 6 }}>
              {(dirtyMonths || dirtyAnnual) ? (
                <button className="btn primary" disabled={busy} style={{ fontSize: 12, padding: "4px 12px" }}
                  onClick={() => commit(monthly ? { months: cellNums } : { annual: annualNum })}>{busy ? "Saving…" : "Save"}</button>
              ) : !row.entered ? (
                // Accept the figure as it stands — the default IS the answer
                // for most properties, and that should be one click.
                <button className="btn" disabled={busy} style={{ fontSize: 12, padding: "4px 12px" }}
                  onClick={() => commit(monthly ? { months: row.months } : { annual: sum(row.months) })}
                  title="Keep this figure and mark it entered">{busy ? "…" : "Accept"}</button>
              ) : (
                <button className="btn" disabled={busy} style={{ fontSize: 12, padding: "4px 12px" }}
                  onClick={() => commit({ clear: true })} title="Clear the entered figure and go back to the default">Reset</button>
              )}
            </div>
          )}
        </td>
      </tr>
      {ref(`${basisYear} budget`, row.basisBudget)}
      {ref(`${basisYear} actual`, row.basisActual, row.actualThrough ? `through ${MONTHS[row.actualThrough - 1]}` : undefined)}
      {ref(`${basisYear} forecast`, row.basisForecast, "actual, then budget")}
    </>
  );
}

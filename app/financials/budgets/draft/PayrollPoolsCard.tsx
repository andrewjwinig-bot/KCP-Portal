"use client";

// PAYROLL, ENTERED ONCE FOR THE BOOK (`lib/financials/budgets/payrollPools.ts`).
// Maintenance Salaries and Salaries & Wages are one total each for the
// shopping centres, allocated by each property's share — so the total is typed
// here, once, and every property's line in the grid below is its share of it.
// Styled as one of the grid's section cards so it reads as part of the budget.

import { Fragment, useCallback, useEffect, useState } from "react";
import { Pill, TONE_GREEN, TONE_NEUTRAL } from "@/app/components/Pill";
import { HoverCard } from "@/app/components/HoverCard";

type Block = {
  key: string; label: string; gl: string; priorTotal: number; annual: number; entered: boolean;
  by: string | null; at: string | null; note?: string;
  split: { code: string; sharePct: number; amount: number }[];
};
type Resp = { year: number; basisYear: number; blocks: Block[]; canEdit: boolean };

const money0 = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const pct = (n: number) => `${n.toFixed(2)}%`;
const num: React.CSSProperties = { textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", verticalAlign: "middle" };

export function PayrollPoolsCard({ year, bookId, bookName, propertyCode, queued, onSaved }: {
  year: number; bookId: string; bookName: string; propertyCode: string;
  /** The draft page's write queue — every store write goes through it. */
  queued: <T,>(fn: () => Promise<T>) => Promise<T>;
  /** After a save — the page re-projects the draft. */
  onSaved: () => void;
}) {
  const [data, setData] = useState<Resp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => {
    fetch(`/api/financials/budgets/payroll-pools?year=${year}&book=${bookId}`, { cache: "no-store" })
      .then((r) => r.json()).then((j) => { if (!j.error) setData(j); }).catch(() => {});
  }, [year, bookId]);
  useEffect(() => { load(); }, [load]);

  const save = async (key: string, annual: number | null) => {
    setErr(null);
    const r = await queued(() => fetch("/api/financials/budgets/payroll-pools", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, book: bookId, key, annual }),
    })).catch(() => null);
    if (!r || !r.ok) { const j = r ? await r.json().catch(() => ({})) : {}; setErr(j?.error ?? "Couldn't save that total."); return; }
    load(); onSaved();
  };

  if (!data?.blocks.length) return null;
  const code = propertyCode.toUpperCase();
  return (
    <div id="payroll-pools" className="card" style={{ padding: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 14px", borderBottom: "1px solid var(--border)", background: "rgba(15,23,42,0.03)" }}>
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase" }}>Payroll — one total for {bookName}, allocated by share</span>
        <span className="muted small">From the {data.year} payroll budget · entered once, every property&rsquo;s line is its share</span>
      </div>
      {err && <div className="small" style={{ color: "#b91c1c", fontWeight: 700, padding: "8px 14px" }}>{err}</div>}
      <div className="tableWrap" style={{ marginTop: 0 }}>
        <table style={{ width: "100%", minWidth: 760 }}>
          <thead>
            <tr>
              <th>Line</th>
              <th style={num}>{data.basisYear} budget</th>
              <th style={{ ...num, color: "var(--brand)" }}>{data.year} total</th>
              <th style={num}>{propertyCode} share</th>
              <th style={num}>{propertyCode} amount</th>
            </tr>
          </thead>
          <tbody>
            {data.blocks.map((b) => {
              const mine = b.split.find((s) => s.code.toUpperCase() === code);
              return (
                <Fragment key={b.key}>
                  <tr>
                    <td style={{ verticalAlign: "middle" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <HoverCard title={`${b.label} — ${money0(b.annual)} across ${b.split.length} properties`} width={320}
                          rows={b.split.map((s) => ({ label: `${s.code} · ${pct(s.sharePct)}`, value: money0(s.amount) }))}
                          footer={{ label: "Shares", value: `from the ${data.basisYear} budget` }}>
                          <span style={{ fontWeight: 600, borderBottom: "1px dotted var(--muted)", cursor: "default" }}>{b.label}</span>
                        </HoverCard>
                        <code style={{ fontSize: 11.5, color: "var(--muted)" }}>{b.gl}</code>
                        {b.entered
                          ? <Pill tone={TONE_GREEN}>ENTERED{b.by ? ` · ${b.by}` : ""}</Pill>
                          : <Pill tone={TONE_NEUTRAL}>{data.basisYear} +3% — NOT ENTERED</Pill>}
                      </span>
                    </td>
                    <td style={{ ...num, color: "var(--muted)" }}>{money0(b.priorTotal)}</td>
                    <td style={{ ...num, fontWeight: 800, fontSize: 14 }}>
                      {data.canEdit ? <TotalInput value={b.annual} onSave={(v) => save(b.key, v)} label={`${b.label} ${data.year} total`} /> : money0(b.annual)}
                    </td>
                    <td style={num}>{mine ? pct(mine.sharePct) : "—"}</td>
                    <td style={{ ...num, fontWeight: 700 }}>{mine ? money0(mine.amount) : "—"}</td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** The total, typed and saved on blur / Enter. Blank hands it back to +3%. */
function TotalInput({ value, onSave, label }: { value: number; onSave: (v: number | null) => void; label: string }) {
  const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
  const [v, setV] = useState(fmt(value));
  useEffect(() => { setV(fmt(value)); }, [value]);
  const commit = () => {
    const t = v.replace(/[,$\s]/g, "");
    if (t === "") { onSave(null); return; }
    const n = Math.round(Number(t));
    if (Number.isFinite(n) && n !== value) onSave(n);
  };
  return (
    <input value={v} inputMode="numeric" aria-label={label} onChange={(e) => setV(e.target.value)}
      onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      style={{ width: 120, textAlign: "right", fontWeight: 800 }} />
  );
}

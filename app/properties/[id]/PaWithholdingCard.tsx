"use client";

// PA NONRESIDENT WITHHOLDING (owner: "so we know how much to withhold when
// making distributions"). The owner's "Distribution PA NR WH" workbook on the
// property page: type the total distribution, and each partner's gross, the
// PA nonresident tax the partnership paid on their behalf (last year's
// payment + this year's estimate), and the net cheque. Payments are typed in
// the light-blue cells and saved per property per distribution year. Hidden
// for anyone the API refuses (Investor Info's editors only).

import React, { useEffect, useMemo, useRef, useState } from "react";
import { StatPill } from "../../components/Pill";
import { DownloadMenu } from "../../components/DownloadMenu";
import { th, thL, td, tdL } from "../../components/tableStyles";
import { getOwnersForProperty } from "../../../lib/properties/ownership";
import { computeWithholding, hasWithholding, SEED_YEAR, type WithholdingDoc } from "../../../lib/investors/paNrWithholding";

const money = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money0 = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const pct = (n: number, d = 4) => `${(n * 100).toFixed(d)}%`;

/** A money cell you type into; commits on blur / Enter, only when it changed. */
function MoneyInput({ value, onCommit, width = 96, bold }: { value: number; onCommit: (n: number) => void; width?: number; bold?: boolean }) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? (value ? value.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "");
  const commit = () => {
    if (text == null) return;
    const n = Math.round((Number(text.replace(/[$,\s]/g, "")) || 0) * 100) / 100;
    setText(null);
    if (n !== value) onCommit(Math.max(0, n));
  };
  return (
    <input
      value={shown}
      placeholder="0"
      inputMode="decimal"
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      style={{ width, textAlign: "right", background: "var(--input-cell)", fontWeight: bold ? 700 : undefined }}
    />
  );
}

export default function PaWithholdingCard({ code, style }: { code: string; style?: React.CSSProperties }) {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(Math.max(SEED_YEAR, thisYear));
  const [doc, setDoc] = useState<WithholdingDoc | null>(null);
  const [hidden, setHidden] = useState(!hasWithholding(code));
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const owners = useMemo(() => getOwnersForProperty(code), [code]);

  useEffect(() => {
    if (!hasWithholding(code)) return;
    let alive = true;
    setDoc(null);
    fetch(`/api/properties/${encodeURIComponent(code)}/pa-withholding?year=${year}`, { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 403 || r.status === 404) { if (alive) setHidden(true); return; }
        const j = await r.json();
        if (!alive) return;
        if (!r.ok) { setError(j?.error ?? "Couldn't load"); return; }
        setDoc(j.doc);
        setStatus(j.saved && j.doc?.updatedAt ? `Saved ${new Date(j.doc.updatedAt).toLocaleDateString("en-US")} by ${j.doc.updatedBy}` : null);
      })
      .catch(() => { if (alive) setError("Couldn't load the calculator"); });
    return () => { alive = false; };
  }, [code, year]);

  const result = useMemo(() => (doc ? computeWithholding(owners, doc) : null), [owners, doc]);
  if (hidden) return null;

  // Writes go out one at a time — the store rewrites the whole document.
  const save = (next: WithholdingDoc) => {
    setDoc(next);
    setStatus("Saving…");
    setError(null);
    queue.current = queue.current.then(async () => {
      const r = await fetch(`/api/properties/${encodeURIComponent(code)}/pa-withholding?year=${year}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) { setError(j?.error ?? "Save failed"); setStatus(null); return; }
      setStatus("Saved");
    }).catch(() => { setError("Save failed"); setStatus(null); });
  };
  const setTax = (id: string, field: "paid" | "estimate", n: number) => {
    if (!doc) return;
    const cur = doc.partners[id] ?? { paid: 0, estimate: 0 };
    save({ ...doc, partners: { ...doc.partners, [id]: { ...cur, [field]: n } } });
  };

  const years = Array.from({ length: Math.max(thisYear + 1, SEED_YEAR) - SEED_YEAR + 1 }, (_, i) => SEED_YEAR + i);
  const withheld = result ? result.rows.filter((r) => r.withholding > 0).length : 0;

  return (
    <div className="card" style={{ ...style }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: "var(--fs-11)", fontWeight: 700, letterSpacing: "0.06em", color: "var(--muted)", textTransform: "uppercase" }}>PA Nonresident Withholding</div>
          <div style={{ fontSize: "var(--fs-13)", color: "var(--muted)", marginTop: 4 }}>
            {year} distribution · each partner's {year - 1} PA NR payment + {year} estimate comes out of their share
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select className="select-sm" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <DownloadMenu items={[{ label: "Excel", description: "The worksheet, with live formulas", href: `/api/properties/${encodeURIComponent(code)}/pa-withholding?year=${year}&format=xlsx` }]} variant="default" disabled={!result} />
        </div>
      </div>

      {error && <div style={{ marginTop: 10, fontSize: "var(--fs-12)", color: "#b91c1c", fontWeight: 600 }}>{error}</div>}
      {!result ? (
        !error && <div style={{ marginTop: 12, fontSize: "var(--fs-13)", color: "var(--muted)" }}>Loading…</div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
            <span style={{ fontSize: "var(--fs-11)", fontWeight: 700, letterSpacing: "0.06em", color: "var(--muted)", textTransform: "uppercase" }}>Total distribution</span>
            <MoneyInput value={doc!.distribution} width={140} bold onCommit={(n) => save({ ...doc!, distribution: n })} />
            {status && <span style={{ fontSize: "var(--fs-12)", color: "var(--muted)" }}>{status}</span>}
          </div>
          <div className="pills" style={{ marginTop: 12 }}>
            <StatPill label="Distribution" value={money0(result.distribution)} />
            <StatPill label="Withhold" value={money(result.totals.withholding)} sub={`${withheld} of ${result.rows.length} partners`} accent="#b45309" />
            <StatPill label="Net cash to partners" value={money(result.totals.net)} total />
          </div>
          {result.short.length > 0 && (
            <div style={{ marginTop: 10, fontSize: "var(--fs-12)", color: "#b91c1c", fontWeight: 600 }}>
              {result.short.length} partner{result.short.length === 1 ? "'s" : "s'"} withholding is more than their distribution — the rest carries to the next one.
            </div>
          )}
          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thL}>Partner</th>
                  <th style={thL}>State</th>
                  <th style={th}>%</th>
                  <th style={th}>PA NR %</th>
                  <th style={th}>{year - 1} PA NR Payment</th>
                  <th style={th}>{year} NR Estimate</th>
                  <th style={th}>Gross Distribution</th>
                  <th style={th}>Withholding</th>
                  <th style={th}>Net Cash</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r) => {
                  const quiet = r.withholding === 0;
                  return (
                    <tr key={r.id}>
                      <td style={tdL}>
                        <div style={{ fontWeight: 600 }}>{r.name}</div>
                        {r.heldAs && <div style={{ fontSize: "var(--fs-11)", color: "var(--muted)" }}>{r.heldAs}</div>}
                      </td>
                      <td style={{ ...tdL, color: "var(--muted)" }}>{r.state ?? "—"}</td>
                      <td style={td}>{pct(r.pct)}</td>
                      <td style={{ ...td, color: quiet ? "var(--muted)" : undefined }}>{r.nrPct ? pct(r.nrPct, 2) : "—"}</td>
                      <td style={td}><MoneyInput value={r.paid} onCommit={(n) => setTax(r.id, "paid", n)} /></td>
                      <td style={td}><MoneyInput value={r.estimate} onCommit={(n) => setTax(r.id, "estimate", n)} /></td>
                      <td style={td}>{money(r.gross)}</td>
                      <td style={{ ...td, fontWeight: quiet ? undefined : 700, color: quiet ? "var(--muted)" : "#b45309" }}>{quiet ? "—" : money(r.withholding)}</td>
                      <td style={{ ...td, fontWeight: 700, color: result.short.includes(r.id) ? "#b91c1c" : undefined }}>{money(r.net)}</td>
                    </tr>
                  );
                })}
                <tr>
                  <td style={{ ...tdL, fontWeight: 700, borderTop: "2px solid var(--border)" }} colSpan={2}>Total</td>
                  <td style={{ ...td, fontWeight: 700, borderTop: "2px solid var(--border)" }}>{pct(result.totals.pct)}</td>
                  <td style={{ ...td, borderTop: "2px solid var(--border)" }} />
                  <td style={{ ...td, fontWeight: 700, borderTop: "2px solid var(--border)" }}>{money(result.totals.paid)}</td>
                  <td style={{ ...td, fontWeight: 700, borderTop: "2px solid var(--border)" }}>{money(result.totals.estimate)}</td>
                  <td style={{ ...td, fontWeight: 700, borderTop: "2px solid var(--border)" }}>{money(result.totals.gross)}</td>
                  <td style={{ ...td, fontWeight: 700, borderTop: "2px solid var(--border)", color: "#b45309" }}>{money(result.totals.withholding)}</td>
                  <td style={{ ...td, fontWeight: 700, borderTop: "2px solid var(--border)" }}>{money(result.totals.net)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

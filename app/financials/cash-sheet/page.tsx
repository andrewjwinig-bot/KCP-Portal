"use client";

// Cash Sheet — a monthly cash-position worksheet that works in tandem with the
// Operating Statements. Each row is an operating property (grouped by fund):
//   Starting Cash (the month's opening Operating Cash balance, from the statement)
//   − Bills to Pay (one input per Wednesday in the month — paid weekly)
//   − Reserves (a standing amount that carries month-to-month)
//   = Operational Cash (net cash available).
// Starting Cash and Operational (ending) Cash can be manually overridden.
// Bills reset each month; reserves carry forward; history is browsable by month.

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useUser } from "@/app/components/UserProvider";
import { StatPill } from "@/app/components/Pill";
import { canEditCashSheet } from "@/lib/users";
import {
  MONTHS, wednesdayLabel, monthKey, parseMonthKey, bankAccountsForCodes,
  type CashSheetGroup, type BankAccount,
} from "@/lib/financials/cash-sheet/util";

type Starting = { amount: number | null; sourceYm: string };
type Row = { reserves: number; bills: Record<string, number>; startingOverride?: number | null; endingOverride?: number | null };
type Payload = {
  ym: string; year: number; month: number;
  groups: CashSheetGroup[];
  wednesdays: string[];
  starting: Record<string, Starting>;
  rows: Record<string, Row>;
  carriedReserves: Record<string, number>;
  months: string[];
  updatedAt: string | null;
};

function money0(v: number | null): string {
  if (v == null) return "—";
  const n = Math.round(v);
  const s = Math.abs(n).toLocaleString("en-US");
  return n < 0 ? `($${s})` : `$${s}`;
}
function parseNum(s: string): number {
  const n = Number(s.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
/** Draft string → number, or null when blank (= no override). */
function parseOpt(s: string | undefined): number | null {
  if (s == null || s.trim() === "") return null;
  return parseNum(s);
}
function sourceLabel(ym: string): string {
  const p = parseMonthKey(ym);
  return p ? `${MONTHS[p.month - 1].slice(0, 3)} ${p.year}` : ym;
}

const numCell: React.CSSProperties = { textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
const cellInput: React.CSSProperties = {
  width: 96, textAlign: "right", font: "inherit", fontSize: 13,
  padding: "5px 7px", borderRadius: 6, border: "1px solid var(--border)",
  background: "var(--card)", fontVariantNumeric: "tabular-nums",
};
const cashInput: React.CSSProperties = { ...cellInput, width: 112 };
const groupHeaderCell: React.CSSProperties = {
  textAlign: "left", fontSize: 11, fontWeight: 700, textTransform: "uppercase",
  letterSpacing: "0.06em", color: "var(--muted)", background: "rgba(15,23,42,0.03)", padding: "8px 12px",
};

export default function CashSheetPage() {
  const { user } = useUser();
  const canEdit = canEditCashSheet(user.id);
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(0);

  // Editable drafts (strings) keyed by property code.
  const [billDraft, setBillDraft] = useState<Record<string, Record<string, string>>>({});
  const [resDraft, setResDraft] = useState<Record<string, string>>({});
  const [startDraft, setStartDraft] = useState<Record<string, string>>({}); // starting-cash override
  const [endDraft, setEndDraft] = useState<Record<string, string>>({});     // operational (ending) override

  const ym = monthKey(year, month);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/financials/cash-sheet?ym=${ym}`)
      .then((r) => r.json())
      .then((j: Payload) => {
        setData(j);
        // Seed drafts: saved value → carried reserve → blank.
        const bd: Record<string, Record<string, string>> = {};
        const rd: Record<string, string> = {};
        const sd: Record<string, string> = {};
        const ed: Record<string, string> = {};
        for (const g of j.groups) for (const p of g.properties) {
          const row = j.rows[p.code];
          bd[p.code] = {};
          for (const w of j.wednesdays) {
            const v = row?.bills?.[w];
            bd[p.code][w] = v ? String(v) : "";
          }
          const res = row?.reserves ?? j.carriedReserves[p.code] ?? 0;
          rd[p.code] = res ? String(res) : "";
          sd[p.code] = row?.startingOverride != null ? String(row.startingOverride) : "";
          ed[p.code] = row?.endingOverride != null ? String(row.endingOverride) : "";
        }
        // Pooled funds hold their cash (starting/operational overrides) under the
        // fund-level GL code, not a property — seed those drafts too.
        for (const g of j.groups) {
          if (!g.fundCashCode) continue;
          const row = j.rows[g.fundCashCode];
          sd[g.fundCashCode] = row?.startingOverride != null ? String(row.startingOverride) : "";
          ed[g.fundCashCode] = row?.endingOverride != null ? String(row.endingOverride) : "";
        }
        setBillDraft(bd);
        setResDraft(rd);
        setStartDraft(sd);
        setEndDraft(ed);
        setError(null);
      })
      .catch((e) => setError(e?.message ?? "Failed to load"))
      .finally(() => setLoading(false));
  }, [ym]);

  useEffect(() => { load(); }, [load]);

  async function save(body: Record<string, unknown>) {
    setSaving((s) => s + 1);
    try {
      const res = await fetch("/api/financials/cash-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, ym }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Save failed");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving((s) => s - 1);
    }
  }

  function commitBill(code: string, wed: string) {
    save({ code, kind: "bill", wednesday: wed, value: parseNum(billDraft[code]?.[wed] ?? "") });
  }
  function commitReserves(code: string) {
    save({ code, kind: "reserves", value: parseNum(resDraft[code] ?? "") });
  }
  function commitStarting(code: string) {
    save({ code, kind: "startingOverride", value: parseOpt(startDraft[code]) });
  }
  function commitEnding(code: string) {
    save({ code, kind: "endingOverride", value: parseOpt(endDraft[code]) });
  }

  function prevMonth() { if (month === 1) { setYear((y) => y - 1); setMonth(12); } else setMonth((m) => m - 1); }
  function nextMonth() { if (month === 12) { setYear((y) => y + 1); setMonth(1); } else setMonth((m) => m + 1); }
  const isThisMonth = year === today.getFullYear() && month === today.getMonth() + 1;

  // ── Per-row derived figures (live from drafts; overrides win) ──
  const wednesdays = data?.wednesdays ?? [];
  function rowBillsTotal(code: string): number {
    const b = billDraft[code] ?? {};
    return wednesdays.reduce((a, w) => a + parseNum(b[w] ?? ""), 0);
  }
  function rowReserves(code: string): number { return parseNum(resDraft[code] ?? ""); }
  function autoStarting(code: string): number | null { return data?.starting[code]?.amount ?? null; }
  function rowStarting(code: string): number | null {
    const ov = parseOpt(startDraft[code]);
    return ov != null ? ov : autoStarting(code);
  }
  function computedOperational(code: string): number | null {
    const s = rowStarting(code);
    if (s == null) return null;
    return s - rowBillsTotal(code) - rowReserves(code);
  }
  function rowOperational(code: string): number | null {
    const ov = parseOpt(endDraft[code]);
    return ov != null ? ov : computedOperational(code);
  }

  // ── Group + grand totals ──
  type Totals = { starting: number; bills: number; reserves: number; operational: number; hasStarting: boolean };
  // Fund-level operational cash (pooled funds): the fund's opening − the whole
  // fund's bills − reserves. Null when there's no opening to start from.
  function fundComputedOperational(g: CashSheetGroup): number | null {
    const code = g.fundCashCode!;
    const s = rowStarting(code);
    if (s == null) return null;
    const bills = g.properties.reduce((a, p) => a + rowBillsTotal(p.code), 0);
    const reserves = g.properties.reduce((a, p) => a + rowReserves(p.code), 0);
    return s - bills - reserves;
  }
  // Totals for one group. A pooled fund's cash comes from its ONE fund account
  // (PJV3, …); the buildings contribute only bills + reserves. A per-property
  // group sums each property's own cash.
  function groupTotals(g: CashSheetGroup): Totals {
    const bills = g.properties.reduce((a, p) => a + rowBillsTotal(p.code), 0);
    const reserves = g.properties.reduce((a, p) => a + rowReserves(p.code), 0);
    if (g.fundCashCode) {
      const s = rowStarting(g.fundCashCode);
      const endOv = parseOpt(endDraft[g.fundCashCode]);
      const operational = endOv != null ? endOv : (s == null ? 0 : s - bills - reserves);
      return { starting: s ?? 0, bills, reserves, operational, hasStarting: s != null || endOv != null };
    }
    let starting = 0, operational = 0, hasStarting = false;
    for (const p of g.properties) {
      const s = rowStarting(p.code);
      const op = rowOperational(p.code);
      if (s != null) { starting += s; hasStarting = true; }
      if (op != null) operational += op;
    }
    return { starting, bills, reserves, operational, hasStarting };
  }
  // Building codes only (per-Wednesday bill totals in the footer).
  const allCodes = useMemo(
    () => (data?.groups ?? []).flatMap((g) => g.properties.map((p) => p.code)),
    [data],
  );
  const grand = (() => {
    let starting = 0, bills = 0, reserves = 0, operational = 0, hasStarting = false;
    for (const g of data?.groups ?? []) {
      const t = groupTotals(g);
      bills += t.bills; reserves += t.reserves;
      if (t.hasStarting) { starting += t.starting; operational += t.operational; hasStarting = true; }
    }
    return { starting, bills, reserves, operational, hasStarting };
  })();

  const colCount = 2 + wednesdays.length + 3; // property + starting + weds + (total bills, reserves, operational)

  return (
    <main style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Cash Sheet</h1>
          <p className="muted small" style={{ margin: 0 }}>
            Bills paid to AvidXchange each Wednesday and any Reserves are subtracted to get net Operational Cash — Starting Cash is the month&apos;s opening{" "}
            <Link href="/financials/operating-statements" style={{ color: "var(--brand)", fontWeight: 600 }}>Operating Cash</Link>{" "}
            balance Per the Detailed General Ledger and may not tie to the bank statement exactly.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button className="btn" onClick={prevMonth} style={{ padding: "6px 12px", fontWeight: 900 }}>←</button>
          <span style={{ fontWeight: 800, fontSize: 15, minWidth: 150, textAlign: "center" }}>{MONTHS[month - 1]} {year}</span>
          <button className="btn" onClick={nextMonth} style={{ padding: "6px 12px", fontWeight: 900 }}>→</button>
          {!isThisMonth && (
            <button className="btn" onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth() + 1); }} style={{ fontSize: 12, padding: "6px 9px" }}>This month</button>
          )}
        </div>
      </div>

      {!canEdit && (
        <div className="small" style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(11,74,125,0.06)", border: "1px solid rgba(11,74,125,0.25)", color: "#0b4a7d", fontWeight: 600 }}>
          View-only — you can browse the Cash Sheet but not edit it.
        </div>
      )}

      {/* Portfolio KPI pills */}
      <div className="pills" style={{ justifyContent: "flex-start" }}>
        <StatPill label="Starting Cash · Portfolio" value={money0(grand.hasStarting ? grand.starting : null)} accent="#0b4a7d" />
        <StatPill label="Bills to Pay · Month" value={money0(grand.bills)} accent={grand.bills > 0 ? "#b45309" : undefined} />
        <StatPill label="Reserves · Portfolio" value={money0(grand.reserves)} accent={grand.reserves > 0 ? "#6d28d9" : undefined} />
        <StatPill label="Operational Cash · Net" value={money0(grand.hasStarting ? grand.operational : null)} accent={grand.operational >= 0 ? "#15803d" : "#b91c1c"} />
      </div>

      {error && <div className="small" style={{ color: "#b91c1c", fontWeight: 700 }}>· {error}</div>}

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="tableWrap" style={{ overflowX: "auto" }}>
          <table style={{ minWidth: 720 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", minWidth: 200 }}>Property</th>
                <th style={numCell}>Starting Cash</th>
                {wednesdays.map((w) => (
                  <th key={w} style={numCell} title={`Bills paid ${w}`}>{wednesdayLabel(w)}</th>
                ))}
                <th style={numCell}>Total Bills</th>
                <th style={numCell}>Reserves</th>
                <th style={numCell}>Operational Cash</th>
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <tr><td colSpan={colCount} className="muted small" style={{ padding: 18 }}>Loading…</td></tr>
              ) : (data?.groups ?? []).map((g) => {
                const gt = groupTotals(g);
                const pooled = !!g.fundCashCode;
                const fc = g.fundCashCode ?? "";
                const fundAuto = pooled ? autoStarting(fc) : null;
                const fundStartOverridden = pooled && parseOpt(startDraft[fc]) != null;
                const fundEndOverridden = pooled && parseOpt(endDraft[fc]) != null;
                const fundCompOp = pooled ? fundComputedOperational(g) : null;
                return (
                  <Fragment key={g.id}>
                    {/* Group header */}
                    <tr>
                      <td colSpan={colCount} style={groupHeaderCell}>
                        {g.label}
                        {pooled && <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 600 }}> · one fund account · <code style={{ fontSize: 11 }}>{fc}</code></span>}
                      </td>
                    </tr>
                    {/* Property / building rows */}
                    {g.properties.map((p) => {
                      const auto = autoStarting(p.code);
                      const starting = rowStarting(p.code);
                      const src = data?.starting[p.code]?.sourceYm;
                      const op = rowOperational(p.code);
                      const startOverridden = parseOpt(startDraft[p.code]) != null;
                      const endOverridden = parseOpt(endDraft[p.code]) != null;
                      return (
                        <tr key={p.code}>
                          <td style={{ textAlign: "left" }}>
                            <div>
                              <code style={{ fontSize: 12 }}>{p.code}</code>
                              <span style={{ marginLeft: 8 }}>{p.name}</span>
                            </div>
                            {/* Per-property accounts; pooled-fund buildings share the fund's account (shown on the fund row). */}
                            {!pooled && <BankLinks accounts={bankAccountsForCodes([p.code])} />}
                          </td>
                          {/* Starting Cash — blank for pooled-fund buildings (cash is at the fund) */}
                          <td style={numCell} title={pooled ? "Cash is held in the fund account — see the fund row below" : (src ? `Opening balance · ${sourceLabel(src)} (Per GL)${startOverridden ? " · overridden" : ""}` : undefined)}>
                            {pooled ? (
                              <span className="muted">—</span>
                            ) : canEdit ? (
                              <input
                                style={{ ...cashInput, ...(startOverridden ? { borderColor: "#b45309", fontWeight: 700 } : {}) }}
                                inputMode="decimal"
                                placeholder={auto != null ? money0(auto) : "—"}
                                value={startDraft[p.code] ?? ""}
                                onChange={(e) => setStartDraft((d) => ({ ...d, [p.code]: e.target.value }))}
                                onBlur={() => commitStarting(p.code)}
                                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                              />
                            ) : starting == null
                              ? <span className="muted">—</span>
                              : <span style={startOverridden ? { color: "#b45309", fontWeight: 700 } : undefined}>{money0(starting)}</span>}
                          </td>
                          {wednesdays.map((w) => (
                            <td key={w} style={numCell}>
                              <input
                                style={cellInput}
                                inputMode="decimal"
                                placeholder="—"
                                disabled={!canEdit}
                                value={billDraft[p.code]?.[w] ?? ""}
                                onChange={(e) => setBillDraft((d) => ({ ...d, [p.code]: { ...d[p.code], [w]: e.target.value } }))}
                                onBlur={() => commitBill(p.code, w)}
                                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                              />
                            </td>
                          ))}
                          <td style={{ ...numCell, fontWeight: 600 }}>{money0(rowBillsTotal(p.code))}</td>
                          <td style={numCell}>
                            <input
                              style={cellInput}
                              inputMode="decimal"
                              placeholder="—"
                              disabled={!canEdit}
                              value={resDraft[p.code] ?? ""}
                              onChange={(e) => setResDraft((d) => ({ ...d, [p.code]: e.target.value }))}
                              onBlur={() => commitReserves(p.code)}
                              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                            />
                          </td>
                          {/* Operational Cash — blank for pooled-fund buildings (computed at the fund) */}
                          <td style={numCell} title={pooled ? "Operational cash is computed for the fund — see the fund row below" : (endOverridden ? "Overridden — clear to use the computed value" : "Starting − bills − reserves")}>
                            {pooled ? (
                              <span className="muted">—</span>
                            ) : canEdit ? (
                              <input
                                style={{ ...cashInput, fontWeight: 800, color: op == null ? undefined : op >= 0 ? "#15803d" : "#b91c1c", ...(endOverridden ? { borderColor: "#b45309" } : {}) }}
                                inputMode="decimal"
                                placeholder={computedOperational(p.code) != null ? money0(computedOperational(p.code)) : "—"}
                                value={endDraft[p.code] ?? ""}
                                onChange={(e) => setEndDraft((d) => ({ ...d, [p.code]: e.target.value }))}
                                onBlur={() => commitEnding(p.code)}
                                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                              />
                            ) : (
                              <span style={{ fontWeight: 800, color: op == null ? "var(--muted)" : op >= 0 ? "#15803d" : "#b91c1c" }}>{money0(op)}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {/* Subtotal — for a pooled fund this IS the bank account: the
                        fund's Starting + Operational cash live here (overridable). */}
                    <tr style={{ fontWeight: 700, color: "var(--muted)", ...(pooled ? { background: "rgba(11,74,125,0.05)" } : {}) }}>
                      <td style={{ textAlign: "left", fontSize: 12 }}>
                        {g.label} {pooled ? "· fund account" : "subtotal"}
                        {/* Pooled fund's shared bank account(s) live on this row. */}
                        {pooled && <BankLinks accounts={bankAccountsForCodes(g.properties.map((p) => p.code))} />}
                      </td>
                      <td style={numCell} title={pooled ? (data?.starting[fc]?.sourceYm ? `Fund opening balance · ${sourceLabel(data.starting[fc].sourceYm)} (Per GL · ${fc})${fundStartOverridden ? " · overridden" : ""}` : `Fund account ${fc}`) : undefined}>
                        {pooled
                          ? (canEdit
                              ? <input
                                  style={{ ...cashInput, fontWeight: 700, ...(fundStartOverridden ? { borderColor: "#b45309" } : {}) }}
                                  inputMode="decimal"
                                  placeholder={fundAuto != null ? money0(fundAuto) : "—"}
                                  value={startDraft[fc] ?? ""}
                                  onChange={(e) => setStartDraft((d) => ({ ...d, [fc]: e.target.value }))}
                                  onBlur={() => commitStarting(fc)}
                                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                />
                              : (gt.hasStarting ? <span style={fundStartOverridden ? { color: "#b45309" } : undefined}>{money0(gt.starting)}</span> : <span className="muted">—</span>))
                          : (gt.hasStarting ? money0(gt.starting) : "—")}
                      </td>
                      {wednesdays.map((w) => <td key={w} style={numCell} />)}
                      <td style={numCell}>{money0(gt.bills)}</td>
                      <td style={numCell}>{money0(gt.reserves)}</td>
                      <td style={numCell} title={pooled ? (fundEndOverridden ? "Overridden — clear to use the computed value" : "Fund opening − all building bills − reserves") : undefined}>
                        {pooled
                          ? (canEdit
                              ? <input
                                  style={{ ...cashInput, fontWeight: 800, color: gt.operational >= 0 ? "#15803d" : "#b91c1c", ...(fundEndOverridden ? { borderColor: "#b45309" } : {}) }}
                                  inputMode="decimal"
                                  placeholder={fundCompOp != null ? money0(fundCompOp) : "—"}
                                  value={endDraft[fc] ?? ""}
                                  onChange={(e) => setEndDraft((d) => ({ ...d, [fc]: e.target.value }))}
                                  onBlur={() => commitEnding(fc)}
                                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                />
                              : <span style={{ fontWeight: 800, color: gt.hasStarting ? (gt.operational >= 0 ? "#15803d" : "#b91c1c") : "var(--muted)" }}>{gt.hasStarting ? money0(gt.operational) : "—"}</span>)
                          : (gt.hasStarting ? money0(gt.operational) : "—")}
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
            {data && (
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 800, background: "rgba(11,74,125,0.05)" }}>
                  <td style={{ textAlign: "left" }}>Portfolio Total</td>
                  <td style={numCell}>{money0(grand.hasStarting ? grand.starting : null)}</td>
                  {wednesdays.map((w) => (
                    <td key={w} style={numCell}>
                      {money0(allCodes.reduce((a, c) => a + parseNum(billDraft[c]?.[w] ?? ""), 0))}
                    </td>
                  ))}
                  <td style={numCell}>{money0(grand.bills)}</td>
                  <td style={numCell}>{money0(grand.reserves)}</td>
                  <td style={{ ...numCell, color: grand.operational >= 0 ? "#15803d" : "#b91c1c" }}>
                    {money0(grand.hasStarting ? grand.operational : null)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <p className="muted small" style={{ margin: 0 }}>
        {canEdit
          ? (saving > 0 ? "Saving…" : data?.updatedAt ? `Saved · last edit ${new Date(data.updatedAt).toLocaleString()}` : "Edits save automatically.")
          : "View-only access."}
        {" · "}Bills reset each month; reserves carry forward. Starting/Operational cash can be overridden{canEdit ? " (amber border = overridden; clear the field to revert)" : ""}.
      </p>
    </main>
  );
}

// Bank-account chips (from Property Info) — click to open the bank login for
// that account, so the accounts behind each row are trackable from the sheet.
function BankLinks({ accounts }: { accounts: BankAccount[] }) {
  if (!accounts.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 3 }}>
      {accounts.map((a, i) => (
        <a
          key={i}
          href={a.link}
          target="_blank"
          rel="noreferrer"
          title={`${a.bank} · ${a.label}`}
          style={{ fontSize: 11, fontWeight: 700, color: "#0b4a7d", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 3 }}
          onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
          onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
        >
          {a.bank} {a.last4}<span aria-hidden style={{ fontSize: 9, opacity: 0.7 }}>↗</span>
        </a>
      ))}
    </div>
  );
}


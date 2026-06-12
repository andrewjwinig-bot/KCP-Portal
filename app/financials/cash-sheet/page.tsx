"use client";

// Cash Sheet — a monthly cash-position worksheet that works in tandem with the
// Operating Statements. Each row is an operating property (grouped by fund):
//   Starting Cash (the month's opening Operating Cash balance, from the statement)
//   − Bills to Pay (one input per Wednesday in the month — paid weekly)
//   − Reserves (a standing amount that carries month-to-month)
//   = Operational Cash (net cash available).
// Starting Cash and Operational (ending) Cash can be manually overridden.
// Bills reset each month; reserves carry forward; history is browsable by month.

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useUser } from "@/app/components/UserProvider";
import { StatPill } from "@/app/components/Pill";
import { canEditCashSheet } from "@/lib/users";
import {
  MONTHS, weekOfLabel, visibleWednesdays, monthKey, parseMonthKey, bankAccountsForCodes,
  type CashSheetGroup, type BankAccount,
} from "@/lib/financials/cash-sheet/util";

type Starting = { amount: number | null; sourceYm: string };
type Row = { reserves: number; bills: Record<string, number>; startingOverride?: number | null; endingOverride?: number | null };
type MgmtFeeRow = { code: string; name: string; revenue: number; feePct: number; fee: number };
type ReserveDetail = { windowMonths: number[]; lines: { label: string; amounts: number[] }[]; total: number };
type Payload = {
  ym: string; year: number; month: number;
  groups: CashSheetGroup[];
  wednesdays: string[];
  starting: Record<string, Starting>;
  /** Anticipated monthly gross billings per property code (from the rent roll). */
  revenue: Record<string, number>;
  /** Per-property management fees behind LIK's (2010) revenue. */
  mgmtFee: MgmtFeeRow[];
  /** Auto reserve per property code — budget "Big Projects" over the next 3
   *  months (this month + 2). */
  reservesAuto: Record<string, number>;
  /** Per-property reserve breakdown (the Big Projects lines behind the total). */
  reserveDetail: Record<string, ReserveDetail>;
  /** Scheduled mortgage P&I payment per cash-sheet code (from the debt tracker). */
  mortgage: Record<string, number>;
  rows: Record<string, Row>;
  months: string[];
  updatedAt: string | null;
};

function money0(v: number | null): string {
  if (v == null) return "—";
  const n = Math.round(v);
  const s = Math.abs(n).toLocaleString("en-US");
  return n < 0 ? `($${s})` : `$${s}`;
}
/** Bill-input display value — currency with commas, rounded to the dollar. */
function fmtBillDraft(v: number): string {
  return v ? `$${Math.round(v).toLocaleString("en-US")}` : "";
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
// Editable cells read like plain text — borderless + transparent — and only show
// a field outline on hover/focus (the `cs-edit` class in globals.css).
const cellInput: React.CSSProperties = {
  width: 96, textAlign: "right", font: "inherit", fontSize: 13,
  padding: "5px 7px", borderRadius: 6, border: "1px solid transparent",
  background: "transparent", fontVariantNumeric: "tabular-nums",
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
  const [mgmtOpen, setMgmtOpen] = useState(false); // LIK management-fee breakdown modal
  const [reserveModal, setReserveModal] = useState<{ code: string; name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(0);
  const apRef = useRef<HTMLInputElement | null>(null);
  const [apUploading, setApUploading] = useState(false);
  const [apSummary, setApSummary] = useState<{ wednesday: string; total: number; count: number } | null>(null);

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
        // Seed drafts. Reserves/starting/ending are overrides — blank = use the
        // auto value; only a saved override prefills the field.
        const bd: Record<string, Record<string, string>> = {};
        const rd: Record<string, string> = {};
        const sd: Record<string, string> = {};
        const ed: Record<string, string> = {};
        for (const g of j.groups) for (const p of g.properties) {
          const row = j.rows[p.code];
          bd[p.code] = {};
          for (const w of j.wednesdays) {
            bd[p.code][w] = fmtBillDraft(row?.bills?.[w] ?? 0);
          }
          rd[p.code] = row?.reserves != null ? String(row.reserves) : "";
          sd[p.code] = row?.startingOverride != null ? String(row.startingOverride) : "";
          ed[p.code] = row?.endingOverride != null ? String(row.endingOverride) : "";
        }
        // Pooled funds hold their cash (starting/operational overrides) AND their
        // weekly bills under the fund-level code, not a property — seed those too.
        for (const g of j.groups) {
          if (!g.fundCashCode) continue;
          const row = j.rows[g.fundCashCode];
          sd[g.fundCashCode] = row?.startingOverride != null ? String(row.startingOverride) : "";
          ed[g.fundCashCode] = row?.endingOverride != null ? String(row.endingOverride) : "";
          bd[g.fundCashCode] = {};
          for (const w of j.wednesdays) {
            bd[g.fundCashCode][w] = fmtBillDraft(row?.bills?.[w] ?? 0);
          }
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

  // AP AutoPay Selections Reports → auto-fill the week's bill column. Drop the
  // weekly files (JV III, NI LLC, Condo, all-other); the server parses each,
  // maps every property's payment total to its bill cell for the report's week.
  async function onApUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length) return;
    setApUploading(true); setApSummary(null); setError(null);
    try {
      const fd = new FormData();
      for (const f of Array.from(files)) fd.append("files", f);
      const res = await fetch("/api/financials/cash-sheet/ap-upload", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "Upload failed");
      const pm = parseMonthKey(String(j.wednesday).slice(0, 7));
      if (pm && (pm.year !== year || pm.month !== month)) { setYear(pm.year); setMonth(pm.month); }
      setApSummary({ wednesday: j.wednesday, total: j.total, count: (j.filled ?? []).length });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setApUploading(false);
      if (apRef.current) apRef.current.value = "";
    }
  }

  function commitBill(code: string, wed: string) {
    const n = Math.round(parseNum(billDraft[code]?.[wed] ?? ""));
    setBillDraft((d) => ({ ...d, [code]: { ...d[code], [wed]: fmtBillDraft(n) } }));
    save({ code, kind: "bill", wednesday: wed, value: n });
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
  // Reserves are auto-derived from the budget (Big Projects, next 3 months) and
  // overridable per property: a typed value wins, blank uses the auto value.
  function autoReserve(code: string): number | null { return data?.reservesAuto?.[code.toUpperCase()] ?? null; }
  function rowReserves(code: string): number {
    const ov = parseOpt(resDraft[code]);
    return ov != null ? ov : (autoReserve(code) ?? 0);
  }
  function autoStarting(code: string): number | null { return data?.starting[code]?.amount ?? null; }
  function rowStarting(code: string): number | null {
    const ov = parseOpt(startDraft[code]);
    return ov != null ? ov : autoStarting(code);
  }
  // Anticipated revenue (rent-roll gross billings) is keyed by property code,
  // uppercased on the server, and read-only here — click it to open the rent
  // roll for that property/month. Pooled funds have no rent roll of their own,
  // so the fund's value is the sum of its buildings' revenue.
  function rowRevenue(code: string): number | null { return data?.revenue?.[code.toUpperCase()] ?? null; }
  function fundRevenue(g: CashSheetGroup): number | null {
    let sum = 0, has = false;
    for (const p of g.properties) { const r = rowRevenue(p.code); if (r != null) { sum += r; has = true; } }
    return has ? sum : null;
  }
  // Scheduled mortgage P&I from the debt tracker — a known monthly outflow.
  // Keyed by cash-sheet code (shopping centers to themselves; JV III / NI LLC to
  // their fund). Read-only; pooled-fund mortgage sits on the fund row.
  function rowMortgage(code: string): number { return data?.mortgage?.[code.toUpperCase()] ?? 0; }
  function computedOperational(code: string): number | null {
    const s = rowStarting(code);
    if (s == null) return null;
    return s + (rowRevenue(code) ?? 0) - rowBillsTotal(code) - rowMortgage(code) - rowReserves(code);
  }
  function rowOperational(code: string): number | null {
    const ov = parseOpt(endDraft[code]);
    return ov != null ? ov : computedOperational(code);
  }

  // ── Group + grand totals ──
  type Totals = { starting: number; revenue: number; bills: number; mortgage: number; reserves: number; operational: number; hasStarting: boolean };
  // Fund-level operational cash (pooled funds): opening + anticipated revenue −
  // the whole fund's bills − mortgage − reserves. Null when no opening to start.
  function fundComputedOperational(g: CashSheetGroup): number | null {
    const code = g.fundCashCode!;
    const s = rowStarting(code);
    if (s == null) return null;
    const reserves = g.properties.reduce((a, p) => a + rowReserves(p.code), 0);
    return s + (fundRevenue(g) ?? 0) - rowBillsTotal(code) - rowMortgage(code) - reserves;
  }
  // Totals for one group. A pooled fund's cash comes from its ONE fund account
  // (PJV3, …): the fund carries the bills (one AP run) + mortgage; the buildings
  // contribute only reserves + rent-roll revenue. A per-property group sums each
  // property's own cash.
  function groupTotals(g: CashSheetGroup): Totals {
    const bills = g.fundCashCode ? rowBillsTotal(g.fundCashCode) : g.properties.reduce((a, p) => a + rowBillsTotal(p.code), 0);
    const reserves = g.properties.reduce((a, p) => a + rowReserves(p.code), 0);
    if (g.fundCashCode) {
      const s = rowStarting(g.fundCashCode);
      const revenue = fundRevenue(g) ?? 0;
      const mortgage = rowMortgage(g.fundCashCode);
      const endOv = parseOpt(endDraft[g.fundCashCode]);
      const operational = endOv != null ? endOv : (s == null ? 0 : s + revenue - bills - mortgage - reserves);
      return { starting: s ?? 0, revenue, bills, mortgage, reserves, operational, hasStarting: s != null || endOv != null };
    }
    let starting = 0, revenue = 0, mortgage = 0, operational = 0, hasStarting = false;
    for (const p of g.properties) {
      const s = rowStarting(p.code);
      const r = rowRevenue(p.code);
      const op = rowOperational(p.code);
      mortgage += rowMortgage(p.code);
      if (r != null) revenue += r;
      if (s != null) { starting += s; hasStarting = true; }
      if (op != null) operational += op;
    }
    return { starting, revenue, bills, mortgage, reserves, operational, hasStarting };
  }
  // Building codes only (per-Wednesday bill totals in the footer).
  const allCodes = useMemo(
    () => (data?.groups ?? []).flatMap((g) => g.properties.map((p) => p.code)),
    [data],
  );
  // Codes that carry weekly bills: per-property rows + the pooled-fund codes
  // (where the fund's bills live). Used for the per-Wednesday footer totals.
  const billCodes = useMemo(
    () => (data?.groups ?? []).flatMap((g) => g.fundCashCode ? [g.fundCashCode] : g.properties.map((p) => p.code)),
    [data],
  );
  const grand = (() => {
    let starting = 0, revenue = 0, bills = 0, mortgage = 0, reserves = 0, operational = 0, hasStarting = false;
    for (const g of data?.groups ?? []) {
      const t = groupTotals(g);
      bills += t.bills; reserves += t.reserves; revenue += t.revenue; mortgage += t.mortgage;
      if (t.hasStarting) { starting += t.starting; operational += t.operational; hasStarting = true; }
    }
    return { starting, revenue, bills, mortgage, reserves, operational, hasStarting };
  })();

  // Only show weeks that have started — future weeks stay hidden until their
  // Monday (bills come in weekly from the AP Selection Report). Totals still sum
  // over every Wednesday, so nothing is lost. Weekly bills appear under one
  // "AvidXchange Bills Paid" header.
  const visibleWeds = useMemo(() => visibleWednesdays(wednesdays), [wednesdays]);
  const colCount = 3 + visibleWeds.length + 4; // property + starting + revenue + weeks + (total bills, mortgage, reserves, operational)
  // Wednesday nudge for the editors (Drew/admin) to bring in the week's bills.
  const isWednesday = today.getDay() === 3;

  return (
    <main style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Cash Sheet</h1>
          <p className="muted small" style={{ margin: 0 }}>
            Anticipated Revenue (rent-roll billings) is added and Bills paid to AvidXchange each Wednesday, Mortgage payments (from the debt tracker), and any Reserves are subtracted to get net Operational Cash — Starting Cash is the month&apos;s opening{" "}
            <Link href="/financials/operating-statements" style={{ color: "var(--brand)", fontWeight: 600 }}>Operating Cash</Link>{" "}
            balance Per the Detailed General Ledger and may not tie to the bank statement exactly.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {canEdit && (
            <>
              <button className="btn primary" onClick={() => apRef.current?.click()} disabled={apUploading} style={{ fontSize: 13, padding: "6px 12px", fontWeight: 700 }} title="Drop the weekly AP AutoPay Selections Reports (JV III, NI LLC, Condo, all-other) to auto-fill the week's bills">
                {apUploading ? "Uploading…" : "Upload AP Report"}
              </button>
              <input ref={apRef} type="file" accept=".xls,.xlsx" multiple style={{ display: "none" }} onChange={onApUpload} />
            </>
          )}
          <button className="btn" onClick={prevMonth} style={{ padding: "6px 12px", fontWeight: 900 }}>←</button>
          <span style={{ fontWeight: 800, fontSize: 15, minWidth: 150, textAlign: "center" }}>{MONTHS[month - 1]} {year}</span>
          <button className="btn" onClick={nextMonth} style={{ padding: "6px 12px", fontWeight: 900 }}>→</button>
          {!isThisMonth && (
            <button className="btn" onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth() + 1); }} style={{ fontSize: 12, padding: "6px 9px" }}>This month</button>
          )}
        </div>
      </div>

      {apSummary && (
        <div className="small" style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(21,128,61,0.08)", border: "1px solid rgba(21,128,61,0.35)", color: "#15803d", fontWeight: 700 }}>
          ✓ Filled {apSummary.count} {apSummary.count === 1 ? "property" : "properties"} · {money0(apSummary.total)} for the {weekOfLabel(apSummary.wednesday).toLowerCase()} from the AP Selection Report.
        </div>
      )}

      {!canEdit && (
        <div className="small" style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(11,74,125,0.06)", border: "1px solid rgba(11,74,125,0.25)", color: "#0b4a7d", fontWeight: 600 }}>
          View-only — you can browse the Cash Sheet but not edit it.
        </div>
      )}

      {canEdit && isWednesday && isThisMonth && !apSummary && (
        <div className="small" style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(180,83,9,0.08)", border: "1px solid rgba(180,83,9,0.35)", color: "#b45309", fontWeight: 700, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span>📋 It&apos;s Wednesday — pull this week&apos;s <b>AP Selection Reports</b> (JV III, NI LLC, Condo, all-other) and upload them to fill the bills.</span>
          <button className="btn" onClick={() => apRef.current?.click()} disabled={apUploading} style={{ fontSize: 12, padding: "4px 10px", fontWeight: 700 }}>{apUploading ? "Uploading…" : "Upload AP Report"}</button>
        </div>
      )}

      {/* Portfolio KPI pills */}
      <div className="pills" style={{ justifyContent: "flex-start" }}>
        <StatPill label="Starting Cash · Portfolio" value={money0(grand.hasStarting ? grand.starting : null)} accent="#0b4a7d" />
        <StatPill label="Anticipated Revenue · Month" value={money0(grand.revenue)} accent={grand.revenue > 0 ? "#15803d" : undefined} />
        <StatPill label="Bills to Pay · Month" value={money0(grand.bills)} accent={grand.bills > 0 ? "#b45309" : undefined} />
        <StatPill label="Mortgage · Month" value={money0(grand.mortgage)} accent={grand.mortgage > 0 ? "#b45309" : undefined} />
        <StatPill label="Reserves · Portfolio" value={money0(grand.reserves)} accent={grand.reserves > 0 ? "#6d28d9" : undefined} />
        <StatPill label="Operational Cash · Net" value={money0(grand.hasStarting ? grand.operational : null)} accent={grand.operational >= 0 ? "#15803d" : "#b91c1c"} />
      </div>

      {error && <div className="small" style={{ color: "#b91c1c", fontWeight: 700 }}>· {error}</div>}

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="tableWrap" style={{ overflowX: "auto" }}>
          <table style={{ minWidth: 720 }}>
            <thead>
              <tr>
                <th rowSpan={2} style={{ textAlign: "left", minWidth: 200, verticalAlign: "bottom" }}>Property</th>
                <th rowSpan={2} style={{ ...numCell, verticalAlign: "bottom" }}>Starting Cash</th>
                <th rowSpan={2} style={{ ...numCell, verticalAlign: "bottom" }} title="Anticipated monthly billings from the rent roll (base + CAM/RET + reimbursements)">Anticipated Revenue</th>
                {visibleWeds.length > 0 && (
                  <th colSpan={visibleWeds.length} style={{ ...numCell, textAlign: "center", borderBottom: "1px solid var(--border)", color: "#b45309" }}>
                    AvidXchange Bills Paid
                  </th>
                )}
                <th rowSpan={2} style={{ ...numCell, verticalAlign: "bottom" }}>Total Bills</th>
                <th rowSpan={2} style={{ ...numCell, verticalAlign: "bottom" }} title="Scheduled mortgage P&amp;I from the debt tracker">Mortgage</th>
                <th rowSpan={2} style={{ ...numCell, verticalAlign: "bottom" }}>Reserves</th>
                <th rowSpan={2} style={{ ...numCell, verticalAlign: "bottom" }}>Operational Cash</th>
              </tr>
              <tr>
                {visibleWeds.map((w) => (
                  <th key={w} style={numCell} title={`Bills paid the week of ${w}`}>{weekOfLabel(w)}</th>
                ))}
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
                      const revVal = rowRevenue(p.code);
                      const autoRes = autoReserve(p.code);
                      const op = rowOperational(p.code);
                      const startOverridden = parseOpt(startDraft[p.code]) != null;
                      const resOverridden = parseOpt(resDraft[p.code]) != null;
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
                                className="cs-edit" inputMode="decimal"
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
                          {/* Anticipated Revenue — read-only; click to open the rent roll for this property/month. Shown per building (incl. pooled funds). LIK (2010) opens its fee breakdown. */}
                          <td style={numCell}>
                            <RevenueLink code={p.code} amount={revVal} ym={ym} onMgmtClick={() => setMgmtOpen(true)} />
                          </td>
                          {/* Weekly bills — for pooled funds the bills are at the fund level (shown on the fund row), so building cells are blank. */}
                          {visibleWeds.map((w) => (
                            <td key={w} style={numCell}>
                              {pooled ? null : (
                                <input
                                  style={cellInput}
                                  className="cs-edit" inputMode="decimal"
                                  placeholder="—"
                                  disabled={!canEdit}
                                  value={billDraft[p.code]?.[w] ?? ""}
                                  onChange={(e) => setBillDraft((d) => ({ ...d, [p.code]: { ...d[p.code], [w]: e.target.value } }))}
                                  onBlur={() => commitBill(p.code, w)}
                                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                />
                              )}
                            </td>
                          ))}
                          <td style={{ ...numCell, fontWeight: 600 }}>{pooled ? "" : money0(rowBillsTotal(p.code))}</td>
                          {/* Mortgage — scheduled P&I from the debt tracker; blank for pooled-fund buildings (on the fund row). */}
                          <td style={numCell} title={pooled ? "Mortgage is on the fund row below" : "Scheduled mortgage P&I (debt tracker)"}>
                            {pooled ? <span className="muted">—</span> : <MortgageLink amount={rowMortgage(p.code)} />}
                          </td>
                          {/* Reserves — budget Big Projects (next 3 mo); click for the breakdown + override. */}
                          <td style={numCell} title={`Budgeted Big Projects over the next 3 months${resOverridden ? " · overridden" : ""} — click for the breakdown`}>
                            <button
                              type="button"
                              onClick={() => setReserveModal({ code: p.code, name: p.name })}
                              style={{ background: "none", border: "none", padding: 0, font: "inherit", cursor: "pointer", color: "#0b4a7d", fontWeight: resOverridden ? 700 : 600, textDecoration: "none", ...(resOverridden ? { color: "#b45309" } : (autoRes == null ? { color: "var(--muted)" } : {})) }}
                              onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
                              onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
                            >
                              {autoRes == null && !resOverridden ? "—" : money0(rowReserves(p.code))}
                            </button>
                          </td>
                          {/* Operational Cash — blank for pooled-fund buildings (computed at the fund) */}
                          <td style={numCell} title={pooled ? "Operational cash is computed for the fund — see the fund row below" : (endOverridden ? "Overridden — clear to use the computed value" : "Starting − bills − reserves")}>
                            {pooled ? (
                              <span className="muted">—</span>
                            ) : canEdit ? (
                              <input
                                style={{ ...cashInput, fontWeight: 800, color: op == null ? undefined : op >= 0 ? "#15803d" : "#b91c1c", ...(endOverridden ? { borderColor: "#b45309" } : {}) }}
                                className="cs-edit" inputMode="decimal"
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
                                  className="cs-edit" inputMode="decimal"
                                  placeholder={fundAuto != null ? money0(fundAuto) : "—"}
                                  value={startDraft[fc] ?? ""}
                                  onChange={(e) => setStartDraft((d) => ({ ...d, [fc]: e.target.value }))}
                                  onBlur={() => commitStarting(fc)}
                                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                />
                              : (gt.hasStarting ? <span style={fundStartOverridden ? { color: "#b45309" } : undefined}>{money0(gt.starting)}</span> : <span className="muted">—</span>))
                          : (gt.hasStarting ? money0(gt.starting) : "—")}
                      </td>
                      {/* Anticipated Revenue — pooled fund's total (sum of its buildings, shown per building above). */}
                      <td style={numCell} title={pooled ? "Total anticipated revenue (rent roll, all buildings)" : undefined}>
                        {money0(gt.revenue)}
                      </td>
                      {/* Pooled fund's weekly bills live here (one account pays for all buildings) — filled by the AP Selection Report. */}
                      {visibleWeds.map((w) => (
                        <td key={w} style={numCell}>
                          {pooled ? (
                            <input
                              style={cellInput}
                              className="cs-edit" inputMode="decimal"
                              placeholder="—"
                              disabled={!canEdit}
                              value={billDraft[fc]?.[w] ?? ""}
                              onChange={(e) => setBillDraft((d) => ({ ...d, [fc]: { ...d[fc], [w]: e.target.value } }))}
                              onBlur={() => commitBill(fc, w)}
                              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                            />
                          ) : null}
                        </td>
                      ))}
                      <td style={numCell}>{money0(gt.bills)}</td>
                      <td style={numCell} title="Scheduled mortgage P&I (debt tracker)">{pooled ? <MortgageLink amount={gt.mortgage} /> : money0(gt.mortgage)}</td>
                      <td style={numCell}>{money0(gt.reserves)}</td>
                      <td style={numCell} title={pooled ? (fundEndOverridden ? "Overridden — clear to use the computed value" : "Fund opening − all building bills − reserves") : undefined}>
                        {pooled
                          ? (canEdit
                              ? <input
                                  style={{ ...cashInput, fontWeight: 800, color: gt.operational >= 0 ? "#15803d" : "#b91c1c", ...(fundEndOverridden ? { borderColor: "#b45309" } : {}) }}
                                  className="cs-edit" inputMode="decimal"
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
                  <td style={numCell}>{money0(grand.revenue)}</td>
                  {visibleWeds.map((w) => (
                    <td key={w} style={numCell}>
                      {money0(billCodes.reduce((a, c) => a + parseNum(billDraft[c]?.[w] ?? ""), 0))}
                    </td>
                  ))}
                  <td style={numCell}>{money0(grand.bills)}</td>
                  <td style={numCell}>{money0(grand.mortgage)}</td>
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
        {" · "}Bills reset each month; Reserves auto-pull from the budget (Big Projects, next 3 months). Starting / Reserves / Operational can be overridden{canEdit ? " (amber border = overridden; clear the field to revert)" : ""}.
      </p>

      {mgmtOpen && data && (
        <MgmtFeeModal rows={data.mgmtFee} monthLabel={`${MONTHS[month - 1]} ${year}`} onClose={() => setMgmtOpen(false)} />
      )}

      {reserveModal && data && (
        <ReserveModal
          code={reserveModal.code}
          name={reserveModal.name}
          year={year}
          detail={data.reserveDetail[reserveModal.code.toUpperCase()]}
          autoTotal={autoReserve(reserveModal.code)}
          canEdit={canEdit}
          overrideValue={resDraft[reserveModal.code] ?? ""}
          onOverrideChange={(v) => setResDraft((d) => ({ ...d, [reserveModal.code]: v }))}
          onOverrideCommit={() => commitReserves(reserveModal.code)}
          onClose={() => setReserveModal(null)}
        />
      )}
    </main>
  );
}

// Anticipated Revenue value — read-only, links to the rent roll for that
// property + month (the source of the figure). Dash when there's no rent roll.
// LIK Management (2010) earns its revenue as management fees across the
// portfolio, so it's a computed total — click to see the per-property breakdown.
function RevenueLink({ code, amount, ym, onMgmtClick }: { code: string; amount: number | null; ym: string; onMgmtClick?: () => void }) {
  if (amount == null) return <span className="muted">—</span>;
  if (code === "2010") {
    return (
      <button
        type="button"
        onClick={onMgmtClick}
        title="Management fees earned — click for the per-property breakdown"
        style={{ background: "none", border: "none", padding: 0, font: "inherit", color: "#0b4a7d", fontWeight: 600, cursor: "pointer", textDecoration: "none" }}
        onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
        onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
      >
        {money0(amount)}
      </button>
    );
  }
  const href = `/rentroll?month=${ym}#prop-${code.toUpperCase()}`;
  return (
    <Link
      href={href}
      title={`${code} anticipated billings · open the rent roll`}
      style={{ color: "#0b4a7d", fontWeight: 600, textDecoration: "none" }}
      onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
      onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
    >
      {money0(amount)}
    </Link>
  );
}

// LIK (2010) management-fee breakdown — the anticipated fee earned from each
// managed property (its revenue × its rate), summing to LIK's revenue figure.
function MgmtFeeModal({ rows, monthLabel, onClose }: { rows: MgmtFeeRow[]; monthLabel: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const total = rows.reduce((a, r) => a + r.fee, 0);
  const th: React.CSSProperties = { textAlign: "left", fontSize: 11, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em", padding: "6px 10px", position: "sticky", top: 0, background: "var(--card)" };
  const td: React.CSSProperties = { padding: "6px 10px", fontSize: 13, borderTop: "1px solid var(--border)", verticalAlign: "middle" };
  const num: React.CSSProperties = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "48px 20px", overflow: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: "min(640px, 100%)", padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)" }}>LIK Management · Anticipated Fees</div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>Management Fee by Property · {monthLabel}</div>
          </div>
          <button type="button" className="btn" onClick={onClose} style={{ fontSize: 13, padding: "6px 12px", fontWeight: 700 }}>Close</button>
        </div>
        {rows.length === 0 ? (
          <div className="muted small" style={{ padding: 18 }}>No management fees — a property needs a loaded budget with a Management Fee line (and rent-roll revenue) to appear here.</div>
        ) : (
          <div className="tableWrap" style={{ maxHeight: "60vh", overflow: "auto", marginTop: 0 }}>
            <table style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th style={th}>Property</th>
                  <th style={{ ...th, textAlign: "right" }}>Revenue</th>
                  <th style={{ ...th, textAlign: "right" }}>Rate</th>
                  <th style={{ ...th, textAlign: "right" }}>Fee</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.code}>
                    <td style={td}><code style={{ fontSize: 12 }}>{r.code}</code><span style={{ marginLeft: 8 }}>{r.name}</span></td>
                    <td style={num}>{money0(r.revenue)}</td>
                    <td style={num}>{r.feePct}%</td>
                    <td style={{ ...num, fontWeight: 700 }}>{money0(r.fee)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 800, background: "rgba(11,74,125,0.05)" }}>
                  <td style={td}>Total · LIK Revenue</td>
                  <td style={num} />
                  <td style={num} />
                  <td style={{ ...num, fontWeight: 800, color: "#15803d" }}>{money0(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// Reserve breakdown for one property — the budgeted "Big Projects" lines over
// the look-ahead window (this month + next 2), with a per-month grid, plus the
// per-month override.
function ReserveModal({ code, name, year, detail, autoTotal, canEdit, overrideValue, onOverrideChange, onOverrideCommit, onClose }: {
  code: string; name: string; year: number; detail?: ReserveDetail; autoTotal: number | null; canEdit: boolean;
  overrideValue: string; onOverrideChange: (v: string) => void; onOverrideCommit: () => void; onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const months = detail?.windowMonths ?? [];
  const th: React.CSSProperties = { textAlign: "left", fontSize: 11, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em", padding: "6px 10px", position: "sticky", top: 0, background: "var(--card)" };
  const td: React.CSSProperties = { padding: "6px 10px", fontSize: 13, borderTop: "1px solid var(--border)", verticalAlign: "middle" };
  const num: React.CSSProperties = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "48px 20px", overflow: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: "min(620px, 100%)", padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)" }}>Reserve · Big Projects (next 3 months)</div>
            <div style={{ fontSize: 17, fontWeight: 800 }}><code style={{ fontSize: 14 }}>{code}</code> {name}</div>
          </div>
          <button type="button" className="btn" onClick={onClose} style={{ fontSize: 13, padding: "6px 12px", fontWeight: 700 }}>Close</button>
        </div>
        {!detail || detail.lines.length === 0 ? (
          <div className="muted small" style={{ padding: 18 }}>No budgeted Big Projects for this property in the next 3 months.</div>
        ) : (
          <div className="tableWrap" style={{ maxHeight: "50vh", overflow: "auto", marginTop: 0 }}>
            <table style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th style={th}>Line</th>
                  {months.map((m) => <th key={m} style={{ ...th, textAlign: "right" }}>{MONTHS[m - 1].slice(0, 3)} {year}</th>)}
                  <th style={{ ...th, textAlign: "right" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {detail.lines.map((l, i) => (
                  <tr key={i}>
                    <td style={td}>{l.label}</td>
                    {l.amounts.map((a, j) => <td key={j} style={num}>{money0(a)}</td>)}
                    <td style={{ ...num, fontWeight: 700 }}>{money0(l.amounts.reduce((x, y) => x + y, 0))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 800, background: "rgba(11,74,125,0.05)" }}>
                  <td style={td}>Total Reserve</td>
                  {months.map((m, j) => <td key={m} style={num}>{money0(detail.lines.reduce((s, l) => s + (l.amounts[j] ?? 0), 0))}</td>)}
                  <td style={{ ...num, fontWeight: 800, color: "#6d28d9" }}>{money0(detail.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <span className="muted small">Override this month&apos;s reserve {canEdit ? "(blank = use the budgeted amount)" : ""}:</span>
          {canEdit ? (
            <input
              style={{ ...cashInput, ...(overrideValue.trim() ? { borderColor: "#b45309", fontWeight: 700 } : {}) }}
              className="cs-edit" inputMode="decimal"
              placeholder={autoTotal != null ? money0(autoTotal) : "—"}
              value={overrideValue}
              onChange={(e) => onOverrideChange(e.target.value)}
              onBlur={onOverrideCommit}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            />
          ) : (
            <span style={{ fontWeight: 700 }}>{overrideValue.trim() ? money0(parseNum(overrideValue)) : (autoTotal != null ? money0(autoTotal) : "—")}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// Scheduled mortgage P&I — read-only, links to the debt tracker. Dash when no
// payment is due that month.
function MortgageLink({ amount }: { amount: number }) {
  if (!amount) return <span className="muted">—</span>;
  return (
    <Link
      href="/debt"
      title="Scheduled mortgage P&I · open the debt tracker"
      style={{ color: "#0b4a7d", fontWeight: 600, textDecoration: "none" }}
      onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
      onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
    >
      {money0(amount)}
    </Link>
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


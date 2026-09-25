"use client";

// The GL drill-down behind a statement line — one month's (or the year to
// date's) transactions, the tenants they belong to, and the budget behind it.
// Its own module so the budget draft's line history opens the SAME drill-down
// the operating statements do, rather than growing a second one.

import { useEffect, useState } from "react";
import { HoverCard } from "@/app/components/HoverCard";
import { RentCheckTable } from "./RentCheckTable";
import { MonthlyBars } from "./MonthlyBars";
import { basisForLine } from "@/lib/financials/operating-statements/rentCheck";
import { driverIndexes } from "@/lib/financials/operating-statements/drivers";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;
const COLOR_BRAND = "#0b4a7d";
// Segmented two-button toggle, matching the Operating Budgets controls.
const toggleBtn: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, padding: "4px 10px",
  border: "1px solid var(--border)", background: "var(--card)",
  color: "var(--text)", cursor: "pointer", letterSpacing: "0.04em", textTransform: "uppercase",
};
const toggleActive: React.CSSProperties = { background: "#0b4a7d", color: "#fff", borderColor: "#0b4a7d" };

// ── GL transaction drill-down ────────────────────────────────────────────────

type TxRow = { account: string; unit?: string | null; tenant?: string | null; groupKey?: string; date: string | null; description: string; ref: string; amount: number; month: number };
type TenantGroup = { groupKey: string; account: string; unit: string | null; tenant: string | null; amount: number; count: number };

function money2(v: number): string {
  const s = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v < 0 ? `(${s})` : s;
}
function fmtTxDate(iso: string | null): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[2]}/${m[3]}/${m[1].slice(2)}` : iso;
}

type BudRow = { label: string; glAccount: string; month: number; ytd: number; annual: number };

// Per-tenant rent roster (from the budget workbook) — same shape + colors as
// the Operating Budgets "Rental Summary by Month" modal.
type RentCat = "in-place" | "renewal" | "new" | "vacant";
type RentEntry = { unitRef: string; tenantName: string; category: RentCat; monthCategories?: RentCat[]; months: number[]; total: number; leaseFrom?: string; leaseTo?: string };
type RentDetailClient = { entries: RentEntry[]; total: number };
const RENT_TINT: Record<RentCat, string> = {
  "in-place": "rgba(21,128,61,0.55)",
  "renewal":  "rgba(132,204,22,0.45)",
  "new":      "rgba(217,249,157,0.65)",
  "vacant":   "transparent",
};
const RENT_LABEL: Record<RentCat, string> = { "in-place": "In-Place", "renewal": "Renewal", "new": "New Lease", "vacant": "Vacant" };
const RENT_ORDER: RentCat[] = ["in-place", "renewal", "new", "vacant"];

// The Rental Summary by Month roster, copied from the Operating Budgets modal:
// suite × month with renewal/new-lease color tints, a legend, rent-bump
// underline, and monthly + annual totals.
function RentRosterTable({ detail, throughMonth }: { detail: RentDetailClient; throughMonth: number }) {
  const fmt = (n: number) => (n === 0 ? "—" : `$${Math.round(n).toLocaleString("en-US")}`);
  // Only show YTD months — no future months. Slice every row to the period.
  const m = Math.min(12, Math.max(1, throughMonth));
  const shownMonths = MONTHS.slice(0, m);
  const ytd = (e: RentEntry) => e.months.slice(0, m).reduce((s, v) => s + (v ?? 0), 0);
  const ordered = [...detail.entries].sort((a, b) => a.unitRef.localeCompare(b.unitRef, undefined, { numeric: true }));
  const monthlyTotals = Array.from({ length: m }, (_, i) => detail.entries.reduce((s, e) => s + (e.months[i] ?? 0), 0));
  const total = detail.entries.reduce((s, e) => s + ytd(e), 0);
  const totalByCategory = (cat: RentCat) =>
    detail.entries.reduce((s, e) => { let d = 0; for (let j = 0; j < m; j++) if ((e.monthCategories?.[j] ?? e.category) === cat) d += e.months[j] ?? 0; return s + d; }, 0);
  const cell: React.CSSProperties = { padding: "5px 8px", fontSize: 11.5, fontVariantNumeric: "tabular-nums", borderTop: "1px solid var(--border)" };
  const hcell: React.CSSProperties = { padding: "5px 8px", fontSize: 10.5, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em", textAlign: "right" };
  const minW = m >= 10 ? 1040 : Math.max(560, 220 + m * 70);
  return (
    <div style={{ padding: "12px 4px 0" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)" }}>
          Rental Summary by Month — {ordered.length} suite{ordered.length === 1 ? "" : "s"} · {fmt(total)} {m < 12 ? `through ${shownMonths[m - 1]}` : "annual"}
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {RENT_ORDER.map((cat) => {
            if (cat === "vacant") return null;
            const dollars = totalByCategory(cat);
            if (dollars === 0) return null;
            const p = total > 0 ? (dollars / total) * 100 : 0;
            return (
              <span key={cat} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11 }}>
                <span style={{ display: "inline-block", width: 12, height: 12, background: RENT_TINT[cat], border: "1px solid rgba(22,163,74,0.35)", borderRadius: 2 }} />
                <span className="muted small">{RENT_LABEL[cat]}: {fmt(dollars)} ({p >= 10 ? `${Math.round(p)}%` : `${p.toFixed(1)}%`})</span>
              </span>
            );
          })}
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ tableLayout: "fixed", width: "100%", minWidth: minW, borderCollapse: "collapse" }}>
          <colgroup>
            <col style={{ width: 64 }} /><col style={{ width: 150 }} />
            {shownMonths.map((mo) => <col key={mo} />)}
            <col style={{ width: 76 }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ ...hcell, textAlign: "left" }}>Suite</th>
              <th style={{ ...hcell, textAlign: "left" }}>Tenant</th>
              {shownMonths.map((mo) => <th key={mo} style={hcell}>{mo}</th>)}
              <th style={hcell}>YTD</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((e, idx) => {
              const isVacant = e.category === "vacant";
              const tip = [e.tenantName, e.leaseFrom && e.leaseTo ? `Lease: ${e.leaseFrom} – ${e.leaseTo}` : e.leaseTo ? `Expires: ${e.leaseTo}` : e.leaseFrom ? `Starts: ${e.leaseFrom}` : ""].filter(Boolean).join("\n");
              const isBump = (j: number) => j > 0 && (e.months[j] ?? 0) > (e.months[j - 1] ?? 0) && (e.months[j - 1] ?? 0) > 0;
              return (
                <tr key={idx}>
                  <td style={{ ...cell, whiteSpace: "nowrap" }} title={tip}>{e.unitRef}</td>
                  <td style={{ ...cell, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: isVacant ? "var(--muted)" : undefined, fontStyle: isVacant ? "italic" : undefined }} title={tip}>{e.tenantName}</td>
                  {e.months.slice(0, m).map((mv, j) => {
                    const cat = e.monthCategories?.[j] ?? e.category;
                    return (
                      <td key={j} style={{ ...cell, textAlign: "right", background: mv > 0 ? RENT_TINT[cat] : undefined, color: cat === "vacant" ? "var(--muted)" : undefined, boxShadow: isBump(j) ? "inset 0 -2px 0 rgba(15,23,42,0.55)" : undefined }}>{fmt(mv)}</td>
                    );
                  })}
                  <td style={{ ...cell, textAlign: "right", fontWeight: 700, color: isVacant ? "var(--muted)" : undefined }}>{fmt(ytd(e))}</td>
                </tr>
              );
            })}
            <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 800 }}>
              <td colSpan={2} style={{ ...cell, textTransform: "uppercase", letterSpacing: "0.04em", fontSize: 10.5 }}>Total</td>
              {monthlyTotals.map((mv, j) => <td key={j} style={{ ...cell, textAlign: "right", fontWeight: 800 }}>{fmt(mv)}</td>)}
              <td style={{ ...cell, textAlign: "right", fontWeight: 900 }}>{fmt(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function LineDetailModal({ viewKey, property, year, period, monthLabel, line, initialTab, initialScope, onClose }: {
  viewKey: string; property: string; year: number; period: number; monthLabel: string;
  line: { mask: string; label: string; sign: 1 | -1 };
  initialTab: "gl" | "budget"; initialScope: "month" | "ytd" | "annual"; onClose: () => void;
}) {
  const [tab, setTab] = useState<"gl" | "budget">(initialTab);
  // GL has no "annual" scope (the file is YTD); clamp it to YTD.
  const [scope, setScope] = useState<"month" | "ytd" | "annual">(initialTab === "gl" && initialScope === "annual" ? "ytd" : initialScope);
  const [gl, setGl] = useState<{ transactions: TxRow[]; total: number; count: number; accounts?: string[]; byTenant?: TenantGroup[]; detail?: "stored" | "lean" | "partial" | "none" } | null>(null);
  const [bud, setBud] = useState<{ rows: BudRow[]; budgetYear: number | null; rentDetail?: RentDetailClient | null } | null>(null);
  const [loading, setLoading] = useState(false);
  // When set, the GL list is isolated to one tenant/unit account.
  const [tenantFilter, setTenantFilter] = useState<string | null>(null);
  // YTD only: a month picked on the bar chart narrows everything below to it.
  const [monthFilter, setMonthFilter] = useState<number | null>(null);
  const effScope: "month" | "ytd" | "annual" = tab === "gl" && scope === "annual" ? "ytd" : scope;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    setLoading(true);
    setTenantFilter(null);
    setMonthFilter(null);
    if (tab === "gl") {
      const qs = new URLSearchParams({ key: viewKey, year: String(year), mask: line.mask, period: String(period), scope: effScope === "month" ? "month" : "ytd", sign: String(line.sign) });
      fetch(`/api/financials/operating-statements/transactions?${qs}`)
        .then((r) => r.json()).then(setGl).catch(() => setGl({ transactions: [], total: 0, count: 0 })).finally(() => setLoading(false));
    } else {
      const qs = new URLSearchParams({ property, year: String(year), mask: line.mask, period: String(period) });
      fetch(`/api/financials/operating-statements/budget-detail?${qs}`)
        .then((r) => r.json()).then(setBud).catch(() => setBud({ rows: [], budgetYear: null })).finally(() => setLoading(false));
    }
  }, [tab, effScope, viewKey, property, year, period, line.mask, line.sign]);

  const th: React.CSSProperties = { textAlign: "left", fontSize: 11, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em", padding: "6px 10px", position: "sticky", top: 0, background: "var(--card)" };
  const tdc: React.CSSProperties = { padding: "6px 10px", fontSize: 13, borderTop: "1px solid var(--border)", verticalAlign: "top" };
  const seg = (active: boolean): React.CSSProperties => ({ ...toggleBtn, ...(active ? toggleActive : {}) });
  const tabBtn = (active: boolean): React.CSSProperties => ({ fontSize: 13, fontWeight: 700, padding: "6px 12px", border: "none", borderBottom: `2px solid ${active ? COLOR_BRAND : "transparent"}`, background: "none", color: active ? COLOR_BRAND : "var(--muted)", cursor: "pointer" });
  const scopeWord = effScope === "month" ? monthLabel : effScope === "annual" ? "Annual" : `YTD through ${monthLabel}`;

  const budAmt = (r: BudRow) => effScope === "month" ? r.month : effScope === "annual" ? r.annual : r.ytd;
  // Only show budget lines with a value in the current scope — a row that's $0
  // for the period isn't activity worth listing.
  const budRows = (bud?.rows ?? []).filter((r) => Math.abs(budAmt(r)) >= 0.005);
  const budTotal = budRows.reduce((s, r) => s + budAmt(r), 0);

  // Per-tenant/unit breakdown of the GL (non-zero).
  const glGroups = (gl?.byTenant ?? []).filter((g) => Math.abs(g.amount) >= 0.005);
  // A rent line's charges land on SUITES, and those are the lines worth
  // checking against the rent roll — so that check IS the by-suite view here,
  // no toggle. An expense line grouped by a payer has nothing to compare
  // against, and keeps the plain billed breakdown with its click-to-isolate.
  // The rent-roll check needs a rent-roll COLUMN to check against. Base rent,
  // CAM, RE tax and Other each have one; electric reimbursement, condo fees and
  // percentage rents do not — and before `basisForLine` existed every one of
  // them was silently compared to BASE RENT. A line with no basis falls back to
  // the per-tenant GL summary, which claims nothing it cannot support.
  const rentCheckBasis = tab === "gl" ? basisForLine(line.label, line.mask) : null;
  const showRentCheck = !!rentCheckBasis && glGroups.filter((g) => g.unit).length >= 2;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "48px 20px", overflow: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--card)", borderRadius: 12, maxWidth: (tab === "budget" && bud?.rentDetail && (effScope === "annual" ? 12 : period) > 7) || showRentCheck ? 1240 : 820, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.35)", display: "flex", flexDirection: "column", maxHeight: "82vh" }}>
        <div style={{ padding: "16px 18px 0", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)" }}>Line Detail</div>
              <div style={{ fontSize: 17, fontWeight: 800 }}>{line.label}</div>
              <div className="muted small" style={{ marginTop: 2 }}><code style={{ fontSize: 11 }}>{line.mask}</code></div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ display: "inline-flex", borderRadius: 6, overflow: "hidden" }}>
                <button type="button" onClick={() => setScope("month")} style={{ ...seg(effScope === "month"), borderRadius: "6px 0 0 6px" }}>{monthLabel}</button>
                <button type="button" onClick={() => setScope("ytd")} style={{ ...seg(effScope === "ytd"), borderLeft: "none", ...(tab === "gl" ? { borderRadius: "0 6px 6px 0" } : {}) }}>YTD</button>
                {tab === "budget" && <button type="button" onClick={() => setScope("annual")} style={{ ...seg(effScope === "annual"), borderLeft: "none", borderRadius: "0 6px 6px 0" }}>Annual</button>}
              </div>
              <button type="button" className="btn" onClick={onClose} style={{ padding: "6px 12px", fontSize: 13, fontWeight: 700 }}>Close</button>
            </div>
          </div>
          <div style={{ display: "flex", gap: 4, marginTop: 10 }}>
            <button type="button" onClick={() => setTab("budget")} style={tabBtn(tab === "budget")}>Budget detail</button>
            <button type="button" onClick={() => setTab("gl")} style={tabBtn(tab === "gl")}>GL transactions</button>
          </div>
        </div>

        <div style={{ overflow: "auto", flex: 1 }}>
          {loading ? (
            <div className="muted small" style={{ padding: 18 }}>Loading…</div>
          ) : tab === "gl" ? (
            !gl || gl.count === 0 ? (
              gl?.detail === "lean" || gl?.detail === "partial" ? (
                <div className="small" style={{ padding: 18, lineHeight: 1.5 }}>
                  <b>{year}&rsquo;s GL was imported as monthly totals only</b>{gl.detail === "partial" ? " (for these months)" : ""}, so there are no transactions to list — the totals are there, the detail is not.
                  <div className="muted" style={{ marginTop: 4 }}>To see them, re-upload {year}&rsquo;s GL on Operating Statements with &ldquo;Monthly totals only&rdquo; unticked. The new upload replaces the months it covers.</div>
                </div>
              ) : gl?.detail === "none" ? (
                <div className="muted small" style={{ padding: 18 }}>No GL is loaded for {year}.</div>
              ) : (
                <div className="muted small" style={{ padding: 18 }}>No transactions for this line in {scopeWord}.</div>
              )
            ) : (() => {
              // Hide zero-amount lines — only show transactions with activity.
              const txns = gl.transactions.filter((t) => Math.abs(t.amount) >= 0.005);
              if (txns.length === 0) return <div className="muted small" style={{ padding: 18 }}>No transactions for this line in {scopeWord}.</div>;
              // Per-tenant/unit breakdown (non-zero). Shown when the line spans
              // 2+ accounts (e.g. rental income) so each tenant can be isolated.
              // THE BAR CHART — YTD only, and only once there is more than one
              // month to compare. It follows the tenant isolate (so a vendor's
              // own run rate can be read) and drives the month filter below.
              const showBars = effScope === "ytd" && period >= 2;
              const monthName = monthFilter ? MONTHS[monthFilter - 1] : null;
              // Everything below the chart reads the picked month only.
              const monthTx = monthFilter ? txns.filter((t) => t.month === monthFilter) : txns;
              // The server's breakdown is the whole window; for one month it is
              // re-summed here from that month's own charges.
              const groups: TenantGroup[] = !monthFilter ? glGroups : (() => {
                const by = new Map<string, TenantGroup>();
                for (const t of monthTx) {
                  const k = t.groupKey ?? t.account;
                  const base = glGroups.find((g) => g.groupKey === k);
                  const g = by.get(k) ?? { groupKey: k, account: t.account, unit: base?.unit ?? t.unit ?? null, tenant: base?.tenant ?? t.tenant ?? null, amount: 0, count: 0 };
                  g.amount += t.amount; g.count += 1; by.set(k, g);
                }
                return [...by.values()].filter((g) => Math.abs(g.amount) >= 0.005).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
              })();
              const multi = glGroups.length >= 2;
              // The billed breakdown only earns its space when it actually
              // SUMMARISES. Rent posts one charge per suite a month, so on a
              // rent line it reproduced the transaction list below it row for
              // row. Shown only when some group holds more than one
              // transaction — a repairs line across 40 vendors still gets it.
              const summarizes = multi && groups.length >= 2 && monthTx.length > groups.length;
              // THE SAME REASONING, APPLIED TO THE LIST BELOW. On a rent or CAM
              // line the suite table IS the transaction list — one charge per
              // suite, same amounts, in a table that also carries the rent roll
              // and open A/R beside them. Stacking the raw list under it says
              // everything twice. It stays only where it adds something: a
              // suite billed more than once in the window, or a charge naming
              // no suite, which the suite table cannot show.
              const unplaced = monthTx.some((t) => !t.unit);
              const showTxnList = !showRentCheck || summarizes || unplaced;
              // Its Ref was the one column the suite table lacked, so carry it
              // up — but only where a suite has exactly one charge, since two
              // charges have no single ref.
              const refByUnit: Record<string, string> = {};
              if (showRentCheck && !showTxnList) {
                const seen: Record<string, number> = {};
                for (const t of monthTx) if (t.unit) seen[t.unit] = (seen[t.unit] ?? 0) + 1;
                for (const t of monthTx) if (t.unit && seen[t.unit] === 1 && t.ref) refByUnit[t.unit] = t.ref;
              }
              const shown = tenantFilter ? monthTx.filter((t) => t.groupKey === tenantFilter) : monthTx;
              const glTotal = shown.reduce((s, t) => s + t.amount, 0);
              // Standout drivers — the charge worth looking at. A driver has to
              // be both a meaningful slice of the line AND materially bigger
              // than the typical charge on it, so a recurring series (four
              // near-identical monthly invoices) marks nothing. See drivers.ts.
              const driverIdx = driverIndexes(shown.map((t) => t.amount));
              // From the whole window's groups, not the picked month's — a vendor with no
              // charge that month is still the vendor, not its raw key ("P:ACME").
              const activeTenantName = tenantFilter ? (glGroups.find((g) => g.groupKey === tenantFilter)?.tenant || txns.find((t) => t.groupKey === tenantFilter)?.description.split(" — ")[0] || tenantFilter) : null;
              return (
              <div>
                {showBars && (
                  <div style={{ padding: "10px 10px 4px", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--muted)" }}>
                        By month · click a month{glGroups.length >= 2 ? " or a vendor" : ""} to filter the charges below
                      </div>
                      {(monthFilter || tenantFilter) && (
                        <button type="button" onClick={() => { setMonthFilter(null); setTenantFilter(null); }} style={{ ...tabBtn(false), padding: "2px 8px", fontSize: 12 }}>
                          {[monthFilter ? MONTHS_LONG[monthFilter - 1] : null, activeTenantName].filter(Boolean).join(" · ")} · Clear ✕
                        </button>
                      )}
                    </div>
                    <MonthlyBars period={period} year={year}
                      txns={txns.map((t) => ({ month: t.month, amount: t.amount, vendor: t.groupKey ?? t.account, vendorLabel: t.tenant || t.description.split(" — ")[0] || t.account, date: t.date, description: t.description }))}
                      selectedMonth={monthFilter} onSelectMonth={setMonthFilter}
                      selectedVendor={tenantFilter} onSelectVendor={setTenantFilter} />
                  </div>
                )}
                {/* In YTD the bars ARE the summary: the vendor breakdown only
                    restated the list below it, so it gives way to the chart.
                    The rent-roll suite table stays — it is a check, not a
                    restatement. */}
                {(showRentCheck || (summarizes && !showBars)) && (
                  <div style={{ padding: "10px 10px 0" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--muted)" }}>
                        {showRentCheck ? "By suite — the rent roll vs. what was billed" : "By tenant / unit — click to isolate"}
                      </div>
                      {summarizes && !showRentCheck && tenantFilter && <button type="button" onClick={() => setTenantFilter(null)} style={{ ...tabBtn(false), padding: "2px 8px", fontSize: 12 }}>Clear ✕</button>}
                    </div>
                    {showRentCheck ? (
                      <RentCheckTable viewKey={viewKey} property={property} year={year} period={period}
                        scope={effScope === "month" || monthFilter ? "month" : "ytd"} mask={line.mask} sign={line.sign}
                        {...(monthFilter ? { period: monthFilter, monthLabel: monthName! } : { monthLabel })}
                        label={line.label} refByUnit={refByUnit} />
                    ) : <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead><tr><th style={th}>Suite</th><th style={th}>Tenant</th><th style={{ ...th, textAlign: "right" }}>Txns</th><th style={{ ...th, textAlign: "right" }}>Amount</th></tr></thead>
                      <tbody>
                        {groups.map((g) => {
                          const active = tenantFilter === g.groupKey;
                          return (
                          <tr key={g.groupKey} onClick={() => setTenantFilter(active ? null : g.groupKey)} className="os-cell"
                            style={{ cursor: "pointer", background: active ? "rgba(11,74,125,0.10)" : undefined }}>
                            <td style={{ ...tdc, whiteSpace: "nowrap", color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>{g.unit || "—"}</td>
                            <td style={{ ...tdc, fontWeight: active ? 800 : undefined }}>{g.tenant || <span className="muted">{g.unit ? "— (no current tenant)" : "— (unmatched)"}</span>}</td>
                            <td style={{ ...tdc, textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--muted)" }}>{g.count}</td>
                            <td style={{ ...tdc, textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", fontWeight: active ? 800 : undefined, color: g.amount < 0 ? "#b91c1c" : undefined }}>{money2(g.amount)}</td>
                          </tr>
                        );})}
                      </tbody>
                    </table>}
                    {showTxnList && <div style={{ borderTop: "2px solid var(--border)", marginTop: 10 }} />}
                  </div>
                )}
                {showTxnList && <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr><th style={th}>Date</th><th style={th}>Description</th>{multi && <th style={th}>Suite</th>}{multi && <th style={th}>Tenant</th>}<th style={th}>Ref</th><th style={th}>Acct</th><th style={{ ...th, textAlign: "right" }}>Amount</th></tr></thead>
                  <tbody>
                    {shown.map((t, i) => {
                      const driver = driverIdx.has(i);
                      return (
                      <tr key={i} style={driver ? { background: "rgba(180,83,9,0.10)" } : undefined}>
                        <td style={{ ...tdc, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{fmtTxDate(t.date)}</td>
                        <td style={tdc}>{driver && <span title="Major driver of this line" style={{ color: "#b45309", fontWeight: 800, marginRight: 5 }}>▲</span>}{t.description}</td>
                        {multi && <td style={{ ...tdc, whiteSpace: "nowrap", color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>{t.unit || "—"}</td>}
                        {multi && <td style={{ ...tdc, whiteSpace: "nowrap" }}>{t.tenant || <span className="muted">—</span>}</td>}
                        <td style={{ ...tdc, whiteSpace: "nowrap", color: "var(--muted)" }}>{t.ref}</td>
                        <td style={{ ...tdc, whiteSpace: "nowrap", color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>{t.account}</td>
                        <td style={{ ...tdc, textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", fontWeight: driver ? 800 : undefined, color: t.amount < 0 ? "#b91c1c" : undefined }}>{money2(t.amount)}</td>
                      </tr>
                    );})}
                  </tbody>
                  <tfoot><tr>
                    <td colSpan={multi ? 6 : 4} style={{ ...tdc, fontWeight: 800, borderTop: "2px solid var(--border)" }}>{activeTenantName ? `${activeTenantName} · ` : ""}{monthFilter ? `${MONTHS_LONG[monthFilter - 1]} · ` : ""}Total · {shown.length} transaction{shown.length === 1 ? "" : "s"}</td>
                    <td style={{ ...tdc, textAlign: "right", fontWeight: 900, fontVariantNumeric: "tabular-nums", borderTop: "2px solid var(--border)" }}>{money2(glTotal)}</td>
                  </tr></tfoot>
                </table>}
              </div>
              );
            })()
          ) : (
            <div>
              {bud?.rentDetail && bud.rentDetail.entries.length > 0 && <RentRosterTable detail={bud.rentDetail} throughMonth={effScope === "annual" ? 12 : period} />}
              {budRows.length === 0 ? (
                bud?.rentDetail ? null : (
                  <div className="muted small" style={{ padding: 18 }}>
                    {(bud?.rows ?? []).length === 0
                      ? `No budget lines map to this statement line${bud?.budgetYear ? ` in the ${bud.budgetYear} budget` : ""}.`
                      : `No budgeted amount in ${scopeWord}.`}
                  </div>
                )
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", marginTop: bud?.rentDetail ? 16 : 0 }}>
                  <thead><tr><th style={th}>Budget Line</th><th style={th}>Acct</th><th style={{ ...th, textAlign: "right" }}>{scopeWord} Budget</th></tr></thead>
                  <tbody>
                    {budRows.map((r, i) => (
                      <tr key={i}>
                        <td style={tdc}>{r.label}</td>
                        <td style={{ ...tdc, whiteSpace: "nowrap", color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>{r.glAccount}</td>
                        <td style={{ ...tdc, textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{money2(budAmt(r))}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr>
                    <td colSpan={2} style={{ ...tdc, fontWeight: 800, borderTop: "2px solid var(--border)" }}>Total budget{bud?.budgetYear ? ` (FY ${bud.budgetYear})` : ""}</td>
                    <td style={{ ...tdc, textAlign: "right", fontWeight: 900, fontVariantNumeric: "tabular-nums", borderTop: "2px solid var(--border)" }}>{money2(budTotal)}</td>
                  </tr></tfoot>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Import instructions (Skyline → Portal), mirroring the Rent Roll page ──────

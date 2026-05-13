"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { RentRollData, RentRollUnit } from "../../lib/rentroll/parseRentRollExcel";
import { TAX_TASKS, TAX_CATEGORIES, filingLabel, isTaskEffectivelyDone, loadTaxChecked, type TaxTask } from "../tracker/tax-data";
import { useUser } from "../components/UserProvider";
import { PROPERTY_DEFS } from "../../lib/properties/data";
import { UNIQUE_BANK_ACCOUNTS } from "../../lib/bank-rec/accounts";
import { bankRecKey, nextBankRecDeadline, nextStatementsDeadline, bankRecPeriodLabel } from "../../lib/bank-rec/util";

function sqftFmt(n: number) { return n.toLocaleString(); }

function parseLeaseTo(d: string | null): Date | null {
  if (!d) return null;
  const m = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return new Date(parseInt(m[3], 10), parseInt(m[1], 10) - 1, parseInt(m[2], 10));
}

function formatShortDate(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
}

function daysBetween(from: Date, to: Date): number {
  const ms = to.setHours(0, 0, 0, 0) - from.setHours(0, 0, 0, 0);
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

/** Next concrete due date (year-aware): use this year's date, but if it's already past, use next year. */
function nextDueDate(t: TaxTask, today: Date): Date {
  const yr = today.getFullYear();
  const candidate = new Date(yr, t.dueMonth - 1, t.dueDay);
  if (candidate < new Date(yr, today.getMonth(), today.getDate())) {
    return new Date(yr + 1, t.dueMonth - 1, t.dueDay);
  }
  return candidate;
}

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useUser();
  const [rentroll, setRentroll] = useState<RentRollData | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkedByYear, setCheckedByYear] = useState<Record<number, Record<string, boolean>>>({});
  const [vacatingMatchers, setVacatingMatchers] = useState<{ unitRefs: Set<string>; names: Set<string> }>({ unitRefs: new Set(), names: new Set() });
  const [upcomingNotices, setUpcomingNotices] = useState<{ id: string; tenant: string; building: string; noticeDate: string; daysUntil: number }[]>([]);
  const [dismissedNotices, setDismissedNotices] = useState<Set<string>>(new Set());
  const [bankRecChecked, setBankRecChecked] = useState<Record<string, boolean>>({});
  const [bankStmtChecked, setBankStmtChecked] = useState<Record<string, boolean>>({});

  // Stacie & admin: load bank account tracker state for the dashboard action item.
  const showBankRec = user.id === "stacie" || user.navKeys.has("all");
  useEffect(() => {
    if (!showBankRec) return;
    fetch("/api/bank-rec").then((r) => r.json()).then((j) => setBankRecChecked(j.checked ?? {})).catch(() => {});
    fetch("/api/bank-rec/statements").then((r) => r.json()).then((j) => setBankStmtChecked(j.statements ?? {})).catch(() => {});
  }, [showBankRec]);

  const bankRec = useMemo(() => {
    const { date, period, daysUntil } = nextBankRecDeadline();
    const total = UNIQUE_BANK_ACCOUNTS.length;
    const totalTasks = total * 2;
    const stmtDone = UNIQUE_BANK_ACCOUNTS.filter((a) => bankStmtChecked[bankRecKey(a.last4, period)]).length;
    const recDone  = UNIQUE_BANK_ACCOUNTS.filter((a) => bankRecChecked[bankRecKey(a.last4, period)]).length;
    const doneTasks = stmtDone + recDone;
    const remaining = totalTasks - doneTasks;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const overdue = date < today && remaining > 0;
    const status: "today" | "soon" | "later" | "overdue" | "done" =
      remaining === 0 ? "done"
      : overdue ? "overdue"
      : daysUntil === 0 ? "today"
      : daysUntil <= 3 ? "soon"
      : "later";
    return { date, period, daysUntil, total, totalTasks, stmtDone, recDone, doneTasks, remaining, status };
  }, [bankRecChecked, bankStmtChecked]);

  // Separate "download bank statements" item — due the 1st of each month.
  const bankStmt = useMemo(() => {
    const { date, period, daysUntil } = nextStatementsDeadline();
    const total = UNIQUE_BANK_ACCOUNTS.length;
    const done = UNIQUE_BANK_ACCOUNTS.filter((a) => bankStmtChecked[bankRecKey(a.last4, period)]).length;
    const remaining = total - done;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const overdue = date < today && remaining > 0;
    const status: "today" | "soon" | "later" | "overdue" | "done" =
      remaining === 0 ? "done"
      : overdue ? "overdue"
      : daysUntil === 0 ? "today"
      : daysUntil <= 3 ? "soon"
      : "later";
    return { date, period, daysUntil, total, done, remaining, status };
  }, [bankStmtChecked]);

  // Persist dismissed notices in localStorage so they don't reappear on reload.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem("kcp:dismissedNotices");
      if (raw) setDismissedNotices(new Set(JSON.parse(raw)));
    } catch { /* ignore */ }
  }, []);
  function dismissNotice(id: string) {
    setDismissedNotices((prev) => {
      const next = new Set(prev); next.add(id);
      try { localStorage.setItem("kcp:dismissedNotices", JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  }

  const isAdmin = user.id === "admin";

  useEffect(() => {
    fetch("/api/rentroll").then((r) => r.json()).then((j) => setRentroll(j.rentroll ?? null)).catch(() => setRentroll(null)).finally(() => setLoading(false));
    fetch("/api/leasing-activity").then((r) => r.json()).then((j) => {
      const la = j?.leasingActivity ?? {};
      const list = (la?.tenantsVacating ?? []) as { unitRef?: string; tenant?: string }[];
      setVacatingMatchers({
        unitRefs: new Set(list.map(v => v.unitRef ?? "").filter(Boolean)),
        names:    new Set(list.map(v => (v.tenant ?? "").toLowerCase().trim()).filter(Boolean)),
      });
      // Upcoming option-to-renew notice dates within 30 days (or past-due)
      const opts = (la?.optionsToRenew ?? []) as { tenant?: string; building?: string; noticeDate?: string }[];
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const cutoff = new Date(today); cutoff.setDate(today.getDate() + 30);
      const rows: { id: string; tenant: string; building: string; noticeDate: string; daysUntil: number }[] = [];
      for (const o of opts) {
        const m = (o.noticeDate ?? "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (!m) continue;
        const d = new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
        if (d > cutoff) continue;
        const days = Math.round((d.getTime() - today.getTime()) / 86400000);
        rows.push({
          id: `${(o.tenant ?? "").toLowerCase()}|${o.noticeDate ?? ""}`,
          tenant: o.tenant ?? "",
          building: o.building ?? "",
          noticeDate: o.noticeDate ?? "",
          daysUntil: days,
        });
      }
      rows.sort((a, b) => a.daysUntil - b.daysUntil);
      setUpcomingNotices(rows);
    }).catch(() => {});
  }, []);

  function isVacating(unitRef: string, tenantName: string): boolean {
    return vacatingMatchers.unitRefs.has(unitRef) || vacatingMatchers.names.has(tenantName.toLowerCase().trim());
  }

  useEffect(() => {
    const y = new Date().getFullYear();
    setCheckedByYear({ [y]: loadTaxChecked(y), [y + 1]: loadTaxChecked(y + 1) });
  }, []);

  // ── Next bi-weekly payroll Friday (anchor: 2026-05-08) ──
  const nextPayroll = useMemo(() => {
    const ANCHOR = new Date(2026, 4, 8); // May 8 2026 — known payroll Friday
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const days = Math.floor((t.getTime() - ANCHOR.getTime()) / 86400000);
    const mod = ((days % 14) + 14) % 14;
    const daysUntil = mod === 0 ? 0 : 14 - mod;
    const next = new Date(t);
    next.setDate(t.getDate() + daysUntil);
    const status: "today" | "soon" | "later" = daysUntil === 0 ? "today" : daysUntil <= 3 ? "soon" : "later";
    return { date: next, daysUntil, status };
  }, []);

  // ── Next CC Expenses submission (7th of every month) ──
  const ccExpensesDue = useMemo(() => {
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const next = new Date(t.getFullYear(), t.getMonth(), 7);
    if (t > next) next.setMonth(next.getMonth() + 1);
    const daysUntil = Math.round((next.getTime() - t.getTime()) / 86400000);
    const status: "today" | "soon" | "later" = daysUntil === 0 ? "today" : daysUntil <= 3 ? "soon" : "later";
    return { date: next, daysUntil, status };
  }, []);

  // ── Portfolio occupancy ──
  const JV_III_CODES = useMemo(() => new Set(["3610", "3620", "3640"]), []);
  const NI_LLC_CODES = useMemo(() => new Set(["4050", "4060", "4070", "4080", "40A0", "40B0", "40C0"]), []);
  const SC_CODES     = useMemo(() => new Set(["1100", "2300", "4500", "7010", "9510", "7200", "7300", "1500", "9200", "5600", "8200"]), []);
  const OW_CODES     = useMemo(() => new Set(["4900"]), []);

  function propLabelFor(code: string, fallback?: string): string {
    const def = PROPERTY_DEFS.find((p) => p.id.toUpperCase() === code.toUpperCase());
    return def?.name ?? fallback ?? code;
  }

  const occupancy = useMemo(() => {
    if (!rentroll) return null;
    const scope = user.dashboardScope;

    const tally = (props: typeof rentroll.properties) => {
      const total    = props.reduce((s, p) => s + p.totalSqft,    0);
      const occupied = props.reduce((s, p) => s + p.occupiedSqft, 0);
      const vacant   = total - occupied;
      return { total, occupied, vacant, pct: total > 0 ? (occupied / total) * 100 : null };
    };
    const propsByCodes = (codes: Set<string>) => rentroll.properties.filter((p) => codes.has(p.propertyCode.toUpperCase()));

    if (scope === "groups") {
      const all = tally(rentroll.properties);
      if (all.total === 0) return null;
      return {
        ...all,
        pct: all.pct ?? 0,
        groups: [
          { label: "JV III LLC",       ...tally(propsByCodes(JV_III_CODES)) },
          { label: "NI LLC",           ...tally(propsByCodes(NI_LLC_CODES)) },
          { label: "Shopping Centers", ...tally(propsByCodes(SC_CODES))     },
          { label: "The Office Works", ...tally(propsByCodes(OW_CODES))     },
        ].filter((g) => g.total > 0),
      };
    }

    // Per-property breakdown for personas with focused scope
    const scopeProps = propsByCodes(scope.codes);
    const all = tally(scopeProps);
    if (all.total === 0) return null;
    return {
      ...all,
      pct: all.pct ?? 0,
      groups: scopeProps
        .filter((p) => p.totalSqft > 0)
        .map((p) => ({
          label: `${p.propertyCode} ${propLabelFor(p.propertyCode, p.reportedPropertyName)}`,
          ...tally([p]),
        })),
    };
  }, [rentroll, user.dashboardScope, JV_III_CODES, NI_LLC_CODES, SC_CODES, OW_CODES]);

  // ── Rent roll freshness ──
  const today = new Date();
  const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const rrFreshness = useMemo(() => {
    const this25th = new Date(today.getFullYear(), today.getMonth(), 25);

    // Determine which month's rent roll is next to import.
    // Cadence: each month's rent roll is imported on/after the 25th.
    // If today < 25th of this month → next is this month.
    // If today >= 25th and last upload is on/after this 25th → next is next month.
    // Otherwise → still this month (overdue).
    let nextMonthIdx = today.getMonth();
    let nextMonthYear = today.getFullYear();
    if (today >= this25th) {
      const uploaded = rentroll?.uploadedAt ? new Date(rentroll.uploadedAt) : null;
      if (uploaded && uploaded >= this25th) {
        nextMonthIdx = (today.getMonth() + 1) % 12;
        if (today.getMonth() === 11) nextMonthYear = today.getFullYear() + 1;
      }
    }
    const nextMonthLabel = MONTH_NAMES[nextMonthIdx];
    const title = `Import ${nextMonthLabel} Rent Roll`;

    if (!rentroll?.uploadedAt) return { status: "missing" as const, title, message: "No rent roll has been uploaded yet." };
    const uploaded = new Date(rentroll.uploadedAt);
    const days = Math.floor((today.getTime() - uploaded.getTime()) / (1000 * 60 * 60 * 24));
    const overdue = today >= this25th && uploaded < this25th;
    if (overdue) return { status: "overdue" as const, title, message: `Overdue — last uploaded ${days} day${days === 1 ? "" : "s"} ago. Upload after the 25th.` };
    if (days > 35) return { status: "stale" as const, title, message: `Last uploaded ${days} days ago.` };
    return { status: "fresh" as const, title, message: `Last uploaded ${days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"} ago`}.` };
  }, [rentroll, today]);

  // ── Leases expiring in next 60 days (or already past, with > 0 rent) ──
  const expiring = useMemo(() => {
    if (!rentroll) return [];
    const rows: { propertyCode: string; unit: RentRollUnit; days: number }[] = [];
    for (const prop of rentroll.properties) {
      for (const unit of prop.units) {
        if (unit.isVacant || !unit.leaseTo) continue;
        const d = parseLeaseTo(unit.leaseTo);
        if (!d) continue;
        const days = daysBetween(new Date(), d);
        if (days >= -30 && days <= 60) rows.push({ propertyCode: prop.propertyCode, unit, days });
      }
    }
    return rows.sort((a, b) => a.days - b.days);
  }, [rentroll]);

  // ── Upcoming filings in next 30 days, undone ──
  const upcomingFilings = useMemo(() => {
    const now = new Date();
    const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 45);
    return TAX_TASKS
      .map((t) => {
        const due = nextDueDate(t, new Date());
        return { task: t, due, days: daysBetween(new Date(), due) };
      })
      .filter(({ task, due, days }) => {
        const yearChecked = checkedByYear[due.getFullYear()] ?? {};
        return due <= cutoff && days >= -7 && !isTaskEffectivelyDone(task, yearChecked);
      })
      .sort((a, b) => a.days - b.days)
      .slice(0, 12);
  }, [checkedByYear]);

  // Helper: property name lookup (use code → "code" if no match)
  function propLabel(code: string): string {
    const p = rentroll?.properties.find((x) => x.propertyCode === code);
    return p ? code : code;
  }

  return (
    <main style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <h1>Dashboard</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
          <span style={{ fontFamily: "'Arial Black', 'Arial Bold', Arial, sans-serif", fontWeight: 900, fontSize: 30, letterSpacing: "-0.5px", lineHeight: 1 }}>KORMAN</span>
          <div style={{ width: 1, height: 36, background: "#000", flexShrink: 0 }} />
          <div style={{ fontSize: 11, letterSpacing: "0.22em", lineHeight: 1.7, fontFamily: "Arial, Helvetica, sans-serif" }}><div>COMMERCIAL</div><div>PROPERTIES</div></div>
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
        {/* ── Portfolio Occupancy ── */}
        <Link href="/rentroll" className="card" style={{ display: "block", textDecoration: "none", color: "inherit", cursor: "pointer", transition: "box-shadow 0.15s, transform 0.15s" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 16px rgba(15,23,42,0.08)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = ""; }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>Portfolio Occupancy</div>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>→</span>
          </div>
          {loading ? (
            <div className="muted small">Loading…</div>
          ) : occupancy ? (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                <span style={{ fontSize: 38, fontWeight: 900, lineHeight: 1, color: occupancy.pct >= 90 ? "#16a34a" : occupancy.pct >= 70 ? "#0b4a7d" : "#d97706" }}>
                  {occupancy.pct.toFixed(1)}%
                </span>
                <span style={{ fontSize: 13, color: "var(--muted)" }}>
                  {sqftFmt(occupancy.occupied)} / {sqftFmt(occupancy.total)} sf ({sqftFmt(occupancy.vacant)} vacant)
                </span>
              </div>
              <div style={{ height: 6, borderRadius: 999, background: "rgba(15,23,42,0.08)", overflow: "hidden", marginTop: 10 }}>
                <div style={{ height: "100%", borderRadius: 999, width: `${occupancy.pct}%`, background: occupancy.pct >= 90 ? "#16a34a" : occupancy.pct >= 70 ? "#0b4a7d" : "#d97706" }} />
              </div>
              {occupancy.groups.length > 0 && (
                <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                  {occupancy.groups.map((g) => {
                    const pct = g.pct ?? 0;
                    const color = pct >= 90 ? "#16a34a" : pct >= 70 ? "#0b4a7d" : "#d97706";
                    return (
                      <div key={g.label}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 600 }}>{g.label}</span>
                          <span style={{ fontSize: 12, color: "var(--muted)" }}>
                            <span style={{ fontWeight: 700, color }}>{pct.toFixed(1)}%</span>
                            <span style={{ marginLeft: 6 }}>{sqftFmt(g.occupied)} / {sqftFmt(g.total)} sf ({sqftFmt(g.vacant)} vacant)</span>
                          </span>
                        </div>
                        <div style={{ height: 4, borderRadius: 999, background: "rgba(15,23,42,0.08)", overflow: "hidden" }}>
                          <div style={{ height: "100%", borderRadius: 999, width: `${pct}%`, background: color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <div className="muted small">No rent roll uploaded yet. Upload one →</div>
          )}
        </Link>

        {/* ── Action Items / Data Freshness ── */}
        <div className="card">
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", marginBottom: 8 }}>Action Items</div>
          {loading ? (
            <div className="muted small">Loading…</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{
                display: "flex", alignItems: "flex-start", gap: 10,
                padding: "10px 12px",
                border: "1px solid",
                borderColor: rrFreshness.status === "fresh" ? "rgba(22,163,74,0.25)" : rrFreshness.status === "stale" ? "rgba(217,119,6,0.3)" : "rgba(220,38,38,0.35)",
                background: rrFreshness.status === "fresh" ? "rgba(22,163,74,0.06)" : rrFreshness.status === "stale" ? "rgba(217,119,6,0.06)" : "rgba(220,38,38,0.06)",
                borderRadius: 8,
              }}>
                <span style={{
                  width: 10, height: 10, borderRadius: 999, marginTop: 5, flexShrink: 0,
                  background: rrFreshness.status === "fresh" ? "#16a34a" : rrFreshness.status === "stale" ? "#d97706" : "#dc2626",
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{rrFreshness.title}</div>
                  <div className="muted small" style={{ marginTop: 2 }}>{rrFreshness.message}</div>
                </div>
                <Link href="/rentroll" style={{ fontSize: 12, fontWeight: 600, color: "#0b4a7d", textDecoration: "none", flexShrink: 0, alignSelf: "center" }}>
                  Open →
                </Link>
              </div>

              {(user.navKeys.has("all") || user.navKeys.has("payroll-invoicer")) && (
              <div style={{
                display: "flex", alignItems: "flex-start", gap: 10,
                padding: "10px 12px",
                border: "1px solid",
                borderColor: nextPayroll.status === "today" ? "rgba(11,74,125,0.35)" : nextPayroll.status === "soon" ? "rgba(217,119,6,0.3)" : "rgba(15,23,42,0.12)",
                background: nextPayroll.status === "today" ? "rgba(11,74,125,0.07)" : nextPayroll.status === "soon" ? "rgba(217,119,6,0.06)" : "rgba(15,23,42,0.025)",
                borderRadius: 8,
              }}>
                <span style={{
                  width: 10, height: 10, borderRadius: 999, marginTop: 5, flexShrink: 0,
                  background: nextPayroll.status === "today" ? "#0b4a7d" : nextPayroll.status === "soon" ? "#d97706" : "#64748b",
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>Next payroll</div>
                  <div className="muted small" style={{ marginTop: 2 }}>
                    {nextPayroll.status === "today"
                      ? `Today, ${formatShortDate(nextPayroll.date)} — process payroll.`
                      : `${formatShortDate(nextPayroll.date)} · in ${nextPayroll.daysUntil} day${nextPayroll.daysUntil === 1 ? "" : "s"}`}
                  </div>
                </div>
                <Link href="/" style={{ fontSize: 12, fontWeight: 600, color: "#0b4a7d", textDecoration: "none", flexShrink: 0, alignSelf: "center" }}>
                  Open →
                </Link>
              </div>
              )}

              {(user.id === "harry" || user.navKeys.has("all")) && (
              <div style={{
                display: "flex", alignItems: "flex-start", gap: 10,
                padding: "10px 12px",
                border: "1px solid",
                borderColor: ccExpensesDue.status === "today" ? "rgba(220,38,38,0.35)" : ccExpensesDue.status === "soon" ? "rgba(217,119,6,0.3)" : "rgba(15,23,42,0.12)",
                background: ccExpensesDue.status === "today" ? "rgba(220,38,38,0.06)" : ccExpensesDue.status === "soon" ? "rgba(217,119,6,0.06)" : "rgba(15,23,42,0.025)",
                borderRadius: 8,
              }}>
                <span style={{
                  width: 10, height: 10, borderRadius: 999, marginTop: 5, flexShrink: 0,
                  background: ccExpensesDue.status === "today" ? "#dc2626" : ccExpensesDue.status === "soon" ? "#d97706" : "#64748b",
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>Submit CC Expenses</div>
                  <div className="muted small" style={{ marginTop: 2 }}>
                    {ccExpensesDue.status === "today"
                      ? `Due today, ${formatShortDate(ccExpensesDue.date)} — submit credit card expenses.`
                      : `Due ${formatShortDate(ccExpensesDue.date)} · in ${ccExpensesDue.daysUntil} day${ccExpensesDue.daysUntil === 1 ? "" : "s"}`}
                  </div>
                </div>
                <Link href="/expenses" style={{ fontSize: 12, fontWeight: 600, color: "#0b4a7d", textDecoration: "none", flexShrink: 0, alignSelf: "center" }}>
                  Open →
                </Link>
              </div>
              )}

              {showBankRec && (
              <div style={{
                display: "flex", alignItems: "flex-start", gap: 10,
                padding: "10px 12px",
                border: "1px solid",
                borderColor: bankStmt.status === "done" ? "rgba(22,163,74,0.30)"
                  : bankStmt.status === "overdue" ? "rgba(220,38,38,0.35)"
                  : bankStmt.status === "today" ? "rgba(220,38,38,0.30)"
                  : bankStmt.status === "soon" ? "rgba(217,119,6,0.30)"
                  : "rgba(15,23,42,0.12)",
                background: bankStmt.status === "done" ? "rgba(22,163,74,0.06)"
                  : bankStmt.status === "overdue" ? "rgba(220,38,38,0.06)"
                  : bankStmt.status === "today" ? "rgba(220,38,38,0.04)"
                  : bankStmt.status === "soon" ? "rgba(217,119,6,0.06)"
                  : "rgba(15,23,42,0.025)",
                borderRadius: 8,
              }}>
                <span style={{
                  width: 10, height: 10, borderRadius: 999, marginTop: 5, flexShrink: 0,
                  background: bankStmt.status === "done" ? "#16a34a"
                    : bankStmt.status === "overdue" ? "#b91c1c"
                    : bankStmt.status === "today" ? "#dc2626"
                    : bankStmt.status === "soon" ? "#d97706"
                    : "#64748b",
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    Download Bank Statements — {bankRecPeriodLabel(bankStmt.period)}
                    {bankStmt.status === "overdue" && (
                      <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: "rgba(220,38,38,0.15)", color: "#b91c1c", border: "1px solid rgba(220,38,38,0.35)", letterSpacing: "0.04em" }}>
                        PAST DUE
                      </span>
                    )}
                  </div>
                  <div className="muted small" style={{ marginTop: 2 }}>
                    {bankStmt.status === "done"
                      ? `All ${bankStmt.total} statements downloaded ✓`
                      : `${bankStmt.done}/${bankStmt.total} downloaded · due ${bankStmt.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                  </div>
                </div>
                <Link href="/bank-rec" style={{ fontSize: 12, fontWeight: 600, color: "#0b4a7d", textDecoration: "none", flexShrink: 0, alignSelf: "center" }}>
                  Open →
                </Link>
              </div>
              )}

              {showBankRec && (
              <div style={{
                display: "flex", alignItems: "flex-start", gap: 10,
                padding: "10px 12px",
                border: "1px solid",
                borderColor: bankRec.status === "done" ? "rgba(22,163,74,0.30)"
                  : bankRec.status === "overdue" ? "rgba(220,38,38,0.35)"
                  : bankRec.status === "today" ? "rgba(220,38,38,0.30)"
                  : bankRec.status === "soon" ? "rgba(217,119,6,0.30)"
                  : "rgba(15,23,42,0.12)",
                background: bankRec.status === "done" ? "rgba(22,163,74,0.06)"
                  : bankRec.status === "overdue" ? "rgba(220,38,38,0.06)"
                  : bankRec.status === "today" ? "rgba(220,38,38,0.04)"
                  : bankRec.status === "soon" ? "rgba(217,119,6,0.06)"
                  : "rgba(15,23,42,0.025)",
                borderRadius: 8,
              }}>
                <span style={{
                  width: 10, height: 10, borderRadius: 999, marginTop: 5, flexShrink: 0,
                  background: bankRec.status === "done" ? "#16a34a"
                    : bankRec.status === "overdue" ? "#b91c1c"
                    : bankRec.status === "today" ? "#dc2626"
                    : bankRec.status === "soon" ? "#d97706"
                    : "#64748b",
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    Bank Accounts — {bankRecPeriodLabel(bankRec.period)}
                    {bankRec.status === "overdue" && (
                      <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: "rgba(220,38,38,0.15)", color: "#b91c1c", border: "1px solid rgba(220,38,38,0.35)", letterSpacing: "0.04em" }}>
                        PAST DUE
                      </span>
                    )}
                  </div>
                  <div className="muted small" style={{ marginTop: 2 }}>
                    {bankRec.status === "done"
                      ? `All ${bankRec.total} accounts done ✓`
                      : `${bankRec.stmtDone}/${bankRec.total} statements · ${bankRec.recDone}/${bankRec.total} reconciled · due ${bankRec.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                  </div>
                </div>
                <Link href="/bank-rec" style={{ fontSize: 12, fontWeight: 600, color: "#0b4a7d", textDecoration: "none", flexShrink: 0, alignSelf: "center" }}>
                  Open →
                </Link>
              </div>
              )}

              {(user.navKeys.has("all") || user.navKeys.has("leasing-activity")) && upcomingNotices
                .filter((n) => !dismissedNotices.has(n.id))
                .map((n) => {
                  const overdue = n.daysUntil < 0;
                  const urgent  = n.daysUntil >= 0 && n.daysUntil <= 7;
                  const accent = overdue ? "#b91c1c" : urgent ? "#b91c1c" : "#d97706";
                  const bg     = overdue ? "rgba(220,38,38,0.06)" : urgent ? "rgba(220,38,38,0.04)" : "rgba(217,119,6,0.06)";
                  const border = overdue ? "rgba(220,38,38,0.35)" : urgent ? "rgba(220,38,38,0.30)" : "rgba(217,119,6,0.30)";
                  const relative = overdue ? `${Math.abs(n.daysUntil)} day${Math.abs(n.daysUntil) === 1 ? "" : "s"} ago` : n.daysUntil === 0 ? "today" : `in ${n.daysUntil} day${n.daysUntil === 1 ? "" : "s"}`;
                  return (
                    <div
                      key={n.id}
                      style={{
                        display: "flex", alignItems: "flex-start", gap: 10,
                        padding: "10px 12px",
                        border: `1px solid ${border}`,
                        background: bg,
                        borderRadius: 8,
                      }}
                    >
                      <span style={{ width: 10, height: 10, borderRadius: 999, marginTop: 5, flexShrink: 0, background: accent }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>
                          Exercise Option Notice Date — {n.tenant || "(no tenant)"}
                          {overdue && (
                            <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: "rgba(220,38,38,0.15)", color: "#b91c1c", border: "1px solid rgba(220,38,38,0.35)", letterSpacing: "0.04em" }}>PAST DUE</span>
                          )}
                        </div>
                        <div className="muted small" style={{ marginTop: 2 }}>
                          {n.building && <span>Bldg {n.building} · </span>}
                          <span>{n.noticeDate}</span>
                          <span style={{ marginLeft: 6, color: accent, fontWeight: 600 }}>({relative})</span>
                        </div>
                      </div>
                      <Link href="/rentroll/leasing" style={{ fontSize: 12, fontWeight: 600, color: "#0b4a7d", textDecoration: "none", flexShrink: 0, alignSelf: "center" }}>
                        Open →
                      </Link>
                      <button
                        onClick={() => dismissNotice(n.id)}
                        title="Dismiss"
                        aria-label="Dismiss notice item"
                        style={{
                          width: 22, height: 22, padding: 0, marginTop: 1, marginLeft: 4,
                          borderRadius: 4,
                          border: "1px solid rgba(15,23,42,0.18)",
                          background: "rgba(255,255,255,0.6)",
                          color: "var(--muted)",
                          cursor: "pointer",
                          fontSize: 13, lineHeight: 1, fontWeight: 700,
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>

      {/* ── Leases expiring soon ── */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>Leases Expiring (next 60 days)</div>
          <Link href="/rentroll" style={{ fontSize: 12, fontWeight: 600, color: "#0b4a7d", textDecoration: "none" }}>Rent roll →</Link>
        </div>
        {loading ? (
          <div className="muted small">Loading…</div>
        ) : !rentroll ? (
          <div className="muted small">No rent roll uploaded.</div>
        ) : expiring.length === 0 ? (
          <div className="muted small">Nothing expiring in the next 60 days. </div>
        ) : (
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Tenant</th>
                  <th>Property</th>
                  <th>Unit</th>
                  <th style={{ textAlign: "right" }}>Sq Ft</th>
                  <th>Lease To</th>
                  <th style={{ textAlign: "right" }}>Days</th>
                </tr>
              </thead>
              <tbody>
                {expiring.map(({ propertyCode, unit, days }, i) => {
                  const overdue = days < 0;
                  const urgent = days >= 0 && days <= 30;
                  const bg = overdue ? "rgba(220,38,38,0.10)" : urgent ? "rgba(220,38,38,0.06)" : days <= 60 ? "rgba(234,88,12,0.06)" : undefined;
                  return (
                    <tr
                      key={i}
                      style={{ background: bg, cursor: "pointer" }}
                      onClick={() => router.push(`/rentroll#unit-${unit.unitRef.replace(/[^a-zA-Z0-9]/g, "-")}`)}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.filter = "brightness(0.97)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.filter = ""; }}
                    >
                      <td style={{ fontWeight: 600 }}>
                        {unit.occupantName}
                        {isVacating(unit.unitRef, unit.occupantName) && (
                          <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: "rgba(220,38,38,0.1)", color: "#b91c1c", border: "1px solid rgba(220,38,38,0.35)", letterSpacing: "0.04em" }}>VACATING</span>
                        )}
                      </td>
                      <td style={{ fontSize: 13, color: "var(--muted)" }}>{propLabel(propertyCode)}</td>
                      <td style={{ whiteSpace: "nowrap" }}><code style={{ fontSize: 12, whiteSpace: "nowrap" }}>{unit.unitRef}</code></td>
                      <td style={{ textAlign: "right", fontSize: 13 }}>{sqftFmt(unit.sqft)}</td>
                      <td style={{ fontSize: 13, whiteSpace: "nowrap" }}>{unit.leaseTo}</td>
                      <td style={{ textAlign: "right", fontSize: 13, fontWeight: 600, color: overdue ? "#b91c1c" : urgent ? "#b91c1c" : "#b45309" }}>
                        {overdue ? `${Math.abs(days)} ago` : `${days}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Upcoming filings (admin only) ── */}
      {isAdmin && (
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>Upcoming Filings (next 45 days)</div>
          <Link href="/tracker/taxes" style={{ fontSize: 12, fontWeight: 600, color: "#0b4a7d", textDecoration: "none" }}>Filing tracker →</Link>
        </div>
        {upcomingFilings.length === 0 ? (
          <div className="muted small">No filings due in the next 45 days. </div>
        ) : (
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Entity</th>
                  <th>Filing</th>
                  <th>Type</th>
                  <th>Due</th>
                  <th style={{ textAlign: "right" }}>Days</th>
                </tr>
              </thead>
              <tbody>
                {upcomingFilings.map(({ task, due, days }) => {
                  const cat = TAX_CATEGORIES[task.category];
                  const overdue = days < 0;
                  const urgent = days >= 0 && days <= 14;
                  const bg = overdue ? "rgba(220,38,38,0.10)" : urgent ? "rgba(220,38,38,0.06)" : "rgba(234,88,12,0.04)";
                  return (
                    <tr
                      key={`${task.id}-${due.getTime()}`}
                      style={{ background: bg, cursor: "pointer" }}
                      onClick={() => router.push(`/tracker/taxes#task-${task.id}`)}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.filter = "brightness(0.97)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.filter = ""; }}
                    >
                      <td style={{ fontWeight: 600 }}>{task.entity}</td>
                      <td style={{ fontSize: 13 }}>{filingLabel(task)}</td>
                      <td>
                        <span style={{
                          display: "inline-block", padding: "2px 8px", borderRadius: 999,
                          fontSize: 11, fontWeight: 600,
                          background: cat.bg, color: cat.text, border: `1px solid ${cat.border}`,
                        }}>
                          {task.pillOverride ?? cat.pill}
                        </span>
                      </td>
                      <td style={{ fontSize: 13, whiteSpace: "nowrap" }}>{formatShortDate(due)}</td>
                      <td style={{ textAlign: "right", fontSize: 13, fontWeight: 600, color: overdue ? "#b91c1c" : urgent ? "#b91c1c" : "#b45309" }}>
                        {overdue ? `${Math.abs(days)} ago` : `${days}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}
    </main>
  );
}

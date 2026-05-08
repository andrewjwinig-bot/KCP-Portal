"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { RentRollData, RentRollUnit } from "../../lib/rentroll/parseRentRollExcel";
import { TAX_TASKS, TAX_CATEGORIES, filingLabel, isTaskEffectivelyDone, loadTaxChecked, type TaxTask } from "../tracker/tax-data";

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
  const [rentroll, setRentroll] = useState<RentRollData | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkedByYear, setCheckedByYear] = useState<Record<number, Record<string, boolean>>>({});

  useEffect(() => {
    fetch("/api/rentroll").then((r) => r.json()).then((j) => setRentroll(j.rentroll ?? null)).catch(() => setRentroll(null)).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const y = new Date().getFullYear();
    setCheckedByYear({ [y]: loadTaxChecked(y), [y + 1]: loadTaxChecked(y + 1) });
  }, []);

  // ── Portfolio occupancy ──
  const occupancy = useMemo(() => {
    if (!rentroll) return null;
    const total    = rentroll.properties.reduce((s, p) => s + p.totalSqft, 0);
    const occupied = rentroll.properties.reduce((s, p) => s + p.occupiedSqft, 0);
    if (total === 0) return null;
    return { total, occupied, vacant: total - occupied, pct: (occupied / total) * 100 };
  }, [rentroll]);

  // ── Rent roll freshness ──
  const today = new Date();
  const rrFreshness = useMemo(() => {
    if (!rentroll?.uploadedAt) return { status: "missing" as const, message: "No rent roll has been uploaded yet." };
    const uploaded = new Date(rentroll.uploadedAt);
    const days = Math.floor((today.getTime() - uploaded.getTime()) / (1000 * 60 * 60 * 24));
    // Past the 25th and last upload was before this month's 25th → overdue
    const this25th = new Date(today.getFullYear(), today.getMonth(), 25);
    const overdue = today >= this25th && uploaded < this25th;
    if (overdue) return { status: "overdue" as const, message: `Rent roll is overdue — last uploaded ${days} day${days === 1 ? "" : "s"} ago. Upload after the 25th.` };
    if (days > 35) return { status: "stale" as const, message: `Last uploaded ${days} days ago.` };
    return { status: "fresh" as const, message: `Last uploaded ${days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"} ago`}.` };
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
              <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                <span style={{ fontSize: 38, fontWeight: 900, lineHeight: 1, color: occupancy.pct >= 90 ? "#16a34a" : occupancy.pct >= 70 ? "#0b4a7d" : "#d97706" }}>
                  {occupancy.pct.toFixed(1)}%
                </span>
                <span style={{ fontSize: 13, color: "var(--muted)" }}>
                  {sqftFmt(occupancy.occupied)} / {sqftFmt(occupancy.total)} sf
                </span>
              </div>
              <div style={{ height: 6, borderRadius: 999, background: "rgba(15,23,42,0.08)", overflow: "hidden", marginTop: 10 }}>
                <div style={{ height: "100%", borderRadius: 999, width: `${occupancy.pct}%`, background: occupancy.pct >= 90 ? "#16a34a" : occupancy.pct >= 70 ? "#0b4a7d" : "#d97706" }} />
              </div>
              <div className="muted small" style={{ marginTop: 8 }}>
                Vacant: {sqftFmt(occupancy.vacant)} sf · {rentroll?.properties.length ?? 0} properties
              </div>
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
                  <div style={{ fontWeight: 600, fontSize: 14 }}>Rent roll</div>
                  <div className="muted small" style={{ marginTop: 2 }}>{rrFreshness.message}</div>
                </div>
                <Link href="/rentroll" style={{ fontSize: 12, fontWeight: 600, color: "#0b4a7d", textDecoration: "none", flexShrink: 0, alignSelf: "center" }}>
                  Open →
                </Link>
              </div>
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
                      <td style={{ fontWeight: 600 }}>{unit.occupantName}</td>
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

      {/* ── Upcoming filings ── */}
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
    </main>
  );
}

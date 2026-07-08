"use client";

// Master Monthly Review — a company-wide, graphical one-pager across leasing,
// operations, and financials, grouped Business Parks / Shopping Centers / LIK /
// Other. Rendered both as the standalone /reports/monthly page (for a clean
// Print/PDF) and folded into the Dashboard (embedded) for finance users.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { StatPill } from "@/app/components/Pill";
import LoadingState from "@/app/components/LoadingState";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const BRAND = "#0b4a7d";
const GREEN = "#15803d";
const RED = "#b91c1c";
const AMBER = "#b45309";

type GroupMetrics = {
  key: string; label: string;
  totalSqft: number; occupiedSqft: number; vacantSqft: number; occPct: number;
  units: number; vacantUnits: number;
  noiActual: number | null; noiBudget: number | null;
  openRequests: number; newLeases: number; vacated: number;
};
type LeaseChange = { propertyCode: string; group: string; unitRef: string; tenant: string; sqft: number };
type Expiration = { propertyCode: string; group: string; unitRef: string; tenant: string; sqft: number; leaseTo: string; days: number };
type Report = {
  year: number; month: number; monthLabel: string; generatedAt: string; rentRollMonth: string | null;
  portfolio: { totalSqft: number; occupiedSqft: number; vacantSqft: number; occPct: number; occPctPrior: number | null; units: number; vacantUnits: number; noiActual: number | null; noiBudget: number | null; openRequests: number; completedThisMonth: number; newRequestsThisMonth: number };
  groups: GroupMetrics[];
  newLeases: LeaseChange[]; vacated: LeaseChange[]; expirations: Expiration[];
  requestsByPriority: { priority: string; count: number }[];
  upcoming: { label: string; when: string; kind: string }[];
};

function money(v: number | null): string {
  if (v == null) return "—";
  const n = Math.round(v);
  return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US");
}
function moneyK(v: number | null): string {
  if (v == null) return "—";
  const a = Math.abs(v), s = v < 0 ? "-" : "";
  if (a >= 1_000_000) return `${s}$${(a / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) return `${s}$${Math.round(a / 1_000)}K`;
  return `${s}$${Math.round(a)}`;
}
const sf = (n: number) => n.toLocaleString("en-US");

// Horizontal occupancy bar with the % label inside.
function OccBar({ pct }: { pct: number }) {
  const p = Math.max(0, Math.min(100, pct));
  const color = p >= 95 ? GREEN : p >= 85 ? BRAND : AMBER;
  return (
    <div style={{ position: "relative", height: 22, borderRadius: 6, background: "rgba(15,23,42,0.08)", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, width: `${p}%`, background: color, borderRadius: 6, transition: "width .3s" }} />
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", paddingLeft: 8, fontSize: 12, fontWeight: 800, color: p > 55 ? "#fff" : "var(--text)" }}>{p.toFixed(1)}%</div>
    </div>
  );
}

// Actual vs budget mini bar pair.
function NoiBars({ actual, budget }: { actual: number | null; budget: number | null }) {
  if (actual == null) return <span className="muted small">No GL</span>;
  const max = Math.max(Math.abs(actual), Math.abs(budget ?? 0), 1);
  const fav = budget == null ? null : actual >= budget;
  const Bar = ({ v, label, color }: { v: number; label: string; color: string }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span className="muted" style={{ fontSize: 10, width: 42, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 10, borderRadius: 4, background: "rgba(15,23,42,0.06)", overflow: "hidden" }}>
        <div style={{ width: `${(Math.abs(v) / max) * 100}%`, height: "100%", background: color, borderRadius: 4 }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, width: 52, textAlign: "right", flexShrink: 0 }}>{moneyK(v)}</span>
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <Bar v={actual} label="Actual" color={fav === false ? RED : GREEN} />
      {budget != null && <Bar v={budget} label="Budget" color="rgba(15,23,42,0.35)" />}
    </div>
  );
}

function Delta({ now, prior, suffix = "pt" }: { now: number; prior: number | null; suffix?: string }) {
  if (prior == null) return null;
  const d = now - prior;
  if (Math.abs(d) < 0.05) return <span className="muted small"> · flat</span>;
  const up = d > 0;
  return <span style={{ fontSize: 12, fontWeight: 700, color: up ? GREEN : RED, marginLeft: 6 }}>{up ? "▲" : "▼"} {Math.abs(d).toFixed(1)}{suffix}</span>;
}

const GROUP_ACCENT: Record<string, string> = { bp: "#0b4a7d", sc: "#0d9488", lik: "#6d28d9", other: "#b45309" };

/** The company Monthly Review. `embedded` renders it as a Dashboard section
 *  (compact header + a "Full view / Print →" link); standalone renders the full
 *  page header with a Print/PDF button and print styling. */
export default function MonthlyReviewPanel({ embedded = false }: { embedded?: boolean }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    fetch(`/api/reports/monthly?year=${year}&month=${month}`)
      .then((r) => r.json())
      .then((j) => { if (j.error) { setError(j.error); setReport(null); } else setReport(j.report); })
      .catch((e) => setError(e?.message ?? "Failed to load"))
      .finally(() => setLoading(false));
  }, [year, month]);
  useEffect(() => { load(); }, [load]);

  function step(delta: number) {
    let m = month + delta, y = year;
    if (m < 1) { m = 12; y -= 1; } else if (m > 12) { m = 1; y += 1; }
    setMonth(m); setYear(y);
  }

  const p = report?.portfolio;
  const noiVar = p && p.noiActual != null && p.noiBudget != null ? p.noiActual - p.noiBudget : null;

  const stepper = (
    <div className="noprint" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <button className="btn" onClick={() => step(-1)} style={{ padding: "6px 12px", fontWeight: 900 }}>←</button>
      <span style={{ fontWeight: 800, fontSize: 14, minWidth: 120, textAlign: "center" }}>{MONTHS[month - 1]} {year}</span>
      <button className="btn" onClick={() => step(1)} style={{ padding: "6px 12px", fontWeight: 900 }}>→</button>
      {embedded ? (
        <Link href="/reports/monthly" className="btn" style={{ fontSize: 13, padding: "6px 14px", fontWeight: 700, textDecoration: "none" }}>Full view / Print →</Link>
      ) : (
        <button className="btn primary" onClick={() => window.print()} style={{ fontSize: 13, padding: "6px 14px", fontWeight: 700 }}>Print / PDF</button>
      )}
    </div>
  );

  const header = embedded ? (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: BRAND }}>Monthly Review</div>
        <div className="muted small">{report?.monthLabel ?? `${MONTHS[month - 1]} ${year}`} · company-wide snapshot</div>
      </div>
      {stepper}
    </div>
  ) : (
    <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: BRAND }}>Korman Commercial Properties</div>
        <h1 style={{ margin: "2px 0 0" }}>Monthly Review</h1>
        <div className="muted small">{report?.monthLabel ?? `${MONTHS[month - 1]} ${year}`}{report?.generatedAt ? ` · generated ${new Date(report.generatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""}</div>
      </div>
      {stepper}
    </header>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {!embedded && <style>{`@media print { .noprint { display: none !important; } main { max-width: none !important; } }`}</style>}

      {header}

      {error && <div className="card" style={{ borderColor: "rgba(220,38,38,0.35)", color: RED, fontWeight: 700 }}>{error}</div>}
      {loading && !report && (
        <LoadingState status="Assembling the company snapshot…" context={`${MONTHS[month - 1]} ${year} · occupancy, NOI, leasing & service`} columns={3} rows={4} />
      )}

      {report && p && (
        <>
          {/* ── Hero callouts ── */}
          <div className="pills" style={{ justifyContent: "flex-start" }}>
            <StatPill label={`Occupancy${p.occPctPrior != null ? " · vs last mo" : ""}`} value={<>{p.occPct.toFixed(1)}%<Delta now={p.occPct} prior={p.occPctPrior} /></>} accent={p.occPct >= 90 ? GREEN : AMBER} />
            <StatPill label="Occupied SF" value={sf(Math.round(p.occupiedSqft))} accent={BRAND} />
            <StatPill label="Vacant SF" value={sf(Math.round(p.vacantSqft))} accent={p.vacantSqft > 0 ? AMBER : GREEN} />
            <StatPill label="NOI · YTD" value={moneyK(p.noiActual)} accent={BRAND} />
            <StatPill label="NOI vs Budget" value={noiVar == null ? "—" : moneyK(noiVar)} accent={noiVar == null ? undefined : noiVar >= 0 ? GREEN : RED} />
            <StatPill label="Open Service Reqs" value={p.openRequests} accent={p.openRequests > 0 ? AMBER : GREEN} />
          </div>

          {/* ── Financial | Operational side by side ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
            <div className="card">
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: BRAND, marginBottom: 10 }}>Financial</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span className="muted small">Net Operating Income · YTD</span>
                  <span style={{ fontSize: 22, fontWeight: 900 }}>{money(p.noiActual)}</span>
                </div>
                {noiVar != null && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span className="muted small">vs Budget</span>
                    <span style={{ fontWeight: 800, color: noiVar >= 0 ? GREEN : RED }}>{noiVar >= 0 ? "+" : ""}{money(noiVar)} {p.noiBudget ? `(${((noiVar / Math.abs(p.noiBudget)) * 100).toFixed(1)}%)` : ""}</span>
                  </div>
                )}
                <Link href="/financials/operating-statements/review" className="noprint muted small" style={{ color: BRAND, fontWeight: 600, textDecoration: "none" }}>Flags to Investigate →</Link>
              </div>
            </div>

            <div className="card">
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: BRAND, marginBottom: 10 }}>Operations</div>
              <div className="pills" style={{ justifyContent: "flex-start", marginBottom: 8 }}>
                <StatPill label="Open Requests" value={p.openRequests} accent={p.openRequests > 0 ? AMBER : GREEN} />
                <StatPill label="New this month" value={p.newRequestsThisMonth} />
                <StatPill label="Completed" value={p.completedThisMonth} accent={GREEN} />
              </div>
              {report.requestsByPriority.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {report.requestsByPriority.map((r) => (
                    <span key={r.priority} className="muted small" style={{ padding: "2px 9px", borderRadius: 999, background: "rgba(15,23,42,0.05)", fontWeight: 700 }}>{r.priority}: {r.count}</span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── By group ── */}
          <div style={{ fontSize: 14, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text)", marginTop: 4 }}>By Group</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))", gap: 14 }}>
            {report.groups.filter((grp) => grp.units > 0).map((grp) => {
              const accent = GROUP_ACCENT[grp.key] ?? BRAND;
              const v = grp.noiActual != null && grp.noiBudget != null ? grp.noiActual - grp.noiBudget : null;
              return (
                <div key={grp.key} className="card" style={{ borderTop: `3px solid ${accent}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                    <span style={{ fontWeight: 800, color: accent }}>{grp.label}</span>
                    <span className="muted small">{sf(Math.round(grp.totalSqft))} sf · {grp.units} units</span>
                  </div>
                  <OccBar pct={grp.occPct} />
                  <div className="muted small" style={{ marginTop: 4 }}>{grp.vacantUnits} vacant unit{grp.vacantUnits === 1 ? "" : "s"} · {sf(Math.round(grp.vacantSqft))} sf</div>
                  <div style={{ marginTop: 10 }}>
                    <NoiBars actual={grp.noiActual} budget={grp.noiBudget} />
                    {v != null && <div className="small" style={{ marginTop: 4, fontWeight: 700, color: v >= 0 ? GREEN : RED }}>{v >= 0 ? "+" : ""}{moneyK(v)} vs budget</div>}
                  </div>
                  <div style={{ display: "flex", gap: 12, marginTop: 10, flexWrap: "wrap" }} className="small">
                    {grp.newLeases > 0 && <span style={{ color: GREEN, fontWeight: 700 }}>+{grp.newLeases} new</span>}
                    {grp.vacated > 0 && <span style={{ color: RED, fontWeight: 700 }}>−{grp.vacated} vacated</span>}
                    {grp.openRequests > 0 && <span style={{ color: AMBER, fontWeight: 700 }}>{grp.openRequests} open req</span>}
                    {grp.newLeases === 0 && grp.vacated === 0 && grp.openRequests === 0 && <span className="muted">no changes</span>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── New leases — shown only when there are any this month ── */}
          {report.newLeases.length > 0 && (
            <HighlightCard title="New Leases" accent={GREEN} rows={report.newLeases.map((l) => ({ left: l.tenant, mid: `${l.propertyCode} · ${l.unitRef}`, right: `${sf(l.sqft)} sf` }))} empty="" />
          )}

          {/* ── Vacating & Expiring — one detailed section: recently vacated /
               expired (last 60 days) + vacating / expiring (next 90 days) ── */}
          <LeaseMovement report={report} reconYear={report.year} />

          {/* ── Upcoming & seasonal ── */}
          {report.upcoming.length > 0 && (
            <div className="card" style={{ background: "rgba(11,74,125,0.04)", borderColor: "rgba(11,74,125,0.25)" }}>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: BRAND, marginBottom: 10 }}>Upcoming — for our discussion</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {report.upcoming.map((u, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 999, background: BRAND, flexShrink: 0 }} />
                    <span style={{ fontWeight: 600, flex: 1 }}>{u.label}</span>
                    <span className="muted small" style={{ fontWeight: 700 }}>{u.when}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="muted small" style={{ marginTop: 4 }}>
            Occupancy, leasing, and service data are as of the {report.rentRollMonth ?? "latest"} rent roll. NOI is YTD through the month, from posted GLs (properties without a GL are excluded). Financials are a snapshot — see Operating Statements for detail.
          </div>
        </>
      )}
    </div>
  );
}

function HighlightCard({ title, accent, rows, empty, href, hrefLabel }: {
  title: string; accent: string; rows: { left: string; mid: string; right: string }[]; empty: string; href?: string; hrefLabel?: string;
}) {
  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: accent }}>{title} {rows.length > 0 && <span className="muted">({rows.length})</span>}</span>
        {href && rows.length > 0 && <Link href={href} className="noprint muted small" style={{ color: BRAND, fontWeight: 600, textDecoration: "none" }}>{hrefLabel}</Link>}
      </div>
      {rows.length === 0 ? (
        <div className="muted small">{empty}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {rows.map((r, i) => (
            <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 13 }}>
              <span style={{ fontWeight: 600, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.left}</span>
              <span className="muted small" style={{ flexShrink: 0 }}>{r.mid}</span>
              <span style={{ flexShrink: 0, fontWeight: 700, color: accent }}>{r.right}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Lease-end parts from a US date string ("MM/DD/YYYY").
function leaseToParts(s: string | null): { y: number; m: number } | null {
  const m = s?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? { y: Number(m[3]), m: Number(m[1]) } : null;
}


// Small grey status pill for the recently-vacated / expired rows (matches the
// dashboard's VACATED chip).
function GonePill({ text }: { text: string }) {
  return <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: "rgba(100,116,139,0.14)", color: "#475569", border: "1px solid rgba(100,116,139,0.4)", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{text}</span>;
}

/** 2-digit base year for the B/Y column — 4-digit year → last 2 digits;
 *  non-numeric markers (NNN, GROSS, …) shown as-is; missing → dash. */
function baseYear2(raw: number | string | null | undefined): string {
  if (raw == null || raw === "") return "—";
  const s = String(raw).trim();
  if (/^\d{4}$/.test(s)) return s.slice(2);
  if (/^\d{2}$/.test(s)) return s;
  return s.toUpperCase();
}

// The consolidated leasing-movement section: recently vacated / expired (last
// 60 days) and vacating / expiring (next 90 days), each row deep-linking to the
// interim move-out statement — replaces the old separate Vacated + Expiring
// mini-lists.
function LeaseMovement({ report, reconYear }: { report: Report; reconYear: number }) {
  type Row = { propertyCode: string; unitRef: string; tenant: string; sqft: number; leaseTo: string | null; days: number | null; status: "expiring" | "expired" | "vacated" };

  // Base year and held security deposit come from the same per-unit sources the
  // dashboard uses, keyed by unitRef.
  const [tenantMeta, setTenantMeta] = useState<Record<string, { baseYear?: number | string | null }>>({});
  const [depositOwed, setDepositOwed] = useState<Record<string, number>>({});
  useEffect(() => {
    fetch("/api/tenant-meta").then((r) => (r.ok ? r.json() : null)).then((j) => setTenantMeta(j?.tenantMeta ?? {})).catch(() => {});
    fetch("/api/deposits", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => {
      const owed: Record<string, number> = {};
      for (const d of (j?.deposits ?? []) as { unitRef?: string; amount?: number; refunded?: boolean; tenantDefaulted?: boolean; partialRefund?: boolean }[]) {
        if (!d.unitRef) continue;
        const held = d.refunded || d.tenantDefaulted || d.partialRefund ? 0 : (d.amount ?? 0);
        owed[d.unitRef] = (owed[d.unitRef] ?? 0) + held;
      }
      setDepositOwed(owed);
    }).catch(() => {});
  }, []);

  const upcoming: Row[] = report.expirations
    .filter((e) => e.days >= 0)
    .map((e) => ({ propertyCode: e.propertyCode, unitRef: e.unitRef, tenant: e.tenant, sqft: e.sqft, leaseTo: e.leaseTo, days: e.days, status: "expiring" }));
  const recent: Row[] = [
    ...report.vacated.map((v) => ({ propertyCode: v.propertyCode, unitRef: v.unitRef, tenant: v.tenant, sqft: v.sqft, leaseTo: null as string | null, days: null as number | null, status: "vacated" as const })),
    ...report.expirations.filter((e) => e.days < 0).map((e) => ({ propertyCode: e.propertyCode, unitRef: e.unitRef, tenant: e.tenant, sqft: e.sqft, leaseTo: e.leaseTo, days: e.days, status: "expired" as const })),
  ].sort((a, b) => a.tenant.localeCompare(b.tenant));

  const stmtHref = (r: Row) => {
    const p = leaseToParts(r.leaseTo);
    const y = p?.y ?? reconYear;
    const asOf = p?.m ?? null;
    return `/cam-recon/interim?property=${r.propertyCode}&unitRef=${encodeURIComponent(r.unitRef)}&year=${y}${asOf ? `&asOf=${asOf}` : ""}`;
  };

  // Row tint conveys urgency in place of a status column: soonest-expiring red,
  // then orange, then yellow; recently vacated / expired get the grey fill.
  const rowBg = (r: Row): string | undefined => {
    if (r.status === "vacated" || r.status === "expired") return "rgba(100,116,139,0.08)";
    const d = r.days ?? 999;
    return d <= 30 ? "rgba(220,38,38,0.08)" : d <= 60 ? "rgba(234,88,12,0.07)" : "rgba(234,179,8,0.11)";
  };

  const dep = (unitRef: string) =>
    depositOwed[unitRef] ? "$" + Math.round(depositOwed[unitRef]).toLocaleString("en-US") : <span className="muted">—</span>;

  const renderRows = (rows: Row[]) => rows.map((r, i) => {
    const gone = r.status === "vacated" || r.status === "expired";
    return (
      <tr key={`${r.status}-${r.unitRef}-${i}`} style={{ background: rowBg(r) }}>
        <td style={{ fontWeight: 600 }}>
          {r.tenant}
          {r.status === "vacated" && <GonePill text="VACATED" />}
          {r.status === "expired" && <GonePill text="EXPIRED" />}
        </td>
        <td className="muted small">{r.propertyCode}</td>
        <td><code style={{ fontSize: 11 }}>{r.unitRef}</code></td>
        <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.sqft ? sf(Math.round(r.sqft)) : "—"}</td>
        <td className="muted small" style={{ whiteSpace: "nowrap" }}>{r.leaseTo ?? "—"}</td>
        <td style={{ textAlign: "center", fontSize: 13 }}>{baseYear2(tenantMeta[r.unitRef]?.baseYear)}</td>
        <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}
          title={depositOwed[r.unitRef] ? "Security deposit held / owed back to the tenant" : "No security deposit on file"}>
          {dep(r.unitRef)}
        </td>
        <td style={{ textAlign: "right" }}>
          <Link href={stmtHref(r)} className="noprint" style={{ color: "#0b4a7d", fontWeight: 600, fontSize: 12, textDecoration: "none", whiteSpace: "nowrap" }}>
            {gone ? "Close out →" : "Statement →"}
          </Link>
        </td>
      </tr>
    );
  });

  const total = upcoming.length + recent.length;
  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "#0b4a7d" }}>
          Vacating &amp; Expiring <span className="muted" style={{ fontWeight: 600, textTransform: "none", letterSpacing: 0 }}>· recently vacated (60d) + expiring (90d)</span>
        </div>
        <Link href="/rentroll/leasing" className="noprint muted small" style={{ color: "#0b4a7d", fontWeight: 600, textDecoration: "none" }}>Leasing activity →</Link>
      </div>
      {total === 0 ? (
        <div className="muted small">No tenants vacating, recently vacated, or expiring in the window.</div>
      ) : (
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Tenant</th><th>Property</th><th>Unit</th>
                <th style={{ textAlign: "right" }}>Sq Ft</th><th>Lease To</th>
                <th style={{ textAlign: "center" }}>B/Y</th>
                <th style={{ textAlign: "right" }}>Sec. Deposit</th><th></th>
              </tr>
            </thead>
            <tbody>
              {renderRows(recent)}
              {renderRows(upcoming)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

"use client";
import { ChevronRight } from "lucide-react";

// Tami's dashboard — the receivables, and nothing else (owner, 11/2026: "can
// tamis dashboard just show tenants with open credits and tenants with open AR
// items? she really just needs a constrained narrow view into this process").
//
// Read off the newest laser statement through the SAME endpoint Monthly
// Statements uses (`/api/tenant-statements/[period]` — its `credits` tracker
// and each tenant's `summarize`), so the two cannot disagree. A row opens the
// tenant in Receipt Reconciliation, where a payment is worked.

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { StatPill, Pill, TONE_AMBER } from "@/app/components/Pill";
import { th, td, thL, tdL } from "@/app/components/tableStyles";
import type { OpenCreditTracker } from "@/lib/statements/openCredits";
import type { LastContact } from "@/lib/statements/correspondence";
import { LastContactCell, needsFollowUp } from "@/app/tenant-statements/Correspondence";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const periodLabel = (p: string) => `${MONTHS[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`;
const money = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const money0 = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const dateLabel = (iso: string | null) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}/${iso.slice(2, 4)}` : "—");
const SECTION: React.CSSProperties = { fontSize: "var(--fs-11)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" };

type Tenant = {
  unitRef: string; tenantName: string; propertyCode: string; suite: string;
  exportedAt?: string | null; importedAt?: string;
  summary: { totalDue: number; currentCharges: number; pastDueAmount: number; credits: number; oldestISO: string | null };
};
type Period = { period: string; properties: { code: string; name: string }[]; credits: OpenCreditTracker; tenants: Tenant[] };

const receiptLink = (period: string, unit: string) => `/tenant-statements/receipts?period=${period}&unit=${encodeURIComponent(unit)}`;

export default function ReceivablesOverview() {
  const [data, setData] = useState<Period | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [arSort, setArSort] = useState<"pastDue" | "total" | "property" | "contact">("pastDue");
  // When each suite was last emailed from the portal — so a tenant who owes
  // and has heard nothing reads at a glance.
  const [contacts, setContacts] = useState<Record<string, LastContact>>({});
  useEffect(() => {
    let alive = true;
    fetch("/api/tenant-statements/correspondence", { cache: "no-store" }).then((r) => r.json())
      .then((j) => { if (alive && j?.ok) setContacts(j.last); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const contactOf = (u: string) => contacts[u.toUpperCase()] ?? null;

  useEffect(() => {
    let alive = true;
    (async () => {
      const list = await fetch("/api/tenant-statements", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      const period: string | undefined = list?.periods?.[0]?.period;
      if (!period) { if (alive) setError("No Laser Statement has been imported yet."); return; }
      const j = await fetch(`/api/tenant-statements/${period}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      if (!alive) return;
      if (!j?.ok) setError(j?.error ?? "Could not load the statements.");
      else setData(j);
    })();
    return () => { alive = false; };
  }, []);

  const propName = useMemo(() => new Map((data?.properties ?? []).map((p) => [p.code, p.name])), [data]);
  const owing = useMemo(() => {
    const rows = (data?.tenants ?? []).filter((t) => t.summary.totalDue > 0.005);
    const sorted = [...rows];
    if (arSort === "pastDue") sorted.sort((a, b) => b.summary.pastDueAmount - a.summary.pastDueAmount || b.summary.totalDue - a.summary.totalDue);
    else if (arSort === "total") sorted.sort((a, b) => b.summary.totalDue - a.summary.totalDue);
    else if (arSort === "contact") {
      // Longest since we last wrote first; never written to, first of all.
      const at = (u: string) => contacts[u.toUpperCase()]?.last.sentAt ?? "";
      sorted.sort((a, b) => at(a.unitRef).localeCompare(at(b.unitRef)) || b.summary.totalDue - a.summary.totalDue);
    }
    return sorted; // "property" keeps the Laser Statement's own (property) order
  }, [data, arSort, contacts]);
  const followUps = useMemo(() => owing.filter((t) => needsFollowUp(t.summary.totalDue, contacts[t.unitRef.toUpperCase()])).length, [owing, contacts]);
  const credits = useMemo(() => (data?.credits.groups ?? []).flatMap((g) => g.rows.map((r) => ({ ...r, group: g.group }))), [data]);
  const totals = useMemo(() => ({
    open: owing.reduce((a, t) => a + t.summary.totalDue, 0),
    pastDue: owing.reduce((a, t) => a + t.summary.pastDueAmount, 0),
    pastDueCount: owing.filter((t) => t.summary.pastDueAmount > 0.005).length,
  }), [owing]);
  const dataThrough = useMemo(() => {
    const ts = (data?.tenants ?? []).map((t) => t.exportedAt ?? "").filter(Boolean).sort();
    const imp = (data?.tenants ?? []).map((t) => t.importedAt ?? "").filter(Boolean).sort();
    return { exported: ts[ts.length - 1] ?? null, imported: imp[imp.length - 1] ?? null };
  }, [data]);

  return (
    <main style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Receivables</h1>
          <div className="muted small" style={{ marginTop: 6 }}>
            {data ? <>{periodLabel(data.period)} Laser Statement{dataThrough.exported
              ? <> · data through {new Date(dataThrough.exported).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</>
              : dataThrough.imported ? <> · imported {new Date(dataThrough.imported).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" })}</> : null} — open items only</> : "Open credits and open A/R from the latest Laser Statement."}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link className="btn" href="/tenant-statements" style={{ textDecoration: "none" }}>Monthly Statements</Link>
          <Link className="btn primary" href="/tenant-statements/receipts" style={{ textDecoration: "none" }}>Receipt Reconciliation<ChevronRight size={16} strokeWidth={1.75} aria-hidden style={{ verticalAlign: "-3px", flexShrink: 0 }} /></Link>
        </div>
      </header>

      {error && <div className="card muted small">{error}</div>}
      {!data && !error && <div className="card muted small">Loading…</div>}

      {data && (
        <>
          <div className="pills" style={{ justifyContent: "flex-start", margin: 0 }}>
            <StatPill label="Open A/R" value={money0(totals.open)} sub={plural(owing.length, "tenant")} total />
            <StatPill label="Past due" value={money0(totals.pastDue)} sub={plural(totals.pastDueCount, "tenant")} accent={totals.pastDue > 0.5 ? "var(--c-b91c1c)" : undefined} />
            <StatPill label="Open credits" value={money0(data.credits.total)} sub={plural(data.credits.count, "tenant")} accent={data.credits.count ? "var(--c-15803d)" : undefined} />
            <StatPill label="Net credit" value={money0(data.credits.netCreditTotal)} sub={`${data.credits.netCreditCount} owed a refund or credit`} />
          </div>

          {/* ── Open credits ── */}
          <section className="card" style={{ padding: 0 }}>
            <div style={{ padding: "14px 18px 6px", display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontSize: 17, fontWeight: 800 }}>Tenants with open credits <span className="muted" style={{ fontSize: "var(--fs-13)", fontWeight: 600 }}>· {credits.length}</span></div>
              <div className="muted small">Apply them to bring tenants current — click a tenant to work it in Receipt Reconciliation.</div>
            </div>
            {!credits.length ? <div className="muted small" style={{ padding: "6px 18px 16px" }}>No tenant carries a credit on this statement.</div> : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr>
                    <th style={thL}>Tenant</th><th style={thL}>Property</th><th style={th}>Credit</th><th style={th}>Open charges</th><th style={th}>Net</th><th style={thL}>Since</th>
                  </tr></thead>
                  <tbody>
                    {data.credits.groups.map((g) => (
                      <Fragment key={g.group}>
                        <tr style={{ background: "var(--tint-brand-bg, rgba(11,74,125,0.07))" }}>
                          <td colSpan={6} style={{ ...tdL, fontWeight: 800 }}>{g.group} <span className="muted" style={{ fontWeight: 500, fontSize: "var(--fs-12)" }}>· {g.count} · {money0(g.credit)}</span></td>
                        </tr>
                        {g.rows.map((r) => (
                          <tr key={r.unitRef} style={{ borderTop: "1px solid var(--border)" }}>
                            <td style={{ ...tdL, whiteSpace: "normal" }}>
                              <Link href={receiptLink(data.period, r.unitRef)} style={{ fontWeight: 600, color: "inherit" }}>{r.tenantName}</Link>{" "}
                              <code className="muted" style={{ fontSize: "var(--fs-12)" }}>{r.unitRef}</code>
                            </td>
                            <td style={tdL}><span className="muted small">{propName.get(r.propertyCode) ?? r.propertyCode}</span></td>
                            <td style={{ ...td, fontWeight: 700, color: "var(--c-15803d)" }}>({money(r.credit)})</td>
                            <td style={td}>{r.openCharges > 0.005 ? money(r.openCharges) : <span className="muted">—</span>}</td>
                            <td style={{ ...td, fontWeight: 700, color: r.net < -0.005 ? "var(--c-15803d)" : undefined }}>{r.net < -0.005 ? `(${money(-r.net)})` : money(r.net)}</td>
                            <td style={tdL}>{r.months >= 3 ? <Pill tone={TONE_AMBER}>{r.months} MONTHS</Pill> : <span className="muted small">{periodLabel(r.since)}</span>}</td>
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ── Open A/R ── */}
          <section className="card" style={{ padding: 0 }}>
            <div style={{ padding: "14px 18px 6px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontSize: 17, fontWeight: 800 }}>Tenants with open A/R <span className="muted" style={{ fontSize: "var(--fs-13)", fontWeight: 600 }}>· {owing.length}</span>
                {followUps > 0 && <span style={{ marginLeft: 8 }}><Pill tone={TONE_AMBER}>{`${followUps} ${followUps === 1 ? "NEEDS" : "NEED"} FOLLOW-UP`}</Pill></span>}</div>
              <select className="select-sm" value={arSort} onChange={(e) => setArSort(e.target.value as typeof arSort)} aria-label="Sort">
                <option value="pastDue">Most past due first</option>
                <option value="total">Largest balance first</option>
                <option value="contact">Longest since last contact</option>
                <option value="property">Statement order</option>
              </select>
            </div>
            {!owing.length ? <div className="muted small" style={{ padding: "6px 18px 16px" }}>No tenant owes anything on this statement.</div> : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr>
                    <th style={thL}>Tenant</th><th style={thL}>Property</th><th style={thL}>Oldest</th><th style={th}>Current</th><th style={th}>Past due</th><th style={th}>Credit</th><th style={th}>Balance due</th><th style={thL}>Last contact</th>
                  </tr></thead>
                  <tbody>
                    {owing.map((t) => (
                      <tr key={t.unitRef} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={{ ...tdL, whiteSpace: "normal" }}>
                          <Link href={receiptLink(data.period, t.unitRef)} style={{ fontWeight: 600, color: "inherit" }}>{t.tenantName}</Link>{" "}
                          <code className="muted" style={{ fontSize: "var(--fs-12)" }}>{t.unitRef}</code>
                        </td>
                        <td style={tdL}><span className="muted small">{propName.get(t.propertyCode) ?? t.propertyCode}</span></td>
                        <td style={tdL}><span className="muted small">{dateLabel(t.summary.oldestISO)}</span></td>
                        <td style={td}>{t.summary.currentCharges > 0.005 ? money(t.summary.currentCharges) : <span className="muted">—</span>}</td>
                        <td style={{ ...td, fontWeight: t.summary.pastDueAmount > 0.005 ? 700 : 400, color: t.summary.pastDueAmount > 0.005 ? "var(--c-b91c1c)" : "var(--muted)" }}>{t.summary.pastDueAmount > 0.005 ? money(t.summary.pastDueAmount) : "—"}</td>
                        <td style={{ ...td, color: t.summary.credits > 0.005 ? "var(--c-15803d)" : "var(--muted)" }}>{t.summary.credits > 0.005 ? `(${money(t.summary.credits)})` : "—"}</td>
                        <td style={{ ...td, fontWeight: 800 }}>{money(t.summary.totalDue)}</td>
                        <td style={{ ...tdL, whiteSpace: "nowrap" }}><LastContactCell contact={contactOf(t.unitRef)} owed={t.summary.totalDue} /></td>
                      </tr>
                    ))}
                    <tr style={{ borderTop: "2px solid var(--border)" }}>
                      <td style={{ ...tdL, fontWeight: 800 }} colSpan={4}>Total · {plural(owing.length, "tenant")}</td>
                      <td style={{ ...td, fontWeight: 800, color: "var(--c-b91c1c)" }}>{money(totals.pastDue)}</td>
                      <td style={td} />
                      <td style={{ ...td, fontWeight: 800 }}>{money(totals.open)}</td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <div className="muted small" style={{ ...SECTION, textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>
            Open items only, as of the statement above. Anything posted in Skyline since — check the tenant&rsquo;s Occupant History.
          </div>
        </>
      )}
    </main>
  );
}

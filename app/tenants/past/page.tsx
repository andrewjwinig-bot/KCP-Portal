"use client";

// Past Tenants archive — a searchable record of every former tenancy, derived
// from the monthly rent-roll snapshots. Pick one to see their whole tenancy:
// the rent/charges timeline, their security deposit(s) + refund status, and
// their finalized move-out close-out. Fills the gap that the portal is otherwise
// keyed entirely by unit, so a departed tenant had nowhere to be looked up.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { StatPill } from "@/app/components/Pill";
import { Pill, TONE_GREEN, TONE_AMBER, TONE_BLUE, TONE_NEUTRAL, TONE_RED, type PillTone } from "@/app/components/Pill";

type PastTenancy = {
  key: string; unitRef: string; suite: string; propertyCode: string; propertyName: string; name: string;
  firstMonth: string; lastMonth: string; monthsOccupied: number; leaseFrom: string | null; leaseTo: string | null;
  lastSqft: number; lastBaseRent: number; lastAnnualRent: number; lastCam: number; lastRet: number; lastIns: number;
};
type TimelineMonth = { month: string; sqft: number; baseRent: number; annualRent: number; cam: number; ret: number; ins: number; leaseFrom: string | null; leaseTo: string | null };
type Deposit = { id: string; unitRef: string; tenantCompany: string; checkNumber: string; amount: number; checkDate: string; refunded: boolean; refundDate: string; tenantDefaulted: boolean; partialRefund: boolean; partialRefundAmount: number };
type CloseOut = { balance: number; deposit: number | null; net: number | null; finalizedAt: string; finalizedBy: string | null; year: number };
type Detail = PastTenancy & { timeline: TimelineMonth[]; deposits: Deposit[]; closeOut: CloseOut | null };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtMonth(ym: string): string {
  const m = ym.match(/^(\d{4})-(\d{2})$/);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : ym;
}
function money(n: number | null | undefined): string {
  if (n == null) return "—";
  return (n < 0 ? "-" : "") + "$" + Math.abs(Math.round(n)).toLocaleString("en-US");
}
function depositStatus(d: Deposit): { label: string; tone: PillTone } {
  if (d.refunded) return { label: "Refunded", tone: TONE_GREEN };
  if (d.tenantDefaulted) return { label: "Applied / forfeited", tone: TONE_RED };
  if (d.partialRefund) return { label: "Partially refunded", tone: TONE_BLUE };
  return { label: "Held", tone: TONE_AMBER };
}

const inputStyle: React.CSSProperties = { borderRadius: 8, padding: "8px 12px", fontSize: 13, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)" };
const th: React.CSSProperties = { textAlign: "left", padding: "6px 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--muted)", borderBottom: "1px solid var(--border)" };
const td: React.CSSProperties = { padding: "8px 10px", fontSize: 13, borderBottom: "1px solid var(--border)" };
const numTd: React.CSSProperties = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };

export default function PastTenantsPage() {
  const [tenancies, setTenancies] = useState<PastTenancy[] | null>(null);
  const [q, setQ] = useState("");
  const [prop, setProp] = useState("");
  const [selected, setSelected] = useState<PastTenancy | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    fetch("/api/tenants/past", { cache: "no-store" }).then((r) => r.json()).then((j) => setTenancies(j.tenancies ?? [])).catch(() => setTenancies([]));
  }, []);

  const openDetail = useCallback((t: PastTenancy) => {
    setSelected(t); setDetail(null); setDetailLoading(true);
    fetch(`/api/tenants/past?unitRef=${encodeURIComponent(t.unitRef)}&name=${encodeURIComponent(t.name)}`, { cache: "no-store" })
      .then((r) => r.json()).then((j) => setDetail(j.detail ?? null)).catch(() => setDetail(null)).finally(() => setDetailLoading(false));
  }, []);

  const properties = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of tenancies ?? []) m.set(t.propertyCode, t.propertyName);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [tenancies]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (tenancies ?? []).filter((t) => {
      if (prop && t.propertyCode !== prop) return false;
      if (!needle) return true;
      return `${t.name} ${t.unitRef} ${t.propertyName} ${t.propertyCode}`.toLowerCase().includes(needle);
    });
  }, [tenancies, q, prop]);

  return (
    <main style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 1100, width: "100%" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Past Tenants</h1>
        <Link href="/deposits" style={{ color: "#0b4a7d", fontWeight: 600, fontSize: 13 }}>Security Deposits →</Link>
      </div>
      <p className="muted" style={{ marginTop: -6 }}>
        Former tenancies reconstructed from the monthly rent-roll history — look back at any departed tenant’s rent, charges, and security deposit. Pick one to see their full record.
      </p>

      <div className="card" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tenant, unit, or property…" style={{ ...inputStyle, flex: "1 1 280px" }} />
        <select value={prop} onChange={(e) => setProp(e.target.value)} style={inputStyle}>
          <option value="">All properties</option>
          {properties.map(([code, name]) => <option key={code} value={code}>{code} · {name}</option>)}
        </select>
        <span className="muted small" style={{ marginLeft: "auto" }}>
          {tenancies == null ? "Loading…" : `${filtered.length} former tenanc${filtered.length === 1 ? "y" : "ies"}`}
        </span>
      </div>

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
          <thead>
            <tr>
              <th style={th}>Tenant</th>
              <th style={th}>Unit</th>
              <th style={th}>Property</th>
              <th style={th}>Occupied</th>
              <th style={{ ...th, textAlign: "right" }}>Last base rent</th>
              <th style={{ ...th, textAlign: "right" }}>Last CAM/RET/INS</th>
            </tr>
          </thead>
          <tbody>
            {(filtered).map((t) => (
              <tr key={t.key} onClick={() => openDetail(t)} style={{ cursor: "pointer" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(11,74,125,0.04)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                <td style={{ ...td, fontWeight: 600 }}>{t.name}</td>
                <td style={td}><code style={{ fontSize: 12 }}>{t.unitRef}</code></td>
                <td style={td}>{t.propertyCode} · {t.propertyName}</td>
                <td style={{ ...td, whiteSpace: "nowrap" }}>{fmtMonth(t.firstMonth)} – {fmtMonth(t.lastMonth)} <span className="muted">({t.monthsOccupied}mo)</span></td>
                <td style={numTd}>{money(t.lastBaseRent)}</td>
                <td style={numTd}>{money(t.lastCam + t.lastRet + t.lastIns)}/mo</td>
              </tr>
            ))}
            {tenancies != null && filtered.length === 0 && (
              <tr><td style={{ ...td, textAlign: "center", color: "var(--muted)" }} colSpan={6}>No former tenants match.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <DetailModal tenancy={selected} detail={detail} loading={detailLoading} onClose={() => { setSelected(null); setDetail(null); }} />
      )}
    </main>
  );
}

function DetailModal({ tenancy, detail, loading, onClose }: { tenancy: PastTenancy; detail: Detail | null; loading: boolean; onClose: () => void }) {
  const d = detail;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "5vh 16px 16px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: "100%", maxWidth: 860, margin: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{tenancy.name}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Link href={`/units/${encodeURIComponent(tenancy.unitRef)}`} style={{ color: "#0b4a7d", fontWeight: 600, fontSize: 13 }}>Unit page →</Link>
            <button onClick={onClose} aria-label="Close" style={{ border: "none", background: "none", cursor: "pointer", fontSize: 22, color: "var(--muted)" }}>×</button>
          </div>
        </div>
        <div className="muted" style={{ marginBottom: 14, fontSize: 13 }}>
          <code style={{ fontSize: 12 }}>{tenancy.unitRef}</code> · {tenancy.propertyCode} {tenancy.propertyName} · occupied {fmtMonth(tenancy.firstMonth)} – {fmtMonth(tenancy.lastMonth)} ({tenancy.monthsOccupied} months)
          {tenancy.leaseFrom || tenancy.leaseTo ? ` · lease ${tenancy.leaseFrom ?? "?"} → ${tenancy.leaseTo ?? "?"}` : ""}
        </div>

        {loading && <div className="muted">Loading record…</div>}

        {d && (
          <>
            <div className="pills" style={{ marginBottom: 14 }}>
              <StatPill label="Months occupied" value={d.monthsOccupied} />
              <StatPill label="Last base rent" value={money(d.lastBaseRent)} sub="/mo" />
              <StatPill label="Sq ft" value={d.lastSqft.toLocaleString()} />
              <StatPill label="Last CAM" value={money(d.lastCam)} sub="/mo" />
              <StatPill label="Last RET" value={money(d.lastRet)} sub="/mo" />
              <StatPill label="Last INS" value={money(d.lastIns)} sub="/mo" />
            </div>

            {/* Security deposits */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", marginBottom: 6 }}>Security Deposit</div>
              {d.deposits.length === 0 ? (
                <div className="muted small">None on record for this unit — <Link href={`/deposits?unitRef=${encodeURIComponent(d.unitRef)}`} style={{ color: "#0b4a7d" }}>add one</Link>.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {d.deposits.map((dep) => {
                    const st = depositStatus(dep);
                    return (
                      <div key={dep.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 13 }}>
                        <Pill tone={st.tone}>{st.label}</Pill>
                        <b>{money(dep.amount)}</b>
                        {dep.checkNumber && <span className="muted">ck# {dep.checkNumber}</span>}
                        {dep.checkDate && <span className="muted">· {dep.checkDate}</span>}
                        {dep.partialRefund && dep.partialRefundAmount > 0 && <span className="muted">· refunded {money(dep.partialRefundAmount)}</span>}
                        {dep.refunded && dep.refundDate && <span className="muted">· on {dep.refundDate}</span>}
                        <Link href={`/deposits?unitRef=${encodeURIComponent(d.unitRef)}`} style={{ color: "#0b4a7d", fontSize: 12, marginLeft: "auto" }}>Manage →</Link>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Final move-out close-out */}
            {d.closeOut && (
              <div style={{ marginBottom: 14, border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px", background: "rgba(15,23,42,0.02)" }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", marginBottom: 6 }}>Final Move-Out Close-Out · {d.closeOut.year}</div>
                <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 13 }}>
                  <span>Reconciliation: <b style={{ color: d.closeOut.balance >= 0 ? "#b45309" : "#15803d" }}>{money(Math.abs(d.closeOut.balance))} {d.closeOut.balance >= 0 ? "due" : "credit"}</b></span>
                  {d.closeOut.deposit != null && <span className="muted">Deposit {money(d.closeOut.deposit)}</span>}
                  {d.closeOut.net != null && <span>Net: <b style={{ color: d.closeOut.net >= 0 ? "#15803d" : "#b45309" }}>{money(Math.abs(d.closeOut.net))} {d.closeOut.net >= 0 ? "refund" : "still due"}</b></span>}
                  <span className="muted" style={{ marginLeft: "auto" }}>Finalized {d.closeOut.finalizedAt ? new Date(d.closeOut.finalizedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : ""}{d.closeOut.finalizedBy ? ` · ${d.closeOut.finalizedBy}` : ""}</span>
                </div>
              </div>
            )}

            {/* Charges / rent timeline */}
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", marginBottom: 6 }}>Rent &amp; Charges Timeline</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
                <thead>
                  <tr>
                    <th style={th}>Month</th>
                    <th style={{ ...th, textAlign: "right" }}>Sq ft</th>
                    <th style={{ ...th, textAlign: "right" }}>Base rent</th>
                    <th style={{ ...th, textAlign: "right" }}>Annual rent</th>
                    <th style={{ ...th, textAlign: "right" }}>CAM</th>
                    <th style={{ ...th, textAlign: "right" }}>RET</th>
                    <th style={{ ...th, textAlign: "right" }}>INS</th>
                  </tr>
                </thead>
                <tbody>
                  {d.timeline.map((m) => (
                    <tr key={m.month}>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>{fmtMonth(m.month)}</td>
                      <td style={numTd}>{m.sqft ? m.sqft.toLocaleString() : "—"}</td>
                      <td style={numTd}>{money(m.baseRent)}</td>
                      <td style={numTd}>{money(m.annualRent)}</td>
                      <td style={numTd}>{money(m.cam)}</td>
                      <td style={numTd}>{money(m.ret)}</td>
                      <td style={numTd}>{money(m.ins)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

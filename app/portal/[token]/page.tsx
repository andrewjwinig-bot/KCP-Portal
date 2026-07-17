"use client";

// Tenant portal shell — the destination of every "Share with tenant" link
// (the admin flow mints /portal/[token] URLs, and the legacy /statement/[token]
// page redirects here). Reuses the same signed token. A tenant-facing sidebar:
// Lease Terms (the overview/home), Statements (which now carries the CAM/RET
// statement), Floorplan, Service Requests, Reservations; Open Balances to come.

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import LoadingState from "@/app/components/LoadingState";
import { Calendar } from "@/app/components/Calendar";
import { BOOKABLE_ROOMS } from "@/lib/reservations/rooms";
import { useStatement, TenantStatementView, Centered, BRAND, money, money2, type Statement } from "@/app/statement/[token]/StatementView";

type TabId = "lease" | "statements" | "contacts" | "floorplan" | "service" | "reservations" | "balances";
const TABS: { id: TabId; label: string; icon: React.ReactNode; ready?: boolean }[] = [
  { id: "lease", label: "Lease Terms", ready: true, icon: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></> },
  { id: "statements", label: "Statements", ready: true, icon: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></> },
  { id: "contacts", label: "Contacts", ready: true, icon: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></> },
  { id: "floorplan", label: "Floorplan", ready: true, icon: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></> },
  { id: "service", label: "Service Requests", ready: true, icon: <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /> },
  { id: "reservations", label: "Reservations", ready: true, icon: <><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></> },
  { id: "balances", label: "Open Balances", icon: <><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></> },
];

type LeaseTerms = {
  sqft: number; baseRent: number; grossRent: number; annualRent: number;
  annualRentPerSqft: number; leaseFrom: string | null; leaseTo: string | null; occupantName: string;
};
type Building = { code: string; name: string; address: string | null; city: string | null; state: string | null; zip: string | null; type: string | null; yearBuilt: number | null; sqft: number | null };
type PortalContact = { id: string; name: string; title: string; email: string; phone: string; camRecipient: boolean; source: "tenant" | "staff" };
type PortalData = { ok: true; property: string; year: number; kind: string; building: Building | null; leaseTerms: LeaseTerms | null; floorplan: { name: string; contentType: string } | null; statementYears: number[]; contacts: PortalContact[] };

function usePortal(token: string): { portal: PortalData | null; error: string | null } {
  const [portal, setPortal] = useState<PortalData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/portal/${token}`)
      .then(async (r) => ({ ok: r.ok, j: await r.json().catch(() => ({})) }))
      .then(({ ok, j }) => { if (!alive) return; if (ok && j.ok) setPortal(j); else setError(j.error ?? "Could not load."); })
      .catch(() => { if (alive) setError("Could not load."); });
    return () => { alive = false; };
  }, [token]);
  return { portal, error };
}

export default function TenantPortalPage() {
  const params = useParams<{ token: string }>();
  const token = Array.isArray(params?.token) ? params.token[0] : params?.token ?? "";
  return <PortalGate token={token} />;
}

function PortalLoading() {
  return (
    <div style={{ maxWidth: 940, margin: "0 auto", padding: "28px clamp(16px, 4vw, 44px) 60px" }}>
      <LoadingState status="Loading your account…" context="Securely retrieving your space, lease, and statements…" rows={4} columns={2} />
    </div>
  );
}

// Access gate: when the link carries a PIN, hold the portal behind a PIN entry
// screen until it's satisfied (a signed cookie then unlocks the data endpoints).
// No PIN → passes straight through to the portal.
type GateState = { pinRequired: boolean; satisfied: boolean };
function PortalGate({ token }: { token: string }) {
  const [gate, setGate] = useState<GateState | null>(null);
  const [gateErr, setGateErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/portal/${token}/verify-pin`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad"))))
      .then((j) => { if (alive) setGate({ pinRequired: !!j.pinRequired, satisfied: !!j.satisfied }); })
      .catch(() => { if (alive) setGateErr("This link is invalid or has expired."); });
    return () => { alive = false; };
  }, [token]);
  if (gateErr) return <Centered><div style={{ fontWeight: 700, fontSize: 18, color: BRAND }}>Tenant Portal</div><p className="muted" style={{ marginTop: 8 }}>{gateErr}</p></Centered>;
  if (!gate) return <PortalLoading />;
  if (gate.pinRequired && !gate.satisfied) return <PinGate token={token} onUnlocked={() => setGate({ pinRequired: true, satisfied: true })} />;
  return <PortalContent token={token} />;
}

function PinGate({ token, onUnlocked }: { token: string; onUnlocked: () => void }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !pin.trim()) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/portal/${token}/verify-pin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: pin.trim() }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "That PIN doesn't match.");
      onUnlocked();
    } catch (e) { setErr(e instanceof Error ? e.message : "That PIN doesn't match."); setPin(""); } finally { setBusy(false); }
  }
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "var(--bg, #f7f9fc)" }}>
      <form onSubmit={submit} style={{ width: "100%", maxWidth: 380, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, boxShadow: "var(--shadow)", padding: "34px 28px", textAlign: "center" }}>
        <div style={{ width: 52, height: 52, margin: "0 auto 14px", borderRadius: "50%", background: "rgba(11,74,125,0.09)", color: BRAND, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
        </div>
        <div style={{ fontFamily: "'Arial Black', Arial, sans-serif", fontWeight: 900, fontSize: 19, color: BRAND, letterSpacing: "-0.5px" }}>KORMAN</div>
        <h1 style={{ fontSize: 22, lineHeight: 1.15, margin: "12px 0 6px" }}>Enter your access PIN</h1>
        <p className="muted" style={{ fontSize: 14, marginBottom: 18 }}>This statement is protected. Enter the PIN Korman shared with you to continue.</p>
        <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))} inputMode="numeric" autoFocus placeholder="••••••"
          style={{ width: "100%", boxSizing: "border-box", textAlign: "center", fontSize: 26, letterSpacing: "0.4em", fontWeight: 800, padding: "12px 10px", border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg, #fff)", color: "var(--text)", outline: "none", fontFamily: "inherit" }} />
        {err && <div style={{ color: "#b91c1c", fontSize: 13, fontWeight: 600, marginTop: 12 }}>{err}</div>}
        <button type="submit" disabled={busy || !pin.trim()} style={{ marginTop: 18, width: "100%", background: BRAND, color: "#fff", border: "none", borderRadius: 10, padding: "13px", fontSize: 15, fontWeight: 700, cursor: busy || !pin.trim() ? "default" : "pointer", opacity: busy || !pin.trim() ? 0.6 : 1, fontFamily: "inherit" }}>{busy ? "Checking…" : "View my statement"}</button>
      </form>
    </div>
  );
}

function PortalContent({ token }: { token: string }) {
  const { data, error } = useStatement(token);
  const { portal } = usePortal(token);
  const [tab, setTab] = useState<TabId>("lease");
  // Mobile: the sidebar folds into a top bar + slide-in drawer under 760px.
  const [isNarrow, setIsNarrow] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 760px)");
    const apply = () => { setIsNarrow(mq.matches); if (!mq.matches) setNavOpen(false); };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  if (error) return <Centered><div style={{ fontWeight: 700, fontSize: 18, color: BRAND }}>Tenant Portal</div><p className="muted" style={{ marginTop: 8 }}>{error}</p></Centered>;
  if (!data) return <PortalLoading />;
  const t = data.tenant;

  const Nav = () => (
    <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {TABS.map((x) => {
        const active = tab === x.id;
        return (
          <button key={x.id} onClick={() => { setTab(x.id); setNavOpen(false); }}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit", fontSize: 14,
              fontWeight: active ? 700 : 500, color: active ? "#fff" : "#e0f0ff", background: active ? "rgba(255,255,255,0.18)" : "transparent" }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>{x.icon}</svg>
            <span style={{ flex: 1 }}>{x.label}</span>
            {!x.ready && <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.05em", color: "#bfdbfe", opacity: 0.8 }}>SOON</span>}
          </button>
        );
      })}
    </nav>
  );

  const asideStyle: React.CSSProperties = isNarrow
    ? { width: 264, maxWidth: "84vw", background: BRAND, color: "#fff", padding: 18, display: "flex", flexDirection: "column", gap: 18,
        position: "fixed", top: 0, bottom: 0, left: 0, zIndex: 60, overflowY: "auto",
        transform: navOpen ? "translateX(0)" : "translateX(-100%)", transition: "transform 0.22s ease",
        boxShadow: navOpen ? "0 0 40px rgba(2,6,23,0.4)" : "none" }
    : { width: 244, flexShrink: 0, background: BRAND, color: "#fff", padding: 18, display: "flex", flexDirection: "column", gap: 18, minHeight: "100vh" };

  return (
    <div style={{ display: isNarrow ? "block" : "flex", minHeight: "100vh", background: "var(--bg, #f7f9fc)" }}>
      {/* Mobile top bar with the tenant name + menu toggle */}
      {isNarrow && (
        <header style={{ position: "sticky", top: 0, zIndex: 40, background: BRAND, color: "#fff", display: "flex", alignItems: "center", gap: 12, padding: "10px 14px" }}>
          <button type="button" aria-label="Open menu" onClick={() => setNavOpen(true)}
            style={{ flexShrink: 0, width: 38, height: 38, borderRadius: 9, border: "1px solid rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.12)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
          </button>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</div>
            <div style={{ fontSize: 11.5, color: "#bfdbfe", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{data.propertyName} · Suite {t.suite}</div>
          </div>
        </header>
      )}

      {/* Drawer scrim */}
      {isNarrow && navOpen && (
        <div onClick={() => setNavOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 55, background: "rgba(15,23,42,0.45)" }} />
      )}

      <aside style={asideStyle} className="portal-aside">
        <div>
          <div style={{ fontSize: 19, fontWeight: 800, lineHeight: 1.2, letterSpacing: "-0.01em" }}>{t.name}</div>
          <div style={{ fontSize: 12.5, color: "#bfdbfe", marginTop: 4 }}>{data.propertyName} · Suite {t.suite}</div>
          {portal?.building && (portal.building.city || portal.building.address) && (
            <div style={{ fontSize: 11.5, color: "#9dc3e6", marginTop: 2 }}>
              {[portal.building.city, portal.building.state].filter(Boolean).join(", ")}
            </div>
          )}
        </div>
        <Nav />
        {/* Korman wordmark pinned to the bottom of the sidebar */}
        <div style={{ marginTop: "auto", borderTop: "1px solid rgba(255,255,255,0.15)", paddingTop: 14 }}>
          <div style={{ fontFamily: "'Arial Black', Arial, sans-serif", fontWeight: 900, fontSize: 20, letterSpacing: "-0.5px" }}>KORMAN</div>
          <div style={{ fontSize: 9, letterSpacing: "0.18em", color: "#bfdbfe" }}>COMMERCIAL PROPERTIES</div>
        </div>
      </aside>

      <main style={{ flex: 1, minWidth: 0, padding: isNarrow ? "22px clamp(14px, 5vw, 24px) 60px" : "34px clamp(18px, 4vw, 48px) 72px", maxWidth: isNarrow ? "none" : 960, width: "100%" }}>
        {tab === "lease" ? (
          <LeaseTab terms={portal?.leaseTerms ?? null} building={portal?.building ?? null} loading={!portal} suite={t.suite} company={t.name} />
        ) : tab === "statements" ? (
          <StatementsTab token={token} data={data} years={portal?.statementYears ?? null} />
        ) : tab === "contacts" ? (
          <ContactsTab token={token} initial={portal?.contacts ?? null} />
        ) : tab === "floorplan" ? (
          <FloorplanTab token={token} floorplan={portal?.floorplan ?? null} loading={!portal} />
        ) : tab === "service" ? (
          <ServiceTab token={token} company={t.name} property={data.property} propertyName={data.propertyName} unitRef={t.unitRef} />
        ) : tab === "reservations" ? (
          <ReservationTab token={token} company={t.name} />
        ) : (
          <ComingSoon label={TABS.find((x) => x.id === tab)!.label} />
        )}
      </main>
    </div>
  );
}

// Shared large page header — h1 across every portal page, with an optional
// right-aligned action (download button, year pill, …).
function PageHeader({ title, sub, right }: { title: string; sub?: React.ReactNode; right?: React.ReactNode }) {
  // Plain <h1> so it inherits the app's global h1 sizing (54px / 36px on mobile).
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
      <div>
        <h1 style={{ margin: 0 }}>{title}</h1>
        {sub && <div className="muted" style={{ fontSize: 15, marginTop: 8 }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}

const YearPill = ({ year }: { year: number }) => (
  <span style={{ fontSize: 14, fontWeight: 800, color: "#fff", background: BRAND, borderRadius: 999, padding: "3px 12px", lineHeight: 1.4 }}>{year}</span>
);

function formatAddress(b: Building): string {
  const cityLine = [b.city, [b.state, b.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [b.address, cityLine].filter(Boolean).join(", ");
}

// Building overview hero for the Lease Terms page — name, address, and key facts.
function BuildingCard({ building, suite }: { building: Building; suite: string }) {
  const facts: { label: string; value: React.ReactNode }[] = [{ label: "Suite", value: suite }];
  if (building.type) facts.push({ label: "Type", value: building.type });
  if (building.yearBuilt) facts.push({ label: "Year Built", value: building.yearBuilt });
  if (building.sqft) facts.push({ label: "Building Size", value: `${building.sqft.toLocaleString("en-US")} sf` });
  const address = formatAddress(building);
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", background: "var(--card)", boxShadow: "var(--shadow)" }}>
      <div style={{ display: "flex", gap: 16, padding: "18px 20px", alignItems: "center" }}>
        <div style={{ width: 46, height: 46, flexShrink: 0, borderRadius: 12, background: "rgba(11,74,125,0.09)", color: BRAND, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M9 8h1m-1 4h1m4-4h1m-1 4h1M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16" /></svg>
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 19, fontWeight: 800 }}>{building.name}</div>
          {address && (
            <div className="muted" style={{ fontSize: 14, marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
              {address}
            </div>
          )}
        </div>
      </div>
      {facts.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", borderTop: "1px solid var(--border)", background: "rgba(15,23,42,0.015)" }}>
          {facts.map((f, i) => (
            <div key={f.label} style={{ padding: "12px 18px", borderLeft: i ? "1px solid var(--border)" : "none", flex: "1 1 auto", minWidth: 112 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--muted)" }}>{f.label}</div>
              <div style={{ fontSize: 15.5, fontWeight: 700, marginTop: 3 }}>{f.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function daysUntil(mmddyyyy: string | null): number | null {
  if (!mmddyyyy) return null;
  const m = mmddyyyy.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const yr = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const end = new Date(yr, Number(m[1]) - 1, Number(m[2]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - today.getTime()) / 86_400_000);
}

function LeaseTab({ terms, building, loading, suite, company }: { terms: LeaseTerms | null; building: Building | null; loading: boolean; suite: string; company: string }) {
  const days = terms ? daysUntil(terms.leaseTo) : null;
  const nearing = days != null && days <= 90;
  const expMsg = days == null ? "" : days < 0
    ? `Your lease ended on ${terms?.leaseTo} (${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago).`
    : days === 0
    ? `Your lease expires today (${terms?.leaseTo}).`
    : `Your lease expires in ${days} day${days === 1 ? "" : "s"} — ${terms?.leaseTo}.`;
  const Stat = ({ label, value }: { label: string; value: string }) => (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "16px 18px", background: "var(--card)", boxShadow: "var(--shadow)" }}>
      <div style={{ fontSize: 22, fontWeight: 800 }}>{value}</div>
      <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>{label}</div>
    </div>
  );
  return (
    <>
      <PageHeader title="Lease Terms" sub={`${company} · Suite ${suite}`} />
      {building && <div style={{ marginBottom: 22 }}><BuildingCard building={building} suite={suite} /></div>}
      {loading ? (
        <div className="muted" style={{ fontSize: 14 }}>Loading your lease…</div>
      ) : !terms ? (
        <div style={{ border: "1px dashed var(--border)", borderRadius: 12, padding: "40px 16px", textAlign: "center", color: "var(--muted)", fontSize: 14 }}>Lease details aren&rsquo;t available for your suite right now.</div>
      ) : (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)", margin: "0 0 12px" }}>Your Lease</div>
          {(terms.leaseFrom || terms.leaseTo) && (
            <div style={{ marginBottom: 12, border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", background: "var(--card)", boxShadow: "var(--shadow)", display: "flex", alignItems: "center", gap: 10, fontSize: 15, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)" }}>Lease Term</span>
              <span style={{ fontWeight: 700 }}>{terms.leaseFrom ?? "—"}</span>
              <span className="muted">→</span>
              <span style={{ fontWeight: 700 }}>{terms.leaseTo ?? "—"}</span>
            </div>
          )}
          {nearing && (
            <div style={{ marginBottom: 12, borderRadius: 12, padding: "12px 16px", background: "rgba(180,83,9,0.08)", border: "1px solid rgba(180,83,9,0.35)", color: "#b45309", fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 10 }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
              <span>{expMsg} Please reach out to Korman Commercial Properties to discuss renewal.</span>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
            <Stat label="Sq Ft" value={terms.sqft.toLocaleString("en-US")} />
            <Stat label="Annual $/sf" value={money2(terms.annualRentPerSqft)} />
            <Stat label="Base Rent / mo" value={money(terms.baseRent)} />
            <Stat label="Gross Rent / mo" value={money(terms.grossRent)} />
            <Stat label="Annual Rent" value={money(terms.annualRent)} />
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
            Figures reflect your current rent-roll record. Gross rent includes base rent plus estimated CAM, real estate tax, and other monthly charges. Questions? Contact Korman Commercial Properties.
          </p>
        </>
      )}
    </>
  );
}

function FloorplanTab({ token, floorplan, loading }: { token: string; floorplan: { name: string; contentType: string } | null; loading: boolean }) {
  const src = `/api/portal/${token}/floorplan`;
  const isImage = floorplan?.contentType.startsWith("image/");
  const download = !loading && floorplan ? (
    <a href={`${src}?download=1`} style={{ display: "inline-flex", alignItems: "center", gap: 7, background: BRAND, color: "#fff", textDecoration: "none", borderRadius: 8, padding: "9px 15px", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
      Download floorplan
    </a>
  ) : undefined;
  return (
    <>
      <PageHeader title="Floorplan" sub={floorplan ? floorplan.name : undefined} right={download} />
      {loading ? (
        <div className="muted" style={{ fontSize: 14 }}>Loading…</div>
      ) : !floorplan ? (
        <div style={{ border: "1px dashed var(--border)", borderRadius: 12, padding: "40px 16px", textAlign: "center", color: "var(--muted)", fontSize: 14 }}>
          No floorplan is on file for your suite yet.
        </div>
      ) : isImage ? (
        <a href={src} target="_blank" rel="noreferrer">
          <img src={src} alt="Suite floorplan" style={{ width: "100%", maxHeight: "82vh", objectFit: "contain", borderRadius: 12, border: "1px solid var(--border)", background: "rgba(15,23,42,0.02)", display: "block" }} />
        </a>
      ) : (
        <iframe title="Suite floorplan" src={`${src}#toolbar=0&navpanes=0&view=FitH`} style={{ width: "100%", height: "82vh", borderRadius: 12, border: "1px solid var(--border)", background: "rgba(15,23,42,0.02)" }} />
      )}
    </>
  );
}

// Statements now carries the CAM/RET statement itself (current year rendered
// inline) plus a list of prior years to download.
function StatementsTab({ token, data, years }: { token: string; data: Statement; years: number[] | null }) {
  const prior = (years ?? []).filter((y) => y !== data.year).sort((a, b) => b - a);
  return (
    <>
      <PageHeader title="Statements" sub="Your reconciliations and account statements." right={<YearPill year={data.year} />} />
      {/* Statement-type sub-nav. CAM / RET today; monthly rent statements to come
          (this is where they'll slot in as a sibling subpage). */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        <span style={{ fontSize: 13, fontWeight: 700, padding: "7px 14px", borderRadius: 999, background: BRAND, color: "#fff" }}>CAM / RET</span>
        <span style={{ fontSize: 13, fontWeight: 600, padding: "7px 14px", borderRadius: 999, background: "rgba(15,23,42,0.04)", color: "var(--muted)", border: "1px solid var(--border)" }}>Monthly Rent · Coming soon</span>
      </div>
      <TenantStatementView token={token} data={data} header={false} />
      {prior.length > 0 && (
        <section style={{ marginTop: 32 }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 800 }}>Previous years</h2>
          <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
            {prior.map((yr, i) => (
              <div key={yr} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderTop: i ? "1px solid var(--border)" : "none" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{yr} CAM / RET Statement</div>
                  <div className="muted" style={{ fontSize: 12.5, marginTop: 1 }}>Year-end reconciliation</div>
                </div>
                <a href={`/api/portal/${token}/statement/pdf?year=${yr}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: BRAND, color: "#fff", textDecoration: "none", borderRadius: 8, padding: "7px 13px", fontSize: 12.5, fontWeight: 700 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                  PDF
                </a>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

const MailIcon = () => (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 5L2 7" /></svg>);
const PhoneIcon = () => (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>);

function contactInitials(name: string, email: string): string {
  const src = (name || email).trim();
  if (!src) return "?";
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

const contactInput: React.CSSProperties = { width: "100%", padding: "9px 11px", fontSize: 14, fontFamily: "inherit", border: "1px solid var(--border)", borderRadius: 8, background: "var(--card)", color: "var(--text)", outline: "none" };

// Tenants fully manage their suite's contact list — add, edit, delete — and pick
// which contacts receive their statements. Writes to the same per-suite store the
// admin unit page edits, so changes sync there.
function ContactsTab({ token, initial }: { token: string; initial: PortalContact[] | null }) {
  const [contacts, setContacts] = useState<PortalContact[] | null>(initial);
  useEffect(() => { setContacts(initial); }, [initial]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", title: "", email: "", phone: "" });
  const [addForm, setAddForm] = useState({ name: "", title: "", email: "", phone: "" });

  async function call(method: string, opts: { body?: object; qs?: string; okMsg?: never } = {}): Promise<boolean> {
    if (busy) return false;
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/portal/${token}/contacts${opts.qs ?? ""}`, {
        method,
        headers: opts.body ? { "Content-Type": "application/json" } : undefined,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Something went wrong.");
      setContacts(j.contacts);
      return true;
    } catch (e) { setErr(e instanceof Error ? e.message : "Something went wrong."); return false; }
    finally { setBusy(false); }
  }
  async function add(e: React.FormEvent) { e.preventDefault(); if (await call("POST", { body: addForm })) setAddForm({ name: "", title: "", email: "", phone: "" }); }
  async function saveEdit(id: string) { if (await call("PUT", { body: { id, ...form } })) setEditing(null); }
  async function remove(id: string) { if (confirm("Remove this contact?")) await call("DELETE", { qs: `?id=${encodeURIComponent(id)}` }); }
  function toggleRecipient(c: PortalContact) { void call("PUT", { body: { id: c.id, camRecipient: !c.camRecipient } }); }
  function startEdit(c: PortalContact) { setForm({ name: c.name, title: c.title, email: c.email, phone: c.phone }); setEditing(c.id); }

  const iconBtn: React.CSSProperties = { flexShrink: 0, background: "none", border: "1px solid var(--border)", cursor: busy ? "default" : "pointer", color: "var(--muted)", padding: 6, borderRadius: 7, lineHeight: 0, display: "inline-flex" };

  return (
    <>
      <PageHeader title="Contacts" sub="People at your company we should reach for billing, service, and building matters. Anything you change here syncs to your property manager." />
      {contacts === null ? (
        <div className="muted" style={{ fontSize: 14 }}>Loading contacts…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {contacts.length === 0 && (
            <div style={{ border: "1px dashed var(--border)", borderRadius: 12, padding: "34px 16px", textAlign: "center", color: "var(--muted)", fontSize: 14 }}>
              No contacts on file yet — add your first one below.
            </div>
          )}
          {contacts.map((c) => (
            <div key={c.id} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", background: "var(--card)", boxShadow: "var(--shadow)" }}>
              {editing === c.id ? (
                <div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
                    <input style={contactInput} placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                    <input style={contactInput} placeholder="Title / role" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                    <input style={contactInput} type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                    <input style={contactInput} placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button onClick={() => saveEdit(c.id)} disabled={busy} style={{ background: BRAND, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Save</button>
                    <button onClick={() => setEditing(null)} disabled={busy} style={{ background: "none", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 13 }}>
                    <div style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 999, background: "rgba(11,74,125,0.10)", color: BRAND, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14 }}>{contactInitials(c.name, c.email)}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 15, fontWeight: 700 }}>{c.name || c.email || c.phone}</span>
                        {c.camRecipient && <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", padding: "2px 8px", borderRadius: 999, background: "rgba(21,128,61,0.10)", color: "#15803d", border: "1px solid rgba(21,128,61,0.30)" }}>Gets statements</span>}
                        {c.source === "tenant" && <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", padding: "2px 8px", borderRadius: 999, background: "rgba(11,74,125,0.08)", color: BRAND, border: "1px solid rgba(11,74,125,0.20)" }}>Added by you</span>}
                      </div>
                      {c.title && <div className="muted" style={{ fontSize: 13, marginTop: 1 }}>{c.title}</div>}
                      {(c.email || c.phone) && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", marginTop: 6 }}>
                          {c.email && <a href={`mailto:${c.email}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: BRAND, textDecoration: "none" }}><MailIcon />{c.email}</a>}
                          {c.phone && <a href={`tel:${c.phone}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: BRAND, textDecoration: "none" }}><PhoneIcon />{c.phone}</a>}
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button onClick={() => startEdit(c)} disabled={busy} title="Edit contact" aria-label="Edit contact" style={iconBtn}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                      </button>
                      <button onClick={() => remove(c.id)} disabled={busy} title="Remove contact" aria-label="Remove contact" style={iconBtn}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                      </button>
                    </div>
                  </div>
                  {/* Statement-recipient toggle — who gets the year-end statement by email. */}
                  <label title={c.email ? "" : "Add an email to receive statements"} style={{ display: "flex", alignItems: "center", gap: 9, borderTop: "1px solid var(--border)", paddingTop: 10, fontSize: 13, cursor: c.email && !busy ? "pointer" : "default", opacity: c.email ? 1 : 0.55 }}>
                    <input type="checkbox" checked={c.camRecipient} disabled={!c.email || busy} onChange={() => toggleRecipient(c)} style={{ width: 16, height: 16, cursor: c.email && !busy ? "pointer" : "default" }} />
                    <span style={{ fontWeight: 600 }}>Receive statements by email</span>
                  </label>
                </div>
              )}
            </div>
          ))}
          {contacts.length > 0 && <p className="muted" style={{ fontSize: 12, marginTop: 2 }}>If no one is marked to receive statements, we email everyone with an email on file.</p>}
        </div>
      )}

      <form onSubmit={add} style={{ marginTop: 18, border: "1px solid var(--border)", borderRadius: 12, padding: "16px 18px", background: "var(--card)", boxShadow: "var(--shadow)" }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 12 }}>Add a contact</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <input style={contactInput} placeholder="Full name" value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} />
          <input style={contactInput} placeholder="Title / role (optional)" value={addForm.title} onChange={(e) => setAddForm({ ...addForm, title: e.target.value })} />
          <input style={contactInput} type="email" placeholder="Email" value={addForm.email} onChange={(e) => setAddForm({ ...addForm, email: e.target.value })} />
          <input style={contactInput} placeholder="Phone" value={addForm.phone} onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })} />
        </div>
        {err && <div style={{ color: "#b91c1c", fontSize: 12.5, fontWeight: 600, marginTop: 10 }}>{err}</div>}
        <div style={{ marginTop: 12 }}>
          <button type="submit" disabled={busy} style={{ display: "inline-flex", alignItems: "center", gap: 7, background: BRAND, color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13.5, fontWeight: 700, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1, fontFamily: "inherit" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            {busy ? "Saving…" : "Add contact"}
          </button>
        </div>
      </form>
    </>
  );
}

// ── Shared bits for the inline request forms ────────────────────────────────
type Tone = { bg: string; fg: string; bd: string };
const TONE = {
  blue: { bg: "rgba(11,74,125,0.09)", fg: BRAND, bd: "rgba(11,74,125,0.25)" },
  amber: { bg: "rgba(180,83,9,0.10)", fg: "#b45309", bd: "rgba(180,83,9,0.30)" },
  green: { bg: "rgba(21,128,61,0.10)", fg: "#15803d", bd: "rgba(21,128,61,0.30)" },
  red: { bg: "rgba(185,28,28,0.10)", fg: "#b91c1c", bd: "rgba(185,28,28,0.30)" },
};
const StatusPill = ({ label, tone }: { label: string; tone: Tone }) => (
  <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", padding: "3px 9px", borderRadius: 999, background: tone.bg, color: tone.fg, border: `1px solid ${tone.bd}`, whiteSpace: "nowrap", flexShrink: 0 }}>{label}</span>
);
const fmtDate = (iso: string) => { if (!iso) return ""; const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso); return isNaN(+d) ? iso : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); };

// ── Form vocabulary — mirrors the public Service Request (/submit) and
//    Conference Room Request (/reserve) pages: labelled fields with a red
//    required-asterisk, underline inputs, a "Choose Photos" button and a
//    centered uppercase submit. Themed with the portal tokens so it stays
//    consistent light/dark instead of the hard-coded navy of the public page.
const RED = "#b91c1c";
const formCard: React.CSSProperties = {
  background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14,
  padding: "32px clamp(20px, 5vw, 44px) 38px", boxShadow: "var(--shadow)",
  display: "flex", flexDirection: "column", gap: 26,
};
const underlineStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "8px 0 9px",
  border: "none", borderBottom: "1px solid var(--border)",
  background: "transparent", color: "var(--text)",
  fontFamily: "inherit", fontSize: 16, outline: "none", transition: "border-color 0.15s",
};
const textareaStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: 14, marginTop: 6,
  border: "1px solid var(--border)", background: "transparent", color: "var(--text)",
  fontFamily: "inherit", fontSize: 15, lineHeight: 1.5, outline: "none", resize: "vertical", minHeight: 120,
};
const choosePhotosBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 10, padding: "9px 16px",
  border: "1px solid var(--border)", background: "transparent", color: BRAND,
  fontSize: 12, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase",
  cursor: "pointer", marginTop: 8, alignSelf: "flex-start", borderRadius: 2,
};
const submitBtn = (busy: boolean): React.CSSProperties => ({
  background: BRAND, color: "#fff", border: "none", padding: "15px 46px", borderRadius: 2,
  fontSize: 14, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase",
  fontFamily: "inherit", cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.7 : 1,
});
const ghostBtn: React.CSSProperties = {
  background: "transparent", color: BRAND, border: `1px solid ${BRAND}`, padding: "12px 28px", borderRadius: 2,
  fontSize: 12, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", fontFamily: "inherit", cursor: "pointer",
};
const hintStyle: React.CSSProperties = { display: "block", fontSize: 12, color: "var(--muted)", marginTop: 6, lineHeight: 1.5 };
const caretSvg = () => {
  const c = encodeURIComponent(BRAND);
  return `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 7' fill='none' stroke='${c}' stroke-width='1.4'><polyline points='1 1 6 6 11 1'/></svg>")`;
};
function FormRow({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 22 }}>{children}</div>;
}
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>
        {label}{required && <span style={{ color: RED, marginLeft: 2 }}>*</span>}
      </label>
      {children}
    </div>
  );
}
function UnderlineInput({ value, onChange, type = "text", required, placeholder, autoComplete }: {
  value: string; onChange: (v: string) => void; type?: string; required?: boolean; placeholder?: string; autoComplete?: string;
}) {
  return (
    <input
      type={type} value={value} onChange={(e) => onChange(e.target.value)}
      required={required} placeholder={placeholder} autoComplete={autoComplete}
      style={underlineStyle}
      onFocus={(e) => { e.currentTarget.style.borderBottomColor = BRAND; }}
      onBlur={(e) => { e.currentTarget.style.borderBottomColor = "var(--border)"; }}
    />
  );
}
function UnderlineSelect({ value, onChange, options, required, placeholder }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; required?: boolean; placeholder?: string;
}) {
  return (
    <select
      value={value} onChange={(e) => onChange(e.target.value)} required={required}
      style={{ ...underlineStyle, appearance: "none", WebkitAppearance: "none", paddingRight: 24, backgroundImage: caretSvg(), backgroundRepeat: "no-repeat", backgroundPosition: "right 4px center", backgroundSize: 14 }}
      onFocus={(e) => { e.currentTarget.style.borderBottomColor = BRAND; }}
      onBlur={(e) => { e.currentTarget.style.borderBottomColor = "var(--border)"; }}
    >
      {placeholder && <option value="" disabled={required}>{placeholder}</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
const SuccessBox = ({ title, body, onAgain }: { title: string; body: string; onAgain: () => void }) => (
  <div style={{ ...formCard, alignItems: "center", textAlign: "center", gap: 18 }}>
    <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(22,163,74,0.10)", color: "#15803d", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 700 }}>✓</div>
    <div>
      <h2 style={{ margin: 0, fontFamily: "Georgia, serif", fontSize: 26, fontWeight: 300, color: BRAND }}>{title}</h2>
      <p style={{ marginTop: 10, color: "var(--muted)", lineHeight: 1.6, fontSize: 14 }}>{body}</p>
    </div>
    <button onClick={onAgain} style={ghostBtn}>Submit another</button>
  </div>
);

// ── Service Requests (inline form + this tenant's history) ────────────────────
type SR = { id: string; subject: string; status: "New" | "In Progress" | "Complete"; categories: string[]; createdAt: string; completedDate: string | null };
const srTone = (s: string): Tone => (s === "Complete" ? TONE.green : s === "In Progress" ? TONE.amber : TONE.blue);

function ServiceTab({ token, company, property, propertyName, unitRef }: { token: string; company: string; property: string; propertyName: string; unitRef: string }) {
  const [form, setForm] = useState({ firstName: "", lastName: "", phone: "", email: "", description: "" });
  const [photos, setPhotos] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okId, setOkId] = useState<string | null>(null);
  const [history, setHistory] = useState<SR[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/portal/${token}/service-requests`).then((r) => (r.ok ? r.json() : { requests: [] })).then((j) => { if (alive) setHistory(Array.isArray(j.requests) ? j.requests : []); }).catch(() => { if (alive) setHistory([]); });
    return () => { alive = false; };
  }, [token, okId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!form.firstName || !form.lastName || !form.email || !form.phone || !form.description) { setErr("Please add your name, email, phone, and a description."); return; }
    setBusy(true); setErr(null);
    try {
      const fd = new FormData();
      fd.append("firstName", form.firstName); fd.append("lastName", form.lastName);
      fd.append("tenantEmail", form.email); fd.append("tenantPhone", form.phone);
      fd.append("propertyCode", property); fd.append("propertyName", propertyName);
      fd.append("company", company); fd.append("tenantSuite", unitRef);
      fd.append("description", form.description); fd.append("website", "");
      for (const p of photos.slice(0, 5)) fd.append("photos", p);
      const res = await fetch("/api/maintenance/submit", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Submission failed.");
      setOkId(j.id ?? "submitted"); setForm({ firstName: "", lastName: "", phone: "", email: "", description: "" }); setPhotos([]);
    } catch (e) { setErr(e instanceof Error ? e.message : "Submission failed."); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader title="Service Requests" sub="Report an issue at your suite or building." />
      {okId ? (
        <SuccessBox title="Request Submitted" body={`Thanks — the service team has been notified${okId !== "submitted" ? ` (ref ${okId})` : ""}. They'll reach out if they need more information.`} onAgain={() => setOkId(null)} />
      ) : (
        <form onSubmit={submit} style={formCard}>
          <FormRow>
            <Field label="First Name" required><UnderlineInput value={form.firstName} onChange={(v) => setForm({ ...form, firstName: v })} required autoComplete="given-name" /></Field>
            <Field label="Last Name" required><UnderlineInput value={form.lastName} onChange={(v) => setForm({ ...form, lastName: v })} required autoComplete="family-name" /></Field>
          </FormRow>
          <FormRow>
            <Field label="Phone" required><UnderlineInput value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} required type="tel" autoComplete="tel" /></Field>
            <Field label="Email" required><UnderlineInput value={form.email} onChange={(v) => setForm({ ...form, email: v })} required type="email" autoComplete="email" /></Field>
          </FormRow>
          <Field label="Please describe your service needs" required>
            <textarea style={textareaStyle} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              onFocus={(e) => { e.currentTarget.style.borderColor = BRAND; }} onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }} />
          </Field>
          <Field label="Photos (optional, up to 5)">
            <label style={choosePhotosBtn}>
              Choose Photos
              <input type="file" accept="image/*" multiple onChange={(e) => setPhotos(Array.from(e.target.files ?? []).slice(0, 5))} style={{ display: "none" }} />
            </label>
            {photos.length > 0 && <span style={{ ...hintStyle, marginTop: 8 }}>{photos.length} photo{photos.length === 1 ? "" : "s"} attached: {photos.map((p) => p.name).join(", ")}</span>}
          </Field>
          {err && <div style={{ color: RED, fontSize: 13, fontWeight: 600 }}>{err}</div>}
          <div style={{ display: "flex", justifyContent: "center", marginTop: 4 }}>
            <button type="submit" disabled={busy} style={submitBtn(busy)}>{busy ? "Submitting…" : "Submit Request"}</button>
          </div>
          <p style={{ ...hintStyle, textAlign: "center", marginTop: 0 }}>For after-hours emergencies (active leak, fire, security), call your property&apos;s emergency line.</p>
        </form>
      )}

      {history && history.length > 0 && (
        <section style={{ marginTop: 30 }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 800 }}>Request history</h2>
          <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", boxShadow: "var(--shadow)" }}>
            {history.map((r, i) => (
              <SrHistoryRow key={r.id} r={r} token={token} first={i === 0} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

// One row in the tenant's request history, with an inline "Add an update" that
// posts a follow-up note onto the request (staff see it; the tenant's internal
// notes are never shown back).
function SrHistoryRow({ r, token, first }: { r: SR; token: string; first: boolean }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function send() {
    if (busy || !text.trim()) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/portal/${token}/service-requests`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: r.id, text: text.trim() }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Couldn't send your update.");
      setSent(true); setText(""); setOpen(false);
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't send your update."); } finally { setBusy(false); }
  }

  return (
    <div style={{ borderTop: first ? "none" : "1px solid var(--border)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.subject || r.categories[0] || "Service request"}</div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 1 }}>{fmtDate(r.createdAt)}{r.categories.length ? ` · ${r.categories.join(", ")}` : ""}</div>
        </div>
        <StatusPill label={r.status} tone={srTone(r.status)} />
      </div>
      <div style={{ padding: "0 16px 12px" }}>
        {sent ? (
          <span style={{ fontSize: 12.5, fontWeight: 600, color: "#15803d" }}>✓ Update sent — the team has been notified.</span>
        ) : open ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Add more detail, a correction, or a question…"
              style={{ ...textareaStyle, marginTop: 0, minHeight: 70, fontSize: 14 }}
              onFocus={(e) => { e.currentTarget.style.borderColor = BRAND; }} onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }} />
            {err && <span style={{ color: RED, fontSize: 12.5, fontWeight: 600 }}>{err}</span>}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={send} disabled={busy || !text.trim()} style={{ background: BRAND, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: busy || !text.trim() ? "default" : "pointer", opacity: busy || !text.trim() ? 0.6 : 1, fontFamily: "inherit" }}>{busy ? "Sending…" : "Send update"}</button>
              <button onClick={() => { setOpen(false); setErr(null); }} style={{ background: "transparent", color: "var(--muted)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setOpen(true)} style={{ background: "none", border: "none", padding: 0, color: BRAND, fontWeight: 700, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 5 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Add an update
          </button>
        )}
      </div>
    </div>
  );
}

// ── Reservations (inline form + this tenant's history) ───────────────────────
type RES = { id: string; roomLabel: string; propertyName: string; date: string; startTime: string; endTime: string; status: "Pending" | "Approved" | "Declined"; purpose: string; createdAt: string };
const resTone = (s: string): Tone => (s === "Approved" ? TONE.green : s === "Declined" ? TONE.red : TONE.amber);
const TIME_OPTS = (() => { const out: { v: string; l: string }[] = []; for (let m = 8 * 60; m <= 18 * 60; m += 15) { const h = Math.floor(m / 60), mm = m % 60; const h12 = ((h + 11) % 12) + 1; out.push({ v: `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`, l: `${h12}:${String(mm).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}` }); } return out; })();
const isoAdd = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };
const fmtTime = (v: string) => TIME_OPTS.find((o) => o.v === v)?.l ?? v;

function ReservationTab({ token, company }: { token: string; company: string }) {
  const [form, setForm] = useState({ roomUnitRef: BOOKABLE_ROOMS[0].unitRef, firstName: "", lastName: "", email: "", phone: "", date: "", startTime: "09:00", endTime: "10:00", purpose: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okId, setOkId] = useState<string | null>(null);
  const [history, setHistory] = useState<RES[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/portal/${token}/reservations`).then((r) => (r.ok ? r.json() : { reservations: [] })).then((j) => { if (alive) setHistory(Array.isArray(j.reservations) ? j.reservations : []); }).catch(() => { if (alive) setHistory([]); });
    return () => { alive = false; };
  }, [token, okId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!form.firstName || !form.lastName || !form.email || !form.phone || !form.date) { setErr("Please add your name, email, phone, and a date."); return; }
    if (form.startTime >= form.endTime) { setErr("End time must be after start time."); return; }
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/reservations/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, tenantCompany: company, website: "" }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? (Array.isArray(j.conflicts) ? "That time conflicts with an existing booking." : "Submission failed."));
      setOkId(j.id ?? "submitted"); setForm((f) => ({ ...f, purpose: "", date: "" }));
    } catch (e) { setErr(e instanceof Error ? e.message : "Submission failed."); } finally { setBusy(false); }
  }

  const upcoming = (history ?? []).filter((v) => v.status !== "Declined" && v.date >= isoAdd(0)).sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  const past = (history ?? []).filter((v) => !(v.status !== "Declined" && v.date >= isoAdd(0))).sort((a, b) => b.date.localeCompare(a.date));
  const Row = ({ v, first }: { v: RES; first: boolean }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", borderTop: first ? "none" : "1px solid var(--border)" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14.5 }}>{v.roomLabel} <span className="muted" style={{ fontWeight: 500 }}>· {v.propertyName}</span></div>
        <div className="muted" style={{ fontSize: 12.5, marginTop: 1 }}>{fmtDate(v.date)} · {fmtTime(v.startTime)}–{fmtTime(v.endTime)}{v.purpose ? ` · ${v.purpose}` : ""}</div>
      </div>
      <StatusPill label={v.status} tone={resTone(v.status)} />
    </div>
  );

  return (
    <>
      <PageHeader title="Reservations" sub="Reserve a conference or training room — we'll confirm by email." />
      {okId ? (
        <SuccessBox title="Reservation Request Submitted" body="Thanks — we'll review and confirm by email shortly. It'll appear under “Upcoming” below once approved." onAgain={() => setOkId(null)} />
      ) : (
        <form onSubmit={submit} style={formCard}>
          <Field label="Room" required>
            <UnderlineSelect value={form.roomUnitRef} onChange={(v) => setForm({ ...form, roomUnitRef: v })} required
              options={BOOKABLE_ROOMS.map((r) => ({ value: r.unitRef, label: `${r.label} · ${r.propertyName}` }))} />
          </Field>
          <FormRow>
            <Field label="First Name" required><UnderlineInput value={form.firstName} onChange={(v) => setForm({ ...form, firstName: v })} required autoComplete="given-name" /></Field>
            <Field label="Last Name" required><UnderlineInput value={form.lastName} onChange={(v) => setForm({ ...form, lastName: v })} required autoComplete="family-name" /></Field>
          </FormRow>
          <FormRow>
            <Field label="Phone" required><UnderlineInput value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} required type="tel" autoComplete="tel" /></Field>
            <Field label="Email" required><UnderlineInput value={form.email} onChange={(v) => setForm({ ...form, email: v })} required type="email" autoComplete="email" /></Field>
          </FormRow>
          <Field label="Date (Monday–Friday)" required>
            <Calendar value={form.date} onChange={(iso) => setForm({ ...form, date: iso })} minISO={isoAdd(0)} maxISO={isoAdd(183)} disableWeekends required variant="underline" />
          </Field>
          <FormRow>
            <Field label="Start Time (8:00 AM – 6:00 PM)" required>
              <UnderlineSelect value={form.startTime} onChange={(v) => setForm({ ...form, startTime: v })} required options={TIME_OPTS.map((o) => ({ value: o.v, label: o.l }))} />
            </Field>
            <Field label="End Time (8:00 AM – 6:00 PM)" required>
              <UnderlineSelect value={form.endTime} onChange={(v) => setForm({ ...form, endTime: v })} required options={TIME_OPTS.map((o) => ({ value: o.v, label: o.l }))} />
            </Field>
          </FormRow>
          <Field label="Purpose (optional)">
            <textarea style={{ ...textareaStyle, minHeight: 90 }} placeholder="What's the meeting for? Any setup needed (whiteboard, AV, water, etc.)?" value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })}
              onFocus={(e) => { e.currentTarget.style.borderColor = BRAND; }} onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }} />
          </Field>
          {err && <div style={{ color: RED, fontSize: 13, fontWeight: 600 }}>{err}</div>}
          <div style={{ display: "flex", justifyContent: "center", marginTop: 4 }}>
            <button type="submit" disabled={busy} style={submitBtn(busy)}>{busy ? "Submitting…" : "Submit Request"}</button>
          </div>
          <p style={{ ...hintStyle, textAlign: "center", marginTop: 0 }}>You&apos;ll receive a confirmation email after submitting, and another once your reservation is approved.</p>
        </form>
      )}

      {(upcoming.length > 0 || past.length > 0) && (
        <section style={{ marginTop: 30 }}>
          {upcoming.length > 0 && (
            <>
              <h2 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 800 }}>Upcoming</h2>
              <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", boxShadow: "var(--shadow)" }}>
                {upcoming.map((v, i) => <Row key={v.id} v={v} first={i === 0} />)}
              </div>
            </>
          )}
          {past.length > 0 && (
            <>
              <h2 style={{ margin: upcoming.length > 0 ? "26px 0 12px" : "0 0 12px", fontSize: 18, fontWeight: 800 }}>Past requests</h2>
              <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", boxShadow: "var(--shadow)" }}>
                {past.map((v, i) => <Row key={v.id} v={v} first={i === 0} />)}
              </div>
            </>
          )}
        </section>
      )}
    </>
  );
}

function ComingSoon({ label }: { label: string }) {
  return (
    <div style={{ minHeight: "50vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 8 }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: BRAND }}>{label}</div>
      <p className="muted" style={{ maxWidth: 360, fontSize: 14 }}>This part of your portal is coming soon.</p>
    </div>
  );
}

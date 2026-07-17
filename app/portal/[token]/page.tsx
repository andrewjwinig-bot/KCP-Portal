"use client";

// Tenant portal shell — the destination of every "Share with tenant" link
// (the admin flow mints /portal/[token] URLs, and the legacy /statement/[token]
// page redirects here). Reuses the same signed token. A tenant-facing sidebar:
// Lease Terms (the overview/home), Statements (which now carries the CAM/RET
// statement), Floorplan, Service Requests, Reservations; Open Balances to come.

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import LoadingState from "@/app/components/LoadingState";
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
type PortalContact = { id: string; name: string; title: string; email: string; phone: string; source: "tenant" | "staff" };
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
  const { data, error } = useStatement(token);
  const { portal } = usePortal(token);
  const [tab, setTab] = useState<TabId>("lease");

  if (error) return <Centered><div style={{ fontWeight: 700, fontSize: 18, color: BRAND }}>Tenant Portal</div><p className="muted" style={{ marginTop: 8 }}>{error}</p></Centered>;
  if (!data) return (
    <div style={{ maxWidth: 940, margin: "0 auto", padding: "28px clamp(16px, 4vw, 44px) 60px" }}>
      <LoadingState status="Loading your account…" context="Securely retrieving your space, lease, and statements…" rows={4} columns={2} />
    </div>
  );
  const t = data.tenant;

  const Nav = () => (
    <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {TABS.map((x) => {
        const active = tab === x.id;
        return (
          <button key={x.id} onClick={() => setTab(x.id)}
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

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg, #f7f9fc)" }}>
      <aside style={{ width: 244, flexShrink: 0, background: BRAND, color: "#fff", padding: 18, display: "flex", flexDirection: "column", gap: 18 }} className="portal-aside">
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

      <main style={{ flex: 1, minWidth: 0, padding: "34px clamp(18px, 4vw, 48px) 72px", maxWidth: 960 }}>
        {tab === "lease" ? (
          <LeaseTab terms={portal?.leaseTerms ?? null} building={portal?.building ?? null} loading={!portal} suite={t.suite} company={t.name} />
        ) : tab === "statements" ? (
          <StatementsTab token={token} data={data} years={portal?.statementYears ?? null} />
        ) : tab === "contacts" ? (
          <ContactsTab token={token} initial={portal?.contacts ?? null} />
        ) : tab === "floorplan" ? (
          <FloorplanTab token={token} floorplan={portal?.floorplan ?? null} loading={!portal} />
        ) : tab === "service" ? (
          <ActionTab
            title="Service Requests"
            intro="Report a service issue at your suite or building — leaks, HVAC, lighting, lockouts, anything that needs the service team. We've pre-filled your property and company; just add the details."
            cta="Start a service request"
            href={`/submit?property=${encodeURIComponent(data.property)}&company=${encodeURIComponent(t.name)}`}
            icon={<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />}
          />
        ) : tab === "reservations" ? (
          <ActionTab
            title="Reservations"
            intro="Reserve a conference room or training room. Pick the room, date, and time — we'll confirm by email. Your company is pre-filled."
            cta="Reserve a room"
            href={`/reserve?company=${encodeURIComponent(t.name)}`}
            icon={<><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>}
          />
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

// Tenants add/view their own contacts; the list writes to the same per-suite
// store the admin unit page edits, so additions sync there. Tenants can remove
// only what they added — staff / billing contacts are read-only to them.
function ContactsTab({ token, initial }: { token: string; initial: PortalContact[] | null }) {
  const [contacts, setContacts] = useState<PortalContact[] | null>(initial);
  useEffect(() => { setContacts(initial); }, [initial]);
  const [form, setForm] = useState({ name: "", title: "", email: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const input: React.CSSProperties = { width: "100%", padding: "9px 11px", fontSize: 14, fontFamily: "inherit", border: "1px solid var(--border)", borderRadius: 8, background: "var(--card)", color: "var(--text)", outline: "none" };

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/portal/${token}/contacts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Could not add contact.");
      setContacts(j.contacts);
      setForm({ name: "", title: "", email: "", phone: "" });
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not add contact."); }
    finally { setBusy(false); }
  }
  async function remove(id: string) {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/portal/${token}/contacts?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Could not remove contact.");
      setContacts(j.contacts);
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not remove contact."); }
    finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader title="Contacts" sub="People at your company we should reach for billing, service, and building matters. Anything you add here syncs to your property manager." />
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
            <div key={c.id} style={{ display: "flex", alignItems: "flex-start", gap: 13, border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", background: "var(--card)" }}>
              <div style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 999, background: "rgba(11,74,125,0.10)", color: BRAND, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14 }}>{contactInitials(c.name, c.email)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{c.name || c.email || c.phone}</span>
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
              {c.source === "tenant" && (
                <button onClick={() => remove(c.id)} disabled={busy} title="Remove contact" aria-label="Remove contact" style={{ flexShrink: 0, background: "none", border: "none", cursor: busy ? "default" : "pointer", color: "var(--muted)", padding: 4, borderRadius: 6, lineHeight: 0 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <form onSubmit={add} style={{ marginTop: 18, border: "1px solid var(--border)", borderRadius: 12, padding: "16px 18px", background: "var(--card)" }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 12 }}>Add a contact</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <input style={input} placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input style={input} placeholder="Title / role (optional)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <input style={input} type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input style={input} placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        {err && <div style={{ color: "#b91c1c", fontSize: 12.5, fontWeight: 600, marginTop: 10 }}>{err}</div>}
        <div style={{ marginTop: 12 }}>
          <button type="submit" disabled={busy} style={{ display: "inline-flex", alignItems: "center", gap: 7, background: BRAND, color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13.5, fontWeight: 700, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1, fontFamily: "inherit" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            {busy ? "Adding…" : "Add contact"}
          </button>
        </div>
      </form>
    </>
  );
}

function ActionTab({ title, intro, cta, href, icon }: { title: string; intro: string; cta: string; href: string; icon: React.ReactNode }) {
  return (
    <>
      <PageHeader title={title} />
      <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "28px 22px", background: "var(--card)", maxWidth: 560, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ width: 46, height: 46, borderRadius: 12, background: "rgba(11,74,125,0.09)", color: BRAND, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
        </div>
        <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: "var(--text)" }}>{intro}</p>
        <div>
          <a href={href} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: BRAND, color: "#fff", textDecoration: "none", borderRadius: 8, padding: "10px 18px", fontSize: 14, fontWeight: 700 }}>
            {cta}
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="7" y1="17" x2="17" y2="7" /><polyline points="7 7 17 7 17 17" /></svg>
          </a>
        </div>
      </div>
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

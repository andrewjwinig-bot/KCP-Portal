"use client";

// Tenant portal shell (WORK IN PROGRESS — not linked anywhere yet; the admin
// "Share with tenant" flow still hands out /statement/[token] links). Reuses the
// same signed token as the statement page. A per-tenant sidebar: CAM/RET
// statement, Floorplan, Lease Terms today; Statements history, Service Requests,
// Reservations, Open Balances still to come.

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useStatement, TenantStatementView, Centered, BRAND, money, money2 } from "@/app/statement/[token]/StatementView";

type TabId = "cam" | "floorplan" | "lease" | "statements" | "service" | "reservations" | "balances";
const TABS: { id: TabId; label: string; icon: React.ReactNode; ready?: boolean }[] = [
  { id: "cam", label: "CAM / RET", ready: true, icon: <path d="M9 17V7m0 10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m0 10h10a2 2 0 0 0 2-2v-3M9 7h10a2 2 0 0 1 2 2v3" /> },
  { id: "floorplan", label: "Floorplan", ready: true, icon: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></> },
  { id: "lease", label: "Lease Terms", ready: true, icon: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></> },
  { id: "statements", label: "Statements", ready: true, icon: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></> },
  { id: "service", label: "Service Requests", icon: <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /> },
  { id: "reservations", label: "Reservations", icon: <><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></> },
  { id: "balances", label: "Open Balances", icon: <><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></> },
];

type LeaseTerms = {
  sqft: number; baseRent: number; grossRent: number; annualRent: number;
  annualRentPerSqft: number; leaseFrom: string | null; leaseTo: string | null; occupantName: string;
};
type PortalData = { ok: true; property: string; year: number; kind: string; leaseTerms: LeaseTerms | null; floorplan: { name: string; contentType: string } | null; statementYears: number[] };

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
  const [tab, setTab] = useState<TabId>("cam");

  if (error) return <Centered><div style={{ fontWeight: 700, fontSize: 18, color: BRAND }}>Tenant Portal</div><p className="muted" style={{ marginTop: 8 }}>{error}</p></Centered>;
  if (!data) return <Centered><div className="muted">Loading…</div></Centered>;
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
      <aside style={{ width: 240, flexShrink: 0, background: BRAND, color: "#fff", padding: 18, display: "flex", flexDirection: "column", gap: 18 }} className="portal-aside">
        <div>
          <div style={{ fontFamily: "'Arial Black', Arial, sans-serif", fontWeight: 900, fontSize: 20, letterSpacing: "-0.5px" }}>KORMAN</div>
          <div style={{ fontSize: 9, letterSpacing: "0.18em", color: "#bfdbfe" }}>COMMERCIAL PROPERTIES</div>
        </div>
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.15)", paddingTop: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{t.name}</div>
          <div style={{ fontSize: 12.5, color: "#bfdbfe", marginTop: 1 }}>{data.propertyName} · Suite {t.suite}</div>
        </div>
        <Nav />
      </aside>

      <main style={{ flex: 1, minWidth: 0, padding: "28px clamp(16px, 4vw, 44px) 60px", maxWidth: 940 }}>
        {tab === "cam" ? (
          <>
            <h1 style={{ margin: "0 0 4px", fontSize: 22 }}>CAM / RET Statement <span className="muted" style={{ fontSize: 15, fontWeight: 500 }}>· {data.year}</span></h1>
            <TenantStatementView token={token} data={data} header={false} />
          </>
        ) : tab === "floorplan" ? (
          <FloorplanTab token={token} floorplan={portal?.floorplan ?? null} loading={!portal} />
        ) : tab === "lease" ? (
          <LeaseTab terms={portal?.leaseTerms ?? null} loading={!portal} suite={t.suite} />
        ) : tab === "statements" ? (
          <StatementsTab token={token} years={portal?.statementYears ?? null} currentYear={data.year} onViewCurrent={() => setTab("cam")} />
        ) : (
          <ComingSoon label={TABS.find((x) => x.id === tab)!.label} />
        )}
      </main>
    </div>
  );
}

function SectionHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h1 style={{ margin: 0, fontSize: 22 }}>{title}</h1>
      {sub && <div className="muted" style={{ fontSize: 14, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function FloorplanTab({ token, floorplan, loading }: { token: string; floorplan: { name: string; contentType: string } | null; loading: boolean }) {
  const src = `/api/portal/${token}/floorplan`;
  const isImage = floorplan?.contentType.startsWith("image/");
  return (
    <>
      <SectionHead title="Floorplan" sub={floorplan ? floorplan.name : undefined} />
      {loading ? (
        <div className="muted" style={{ fontSize: 14 }}>Loading…</div>
      ) : !floorplan ? (
        <div style={{ border: "1px dashed var(--border)", borderRadius: 12, padding: "40px 16px", textAlign: "center", color: "var(--muted)", fontSize: 14 }}>
          No floorplan is on file for your suite yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {isImage ? (
            <a href={src} target="_blank" rel="noreferrer">
              <img src={src} alt="Suite floorplan" style={{ width: "100%", maxHeight: 620, objectFit: "contain", borderRadius: 12, border: "1px solid var(--border)", background: "rgba(15,23,42,0.02)", display: "block" }} />
            </a>
          ) : (
            <iframe title="Suite floorplan" src={`${src}#toolbar=0&navpanes=0&view=FitH`} style={{ width: "100%", height: 620, borderRadius: 12, border: "1px solid var(--border)", background: "rgba(15,23,42,0.02)" }} />
          )}
          <div>
            <a href={`${src}?download=1`} style={{ display: "inline-flex", alignItems: "center", gap: 7, background: BRAND, color: "#fff", textDecoration: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
              Download floorplan
            </a>
          </div>
        </div>
      )}
    </>
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

function LeaseTab({ terms, loading, suite }: { terms: LeaseTerms | null; loading: boolean; suite: string }) {
  if (loading) return <><SectionHead title="Lease Terms" /><div className="muted" style={{ fontSize: 14 }}>Loading…</div></>;
  if (!terms) return <><SectionHead title="Lease Terms" /><div style={{ border: "1px dashed var(--border)", borderRadius: 12, padding: "40px 16px", textAlign: "center", color: "var(--muted)", fontSize: 14 }}>Lease details aren&rsquo;t available for your suite right now.</div></>;

  const days = daysUntil(terms.leaseTo);
  const Stat = ({ label, value }: { label: string; value: string }) => (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", background: "var(--card)" }}>
      <div style={{ fontSize: 20, fontWeight: 800 }}>{value}</div>
      <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{label}</div>
    </div>
  );

  return (
    <>
      <SectionHead title="Lease Terms" sub={`Suite ${suite} · ${terms.occupantName}`} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        <Stat label="Sq Ft" value={terms.sqft.toLocaleString("en-US")} />
        <Stat label="Annual $/sf" value={money2(terms.annualRentPerSqft)} />
        <Stat label="Base Rent / mo" value={money(terms.baseRent)} />
        <Stat label="Gross Rent / mo" value={money(terms.grossRent)} />
        <Stat label="Annual Rent" value={money(terms.annualRent)} />
        {days != null && <Stat label="Days to Expiration" value={days.toLocaleString("en-US")} />}
      </div>
      {(terms.leaseFrom || terms.leaseTo) && (
        <div style={{ marginTop: 16, border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", background: "var(--card)", display: "flex", alignItems: "center", gap: 10, fontSize: 15 }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)" }}>Lease Term</span>
          <span style={{ fontWeight: 700 }}>{terms.leaseFrom ?? "—"}</span>
          <span className="muted">→</span>
          <span style={{ fontWeight: 700 }}>{terms.leaseTo ?? "—"}</span>
        </div>
      )}
      <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
        Figures reflect your current rent-roll record. Gross rent includes base rent plus estimated CAM, real estate tax, and other monthly charges. Questions? Contact Korman Commercial Properties.
      </p>
    </>
  );
}

function StatementsTab({ token, years, currentYear, onViewCurrent }: { token: string; years: number[] | null; currentYear: number; onViewCurrent: () => void }) {
  if (!years) return <><SectionHead title="Statements" /><div className="muted" style={{ fontSize: 14 }}>Loading…</div></>;
  if (years.length === 0) return <><SectionHead title="Statements" /><div style={{ border: "1px dashed var(--border)", borderRadius: 12, padding: "40px 16px", textAlign: "center", color: "var(--muted)", fontSize: 14 }}>No statements are available yet.</div></>;
  return (
    <>
      <SectionHead title="Statements" sub="Your year-end CAM / RET reconciliations." />
      <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
        {years.map((yr, i) => (
          <div key={yr} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderTop: i ? "1px solid var(--border)" : "none" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>
                {yr} CAM / RET Statement
                {yr === currentYear && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", color: BRAND, background: "rgba(11,74,125,0.09)", borderRadius: 6, padding: "2px 7px", verticalAlign: "middle" }}>CURRENT</span>}
              </div>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 1 }}>Year-end reconciliation</div>
            </div>
            {yr === currentYear && (
              <button onClick={onViewCurrent} className="btn" style={{ fontSize: 12.5, padding: "7px 12px", fontWeight: 600 }}>View</button>
            )}
            <a href={`/api/portal/${token}/statement/pdf?year=${yr}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: BRAND, color: "#fff", textDecoration: "none", borderRadius: 8, padding: "7px 13px", fontSize: 12.5, fontWeight: 700 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
              PDF
            </a>
          </div>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>Prior years appear here as reconciliations are completed.</p>
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

"use client";

// Tenant portal shell (WORK IN PROGRESS — not linked anywhere yet; the admin
// "Share with tenant" flow still hands out /statement/[token] links). Reuses the
// same signed token as the statement page. A per-tenant sidebar whose first tab
// is today's CAM statement; the rest are placeholders to fill in (Statements,
// Lease Terms, Service Requests, Reservations, Balances).

import { useState } from "react";
import { useParams } from "next/navigation";
import { useStatement, TenantStatementView, Centered, BRAND } from "@/app/statement/[token]/StatementView";

type TabId = "cam" | "statements" | "lease" | "service" | "reservations" | "balances";
const TABS: { id: TabId; label: string; icon: React.ReactNode; ready?: boolean }[] = [
  { id: "cam", label: "CAM / RET", ready: true, icon: <path d="M9 17V7m0 10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m0 10h10a2 2 0 0 0 2-2v-3M9 7h10a2 2 0 0 1 2 2v3" /> },
  { id: "statements", label: "Statements", icon: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></> },
  { id: "lease", label: "Lease Terms", icon: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></> },
  { id: "service", label: "Service Requests", icon: <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /> },
  { id: "reservations", label: "Reservations", icon: <><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></> },
  { id: "balances", label: "Open Balances", icon: <><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></> },
];

export default function TenantPortalPage() {
  const params = useParams<{ token: string }>();
  const token = Array.isArray(params?.token) ? params.token[0] : params?.token ?? "";
  const { data, error } = useStatement(token);
  const [tab, setTab] = useState<TabId>("cam");
  const [navOpen, setNavOpen] = useState(false);

  if (error) return <Centered><div style={{ fontWeight: 700, fontSize: 18, color: BRAND }}>Tenant Portal</div><p className="muted" style={{ marginTop: 8 }}>{error}</p></Centered>;
  if (!data) return <Centered><div className="muted">Loading…</div></Centered>;
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

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg, #f7f9fc)" }}>
      {/* Sidebar */}
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

      {/* Content */}
      <main style={{ flex: 1, minWidth: 0, padding: "28px clamp(16px, 4vw, 44px) 60px", maxWidth: 940 }}>
        {tab === "cam" ? (
          <>
            <h1 style={{ margin: "0 0 4px", fontSize: 22 }}>CAM / RET Statement <span className="muted" style={{ fontSize: 15, fontWeight: 500 }}>· {data.year}</span></h1>
            <TenantStatementView token={token} data={data} header={false} />
          </>
        ) : (
          <ComingSoon label={TABS.find((x) => x.id === tab)!.label} />
        )}
      </main>
    </div>
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

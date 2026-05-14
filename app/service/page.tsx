"use client";

// Public landing — pick a service path. AppShell exempts /service from
// auth and renders it raw (no portal chrome).

import Link from "next/link";

const NAVY = "#0e2238";
const NAVY_DEEP = "#0a1a2c";
const BG = "#f4f5f7";
const CARD = "#ffffff";

export default function ServiceLandingPage() {
  return (
    <div style={{ background: BG, minHeight: "100vh", color: "#1a2238" }}>
      <KormanHeader />
      <main style={{ padding: "56px 16px 80px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 42 }}>
            <div style={{ width: 54, height: 2, background: NAVY, margin: "0 auto 24px" }} />
            <h1 style={{ color: NAVY }}>Service Request</h1>
            <p style={{ color: "#5a657a", marginTop: 14, fontSize: 15 }}>
              How can we help you today?
            </p>
          </div>

          <div style={{
            background: CARD,
            padding: "48px clamp(20px, 6vw, 64px)",
            boxShadow: "0 1px 0 rgba(14,34,56,0.04), 0 18px 40px rgba(14,34,56,0.06)",
            display: "grid",
            gap: 14,
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          }}>
            <ServiceTile
              href="/submit"
              title="Maintenance Request"
              description="Report a maintenance issue at your suite or building — leaks, HVAC, lighting, lockouts, anything that needs the maintenance team."
            />
            <ServiceTile
              href="/reserve"
              title="Conference Room Request"
              description="Reserve a conference room or training room. Pick the room, date, and time — we'll confirm by email."
            />
          </div>

          <p style={{ textAlign: "center", marginTop: 18, fontSize: 12, color: "#5a657a" }}>
            For after-hours emergencies (active leak, fire, security), call your property&apos;s emergency line.
          </p>
        </div>
      </main>
      <KormanFooter />
    </div>
  );
}

function ServiceTile({ href, title, description }: { href: string; title: string; description: string }) {
  return (
    <Link
      href={href}
      style={{
        display: "flex", flexDirection: "column", gap: 12,
        padding: "28px 24px",
        border: "1px solid rgba(14,34,56,0.18)",
        background: "transparent",
        textDecoration: "none",
        color: NAVY,
        transition: "background 0.12s, border-color 0.12s, transform 0.1s",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.background = "rgba(14,34,56,0.04)";
        el.style.borderColor = NAVY;
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.background = "transparent";
        el.style.borderColor = "rgba(14,34,56,0.18)";
      }}
    >
      <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.01em" }}>{title}</span>
      <span style={{ fontSize: 13, color: "#5a657a", lineHeight: 1.5 }}>{description}</span>
      <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", marginTop: 8 }}>
        Start →
      </span>
    </Link>
  );
}

function KormanHeader() {
  return (
    <header style={{
      background: NAVY_DEEP,
      padding: "22px 24px",
      display: "flex", alignItems: "center", justifyContent: "center",
      borderBottom: "1px solid rgba(255,255,255,0.06)",
    }}>
      <Wordmark color="#fff" />
    </header>
  );
}

function KormanFooter() {
  return (
    <footer style={{
      borderTop: "1px solid rgba(14,34,56,0.18)",
      padding: "28px 24px 36px",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 14,
      color: "#5a657a",
      fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase",
    }}>
      <Wordmark color={NAVY} small />
      <span>&copy; {new Date().getFullYear()} Korman Commercial Properties</span>
    </footer>
  );
}

function Wordmark({ color, small }: { color: string; small?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: small ? 10 : 14, flexShrink: 0, color }}>
      <span style={{
        fontFamily: "'Arial Black', 'Arial Bold', Arial, sans-serif",
        fontWeight: 900,
        fontSize: small ? 18 : 26,
        letterSpacing: "-0.5px",
        lineHeight: 1,
      }}>KORMAN</span>
      <div style={{ width: 1, height: small ? 22 : 30, background: color, opacity: 0.85, flexShrink: 0 }} />
      <div style={{
        fontSize: small ? 9 : 11,
        letterSpacing: "0.22em",
        lineHeight: 1.6,
        fontFamily: "Arial, Helvetica, sans-serif",
        fontWeight: 500,
      }}>
        <div>COMMERCIAL</div>
        <div>PROPERTIES</div>
      </div>
    </div>
  );
}

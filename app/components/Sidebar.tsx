"use client";

const NAV = [
  {
    label: "Payroll Invoicer",
    href: "/",
    external: false,
    icon: (
      <span style={{ fontSize: 18, fontWeight: 700, lineHeight: 1 }}>$</span>
    ),
  },
  {
    label: "Expense Coder",
    href: "https://cc-expenses-psi.vercel.app/",
    external: true,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <line x1="2" y1="10" x2="22" y2="10" />
      </svg>
    ),
  },
  {
    label: "Maintenance",
    href: "https://airtable.com/appu2QwzsaWb4Qw2X/pageF2MN3KyaNqj0D?MJMG1=allRecords&92GWJ=allRecords",
    external: true,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
    ),
  },
];

export default function Sidebar({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const W = open ? 220 : 52;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        height: "100vh",
        width: W,
        background: "#1e4976",
        color: "#e0f0ff",
        display: "flex",
        flexDirection: "column",
        transition: "width 0.2s ease",
        zIndex: 40,
        overflow: "hidden",
        borderRight: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      {/* Toggle button */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: open ? "flex-end" : "center",
          padding: open ? "14px 12px 14px 16px" : "14px 0",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          flexShrink: 0,
        }}
      >
        <button
          onClick={onToggle}
          title={open ? "Collapse sidebar" : "Expand sidebar"}
          style={{
            background: "none",
            border: "none",
            color: "#bfdbfe",
            cursor: "pointer",
            padding: 4,
            borderRadius: 6,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {open ? (
            /* left-arrow / collapse */
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="12" x2="21" y2="12" />
              <polyline points="3 6 21 6" />
              <polyline points="3 18 21 18" />
            </svg>
          ) : (
            /* hamburger / expand */
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="12" x2="21" y2="12" />
              <polyline points="3 6 21 6" />
              <polyline points="3 18 21 18" />
            </svg>
          )}
        </button>
      </div>

      {/* App label */}
      {open && (
        <div style={{ padding: "16px 16px 8px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#93c5fd", flexShrink: 0 }}>
          Tools
        </div>
      )}

      {/* Nav links */}
      <nav style={{ flex: 1, padding: open ? "4px 8px" : "8px 6px", display: "flex", flexDirection: "column", gap: 2 }}>
        {NAV.map((item) => (
          <a
            key={item.label}
            href={item.href}
            target={item.external ? "_blank" : undefined}
            rel={item.external ? "noopener noreferrer" : undefined}
            title={item.label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: open ? "9px 10px" : "9px 0",
              justifyContent: open ? "flex-start" : "center",
              borderRadius: 8,
              color: "#e0f0ff",
              textDecoration: "none",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
              transition: "background 0.15s",
              whiteSpace: "nowrap",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.12)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
          >
            <span style={{ flexShrink: 0 }}>{item.icon}</span>
            {open && <span>{item.label}</span>}
          </a>
        ))}
      </nav>
    </div>
  );
}

"use client";

const NAV = [
  {
    label: "Payroll Invoicer",
    href: "/",
    external: false,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <line x1="2" y1="10" x2="22" y2="10" />
      </svg>
    ),
  },
  {
    label: "Expense Coder",
    href: "EXPENSE_CODER_URL", // TODO: replace with deployed URL
    external: true,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
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
        background: "#0f172a",
        color: "#cbd5e1",
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
            color: "#94a3b8",
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
        <div style={{ padding: "16px 16px 8px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#475569", flexShrink: 0 }}>
          Tools
        </div>
      )}

      {/* Nav links */}
      <nav style={{ flex: 1, padding: open ? "4px 8px" : "8px 6px", display: "flex", flexDirection: "column", gap: 2 }}>
        {NAV.map((item) => {
          const isPlaceholder = item.href === "EXPENSE_CODER_URL";
          return (
            <a
              key={item.label}
              href={isPlaceholder ? undefined : item.href}
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
                color: isPlaceholder ? "#475569" : "#cbd5e1",
                textDecoration: "none",
                fontSize: 14,
                fontWeight: 500,
                cursor: isPlaceholder ? "not-allowed" : "pointer",
                transition: "background 0.15s",
                whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => { if (!isPlaceholder) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.07)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              <span style={{ flexShrink: 0 }}>{item.icon}</span>
              {open && <span>{item.label}{isPlaceholder ? " (soon)" : ""}</span>}
            </a>
          );
        })}
      </nav>
    </div>
  );
}

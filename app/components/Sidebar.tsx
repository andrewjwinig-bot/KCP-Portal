"use client";

import { usePathname } from "next/navigation";

const NAV = [
  {
    label: "Master Tracker",
    href: "/tracker",
    external: false,
    indent: false,
    showFor: null as string | null,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
        <polyline points="9 16 11 18 15 14" />
      </svg>
    ),
  },
  {
    label: "Filing Tracker",
    href: "/tracker/taxes",
    external: false,
    indent: true,
    showFor: "/tracker",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="9" y1="13" x2="15" y2="13" />
        <line x1="9" y1="17" x2="13" y2="17" />
      </svg>
    ),
  },
  {
    label: "Payroll Invoicer",
    href: "/",
    external: false,
    indent: false,
    showFor: null as string | null,
    icon: (
      <span style={{ fontSize: 22, fontWeight: 700, lineHeight: 1 }}>$</span>
    ),
  },
  {
    label: "Payroll History",
    href: "/history",
    external: false,
    indent: true,
    showFor: "/",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
  {
    label: "CC Expense Coder",
    href: "/expenses",
    external: false,
    indent: false,
    showFor: null as string | null,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <line x1="2" y1="10" x2="22" y2="10" />
      </svg>
    ),
  },
  {
    label: "Expense History",
    href: "/expenses/history",
    external: false,
    indent: true,
    showFor: "/expenses",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
  {
    label: "Allocated Invoicer",
    href: "/allocated-invoicer",
    external: false,
    indent: false,
    showFor: null as string | null,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
  },
  {
    label: "Maintenance",
    href: "https://airtable.com/appu2QwzsaWb4Qw2X/pageF2MN3KyaNqj0D?MJMG1=allRecords&92GWJ=allRecords",
    external: true,
    indent: false,
    showFor: null as string | null,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
    ),
  },
];

export default function Sidebar({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const pathname = usePathname();
  const W = open ? 220 : 60;

  function isActive(item: (typeof NAV)[number]) {
    if (item.external) return false;
    if (item.href === "/") return pathname === "/";
    return pathname.startsWith(item.href);
  }

  function isVisible(item: (typeof NAV)[number]) {
    if (item.showFor === null) return true;
    if (item.showFor === "/") return pathname === "/" || pathname.startsWith("/history");
    return pathname === item.showFor || pathname.startsWith(item.showFor + "/");
  }

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
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12" />
            <polyline points="3 6 21 6" />
            <polyline points="3 18 21 18" />
          </svg>
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
        {NAV.filter((item) => isVisible(item)).map((item) => {
          const active = isActive(item);
          return (
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
                marginLeft: item.indent && open ? 16 : 0,
                justifyContent: open ? "flex-start" : "center",
                borderRadius: 8,
                color: active ? "#fff" : "#e0f0ff",
                textDecoration: "none",
                fontSize: 14,
                fontWeight: active ? 700 : 500,
                cursor: "pointer",
                transition: "background 0.15s",
                whiteSpace: "nowrap",
                background: active ? "rgba(255,255,255,0.18)" : "transparent",
              }}
              onMouseEnter={(e) => {
                if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.12)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = active ? "rgba(255,255,255,0.18)" : "transparent";
              }}
            >
              <span style={{ flexShrink: 0 }}>{item.icon}</span>
              {open && <span>{item.label}</span>}
            </a>
          );
        })}
      </nav>
    </div>
  );
}

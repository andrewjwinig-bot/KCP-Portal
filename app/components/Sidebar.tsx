"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useUser } from "./UserProvider";
import UserSwitcher from "./UserSwitcher";
import ThemeToggle from "./ThemeToggle";
import NotificationsToggle from "./NotificationsToggle";
import { GlobalSearchTrigger } from "./GlobalSearch";

// Maps each NAV label to a role key. Items in this map are gated; items not in it are always visible.
const NAV_ROLE_KEY: Record<string, string> = {
  "Dashboard":          "dashboard",
  "Property Info":      "properties",
  "Investor Info":      "investors",
  "Rent Roll":          "rentroll",
  "Leasing Activity":   "leasing-activity",
  "Commissions":        "commissions",
  "Master Tracker":     "tracker",
  "Filing Tracker":     "tracker",
  "Bank Acc Tracker":   "bank-rec-tracker",
  "Payroll Invoicer":   "payroll-invoicer",
  "Payroll History":    "payroll-history",
  "CC Expense Coder":   "expenses",
  "Expense History":    "expenses-history",
  "Allocated Invoicer": "allocated",
  "Maintenance":        "maintenance",
};

const NAV = [
  {
    label: "Dashboard",
    href: "/dashboard",
    external: false,
    indent: false,
    showFor: null as string | null,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="9" />
        <rect x="14" y="3" width="7" height="5" />
        <rect x="14" y="12" width="7" height="9" />
        <rect x="3" y="16" width="7" height="5" />
      </svg>
    ),
  },
  {
    label: "Property Info",
    href: "/properties",
    external: false,
    indent: false,
    showFor: null as string | null,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    label: "Investor Info",
    href: "/investors",
    external: false,
    indent: false,
    showFor: null as string | null,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    label: "Rent Roll",
    href: "/rentroll",
    external: false,
    indent: false,
    showFor: null as string | null,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="3" y1="9" x2="21" y2="9" />
        <line x1="3" y1="15" x2="21" y2="15" />
        <line x1="9" y1="9" x2="9" y2="21" />
      </svg>
    ),
  },
  {
    label: "Leasing Activity",
    href: "/rentroll/leasing",
    external: false,
    indent: true,
    showFor: "/rentroll",
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
    label: "Commissions",
    href: "/commissions",
    external: false,
    indent: false,
    showFor: null as string | null,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
  },
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
    label: "Bank Acc Tracker",
    href: "/bank-rec",
    external: false,
    indent: false,
    showFor: null as string | null,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="5" width="18" height="14" rx="2" ry="2" />
        <line x1="3" y1="10" x2="21" y2="10" />
        <line x1="7" y1="15" x2="9" y2="15" />
        <line x1="12" y1="15" x2="17" y2="15" />
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
  const { user, authed, setUserId } = useUser();
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 720px)");
    const apply = () => setIsNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  const W = isNarrow ? (open ? 260 : 0) : (open ? 220 : 60);

  function isActive(item: (typeof NAV)[number]) {
    if (item.external) return false;
    if (item.href === "/") return pathname === "/";
    return pathname.startsWith(item.href);
  }

  function isVisible(item: (typeof NAV)[number]) {
    // Role-based visibility (admin sees all; others must have the nav key)
    const roleKey = NAV_ROLE_KEY[item.label];
    const passesRole = !roleKey || user.navKeys.has("all") || user.navKeys.has(roleKey);
    if (!passesRole) return false;

    // Existing context-based visibility (e.g. show child item only on parent route)
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
        zIndex: isNarrow ? 90 : 40,
        overflow: "hidden",
        borderRight: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      {/* User switcher + toggle button */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          justifyContent: open ? "space-between" : "center",
          padding: open ? "14px 12px 14px 12px" : "14px 0",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          flexShrink: 0,
        }}
      >
        {open && <UserSwitcher collapsed={false} />}
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

      {/* Global search trigger */}
      <div style={{ padding: open ? "12px 12px 4px" : "10px 6px 4px", flexShrink: 0 }}>
        <GlobalSearchTrigger collapsed={!open} />
      </div>

      {/* App label */}
      {open && (
        <div style={{ padding: "12px 16px 8px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#93c5fd", flexShrink: 0 }}>
          Tools
        </div>
      )}

      {/* Nav links */}
      <nav style={{ flex: 1, padding: open ? "4px 8px" : "8px 6px", display: "flex", flexDirection: "column", gap: 2, minHeight: 0 }}>
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

      {/* Bottom row — Sign Out + theme/notification toggles (only when expanded) */}
      <div style={{
        padding: open ? "10px 8px 14px" : "10px 6px 14px",
        borderTop: "1px solid rgba(255,255,255,0.07)",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}>
        <button
          onClick={async () => {
            try { await fetch("/api/site/logout", { method: "POST" }); } catch { /* ignore */ }
            setUserId("harry");
            window.location.href = "/login";
          }}
          title="Sign out"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flex: 1,
            padding: open ? "9px 10px" : "9px 0",
            justifyContent: open ? "flex-start" : "center",
            borderRadius: 8,
            background: "transparent",
            color: "#e0f0ff",
            border: "none",
            fontSize: 14,
            fontWeight: 500,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.12)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
        >
          <span style={{ flexShrink: 0, display: "flex" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </span>
          {open && <span>Sign out</span>}
        </button>
        {open && (
          <div style={{ display: "flex", gap: 6 }}>
            <NotificationsToggle />
            <ThemeToggle />
          </div>
        )}
      </div>
    </div>
  );
}

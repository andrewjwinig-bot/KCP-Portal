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
  "Debt Tracker":       "debt",
  "Rent Roll":          "rentroll",
  "Leasing Activity":   "leasing-activity",
  "Expense History":    "base-years",
  "Expense Trends":     "base-years",
  "CAM Reconciliation": "base-years",
  "Commissions":        "commissions",
  "Retail Commissions": "commissions-retail",
  "Security Deposits":  "deposits",
  "Task Tracker":       "tracker",
  "Filing Tracker":     "tracker",
  "Bank Acc Tracker":   "bank-rec-tracker",
  "Payroll Invoicer":   "payroll-invoicer",
  "Payroll History":    "payroll-history",
  "CC Expense Coder":   "expenses",
  "CC Expense History": "expenses-history",
  "Allocated Invoicer": "allocated",
  "Requests":           "maintenance",
  "Maintenance Reports":"maintenance",
  "Reservations":       "reservations",
  "Bank Transfers":     "bank-transfers",
  "Budgets":            "financials-budgets",
};

// Group metadata. Sidebar items can opt into a group via `groupId`; the
// group renders as a collapsible header with its children indented
// beneath, replacing the inline order they'd otherwise appear in.
// Visible cue: chevron + slightly tinted background distinguishes a
// group header from a plain link.
const GROUPS: Record<string, { label: string; icon: React.ReactNode }> = {
  directory: {
    label: "Directory",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    ),
  },
  banking: {
    label: "Banking",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-6 9 6" />
        <path d="M5 9v10" />
        <path d="M19 9v10" />
        <path d="M9 9v10" />
        <path d="M15 9v10" />
        <line x1="3" y1="21" x2="21" y2="21" />
      </svg>
    ),
  },
  invoicing: {
    label: "Invoicing",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="9" y1="14" x2="15" y2="14" />
        <line x1="9" y1="18" x2="15" y2="18" />
      </svg>
    ),
  },
  service: {
    label: "Service",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
    ),
  },
  tenancy: {
    label: "Tenancy",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 21h18" />
        <path d="M5 21V7l7-4 7 4v14" />
        <path d="M9 9h1" />
        <path d="M14 9h1" />
        <path d="M9 13h1" />
        <path d="M14 13h1" />
        <path d="M9 17h1" />
        <path d="M14 17h1" />
      </svg>
    ),
  },
  cam: {
    label: "CAM",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M9 9h6" />
        <path d="M9 12h6" />
        <path d="M9 15h4" />
      </svg>
    ),
  },
  financials: {
    label: "Financials",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 21h18" />
        <polyline points="6 17 10 11 14 15 20 7" />
        <polyline points="14 7 20 7 20 13" />
      </svg>
    ),
  },
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
    label: "Task Tracker",
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
    label: "Property Info",
    href: "/properties",
    external: false,
    indent: false,
    showFor: null as string | null,
    groupId: "directory",
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
    groupId: "directory",
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
    label: "Debt Tracker",
    href: "/debt",
    external: false,
    indent: false,
    showFor: null as string | null,
    groupId: "banking",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="3" y1="3" x2="3" y2="21" />
        <line x1="3" y1="21" x2="21" y2="21" />
        <polyline points="6 8 11 13 15 10 20 16" />
      </svg>
    ),
  },
  {
    label: "Rent Roll",
    href: "/rentroll",
    external: false,
    indent: false,
    showFor: null as string | null,
    groupId: "tenancy",
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
    label: "Occ. Trends",
    href: "/rentroll/trends",
    external: false,
    indent: true,
    showFor: "/rentroll",
    groupId: "tenancy",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 17 9 11 13 15 21 7" />
        <polyline points="14 7 21 7 21 14" />
      </svg>
    ),
  },
  {
    label: "Leasing Activity",
    href: "/rentroll/leasing",
    external: false,
    indent: false,
    showFor: null as string | null,
    groupId: "tenancy",
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
    label: "Expense History",
    href: "/rentroll/base-years",
    external: false,
    indent: false,
    showFor: null as string | null,
    groupId: "cam",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <line x1="3" y1="10" x2="21" y2="10" />
        <line x1="9" y1="10" x2="9" y2="20" />
        <line x1="12" y1="2" x2="12" y2="6" />
      </svg>
    ),
  },
  {
    label: "Expense Trends",
    href: "/rentroll/base-years/trends",
    external: false,
    indent: true,
    showFor: "/rentroll/base-years",
    groupId: "cam",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 17 9 11 13 15 21 7" />
        <polyline points="14 7 21 7 21 14" />
      </svg>
    ),
  },
  {
    label: "CAM Reconciliation",
    href: "/cam-recon",
    external: false,
    indent: false,
    showFor: null as string | null,
    groupId: "cam",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v18h18" />
        <rect x="7" y="12" width="3" height="6" />
        <rect x="12" y="8" width="3" height="10" />
        <rect x="17" y="5" width="3" height="13" />
      </svg>
    ),
  },
  {
    label: "Commissions",
    href: "/commissions",
    external: false,
    indent: false,
    showFor: null as string | null,
    groupId: "invoicing",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
  },
  {
    label: "Retail Commissions",
    href: "/commissions/retail",
    external: false,
    indent: false,
    showFor: null as string | null,
    groupId: "invoicing",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        <rect x="3" y="15" width="6" height="6" rx="1" />
      </svg>
    ),
  },
  {
    label: "Security Deposits",
    href: "/deposits",
    external: false,
    indent: false,
    showFor: null as string | null,
    groupId: "banking",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="7" width="20" height="13" rx="2" />
        <path d="M2 11h20" />
        <path d="M6 3h12l2 4H4l2-4z" />
      </svg>
    ),
  },
  {
    label: "Bank Acc Tracker",
    href: "/bank-rec",
    external: false,
    indent: false,
    showFor: null as string | null,
    groupId: "banking",
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
    groupId: "invoicing",
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
    groupId: "invoicing",
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
    groupId: "invoicing",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <line x1="2" y1="10" x2="22" y2="10" />
      </svg>
    ),
  },
  {
    label: "CC Expense History",
    href: "/expenses/history",
    external: false,
    indent: true,
    showFor: "/expenses",
    groupId: "invoicing",
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
    groupId: "invoicing",
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
    label: "Requests",
    href: "/maintenance",
    external: false,
    indent: false,
    showFor: null as string | null,
    groupId: "service",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
    ),
  },
  {
    label: "Reservations",
    href: "/reservations",
    external: false,
    indent: false,
    showFor: null as string | null,
    groupId: "service",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8"  y1="2" x2="8"  y2="6" />
        <line x1="3"  y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  {
    label: "Bank Transfers",
    href: "/bank-transfers",
    external: false,
    indent: false,
    showFor: null as string | null,
    groupId: "banking",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 7h13" />
        <polyline points="13 4 16 7 13 10" />
        <path d="M21 17H8" />
        <polyline points="11 14 8 17 11 20" />
      </svg>
    ),
  },
  {
    label: "Budgets",
    href: "/financials/budgets",
    external: false,
    indent: false,
    showFor: null as string | null,
    groupId: "financials",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <line x1="3" y1="10" x2="21" y2="10" />
        <line x1="8" y1="14" x2="16" y2="14" />
        <line x1="8" y1="17" x2="13" y2="17" />
      </svg>
    ),
  },
];

export default function Sidebar({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const pathname = usePathname();
  const { user, authed, setUserId } = useUser();
  const [isNarrow, setIsNarrow] = useState(false);

  // Collapsible groups — store only groups the user has explicitly
  // collapsed. Default for a fresh visitor is "all groups collapsed" so
  // the sidebar reads as a tidy summary on first login; users expand
  // what they want and that state persists.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set(Object.keys(GROUPS)));
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem("kcp:sidebarCollapsed");
      if (raw) setCollapsedGroups(new Set(JSON.parse(raw)));
    } catch { /* ignore */ }
  }, []);
  function toggleGroup(id: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem("kcp:sidebarCollapsed", JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  }
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 720px)");
    const apply = () => setIsNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  const W = isNarrow ? (open ? 260 : 0) : (open ? 220 : 60);

  // Pending reservation count → badge on the Reservations nav item.
  const canSeeReservations = user.navKeys.has("all") || user.navKeys.has("reservations");
  const [reservationPending, setReservationPending] = useState(0);
  useEffect(() => {
    if (!canSeeReservations) { setReservationPending(0); return; }
    let alive = true;
    const load = () => {
      fetch("/api/reservations")
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (!alive || !Array.isArray(j?.reservations)) return;
          setReservationPending(
            j.reservations.filter((x: { status?: string }) => x.status === "Pending").length,
          );
        })
        .catch(() => { /* ignore */ });
    };
    load();
    const timer = setInterval(load, 60000);
    return () => { alive = false; clearInterval(timer); };
  }, [canSeeReservations]);

  // Pending service-request count → badge on the Requests nav item.
  // Counts anything that isn't Complete (matches the dashboard's "open"
  // bucket — New and In Progress).
  const canSeeMaintenance = user.navKeys.has("all") || user.navKeys.has("maintenance");
  const [maintenancePending, setMaintenancePending] = useState(0);
  useEffect(() => {
    if (!canSeeMaintenance) { setMaintenancePending(0); return; }
    let alive = true;
    const load = () => {
      fetch("/api/maintenance/requests")
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (!alive || !Array.isArray(j?.requests)) return;
          setMaintenancePending(
            j.requests.filter((x: { status?: string }) => x.status !== "Complete").length,
          );
        })
        .catch(() => { /* ignore */ });
    };
    load();
    const timer = setInterval(load, 60000);
    return () => { alive = false; clearInterval(timer); };
  }, [canSeeMaintenance]);

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

  function badgeFor(item: (typeof NAV)[number]): number {
    if (item.label === "Reservations") return reservationPending;
    if (item.label === "Requests") return maintenancePending;
    return 0;
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

      {/* Nav links — items rendered in source order; items with a
          groupId collapse under their group header at the point of
          first occurrence so order is preserved. */}
      <nav style={{ flex: 1, padding: open ? "4px 8px" : "8px 6px", display: "flex", flexDirection: "column", gap: 2, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}>
        {(() => {
          const visible = NAV.filter((item) => isVisible(item));
          const renderedGroups = new Set<string>();
          const out: React.ReactNode[] = [];

          const renderLink = (item: (typeof NAV)[number], inGroup: boolean) => {
            const active = isActive(item);
            const badge = badgeFor(item);
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
                  // Group children get a base indent of 12px when open;
                  // sub-indented items (Payroll History etc) stack on top.
                  marginLeft: open ? (inGroup ? 12 : 0) + (item.indent ? 16 : 0) : 0,
                  justifyContent: open ? "flex-start" : "center",
                  borderRadius: 8,
                  color: active ? "#fff" : "#e0f0ff",
                  textDecoration: "none",
                  fontSize: 14,
                  fontWeight: active ? 700 : 500,
                  cursor: "pointer",
                  transition: "background 0.15s",
                  whiteSpace: "nowrap",
                  position: "relative",
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
                {open && (
                  <span>
                    {item.label}
                    {item.href === "/rentroll/trends" && (
                      <span style={{
                        color: "#f87171",
                        fontWeight: 800,
                        fontSize: 10,
                        marginLeft: 6,
                        letterSpacing: "0.06em",
                      }}>DRAFT</span>
                    )}
                  </span>
                )}
                {open && badge > 0 && (
                  <span style={{
                    marginLeft: "auto", minWidth: 18, height: 18, padding: "0 5px",
                    borderRadius: 999, background: "#dc2626", color: "#fff",
                    fontSize: 10, fontWeight: 800, lineHeight: 1,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>{badge}</span>
                )}
                {!open && badge > 0 && (
                  <span style={{
                    position: "absolute", top: 3, right: 6,
                    minWidth: 15, height: 15, padding: "0 3px",
                    borderRadius: 999, background: "#dc2626", color: "#fff",
                    fontSize: 9, fontWeight: 800, lineHeight: 1,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>{badge}</span>
                )}
              </a>
            );
          };

          for (const item of visible) {
            const gid = (item as { groupId?: string }).groupId;
            if (gid && GROUPS[gid]) {
              if (renderedGroups.has(gid)) continue;
              renderedGroups.add(gid);
              const meta = GROUPS[gid];
              const children = visible.filter((x) => (x as { groupId?: string }).groupId === gid);
              const expanded = !collapsedGroups.has(gid);
              // Sum child badges and roll up onto the group header when
              // collapsed, so a pending Request / Reservation isn't
              // hidden behind a closed group.
              const childBadgeSum = children.reduce((s, c) => s + badgeFor(c), 0);
              const showGroupBadge = !expanded && childBadgeSum > 0;
              out.push(
                <button
                  key={`group-${gid}`}
                  type="button"
                  onClick={() => toggleGroup(gid)}
                  title={meta.label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: open ? "9px 10px" : "9px 0",
                    justifyContent: open ? "flex-start" : "center",
                    borderRadius: 8,
                    color: "#bfdbfe",
                    border: "none",
                    fontFamily: "inherit",
                    fontSize: 13,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    cursor: "pointer",
                    transition: "background 0.15s",
                    whiteSpace: "nowrap",
                    background: "rgba(255,255,255,0.04)",
                    textAlign: "left",
                    width: "100%",
                    position: "relative",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.10)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; }}
                >
                  <span style={{ flexShrink: 0 }}>{meta.icon}</span>
                  {open && (
                    <>
                      <span style={{ flex: 1 }}>{meta.label}</span>
                      {showGroupBadge && (
                        <span style={{
                          minWidth: 18, height: 18, padding: "0 5px",
                          borderRadius: 999, background: "#dc2626", color: "#fff",
                          fontSize: 10, fontWeight: 800, lineHeight: 1,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>{childBadgeSum}</span>
                      )}
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
                        style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s ease", flexShrink: 0 }}>
                        <polyline points="9 6 15 12 9 18" />
                      </svg>
                    </>
                  )}
                  {!open && showGroupBadge && (
                    <span style={{
                      position: "absolute", top: 3, right: 6,
                      minWidth: 15, height: 15, padding: "0 3px",
                      borderRadius: 999, background: "#dc2626", color: "#fff",
                      fontSize: 9, fontWeight: 800, lineHeight: 1,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>{childBadgeSum}</span>
                  )}
                </button>
              );
              if (expanded) {
                for (const child of children) out.push(renderLink(child, true));
              }
              continue;
            }
            out.push(renderLink(item, false));
          }
          return out;
        })()}
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

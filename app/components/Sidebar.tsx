"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { taskOccurrencesBetween } from "@/lib/tracker/taskDefs";
import { IMPORT_REMINDERS, reminderStatus, reminderPeriodLabel, type ImportCoverage, type ImportEvent } from "@/lib/tracker/imports";
import { HoverCard } from "./HoverCard";
import { openThisWeekCount, type Todo } from "@/lib/todos/types";
import { accessGroup, NO_REPORT_CENTER } from "@/lib/users";
import { useUser } from "./UserProvider";
import UserSwitcher from "./UserSwitcher";
import ThemeToggle from "./ThemeToggle";
import SkinToggle from "./SkinToggle";
import NotificationsToggle from "./NotificationsToggle";
import { GlobalSearchTrigger } from "./GlobalSearch";

// Maps each NAV label to a role key. Items in this map are gated; items not in it are always visible.
const NAV_ROLE_KEY: Record<string, string> = {
  "Dashboard":          "dashboard",
  "Property Info":      "properties",
  "Investor Info":      "investors",
  "Debt Tracker":       "debt",
  "Rent Roll":          "rentroll",
  "Unit Info":          "rentroll",
  "Leasing Activity":   "leasing-activity",
  "Receivables":        "tenant-statements",
  "Open Credits": "tenant-statements",
  "Expense History":    "base-years",
  "Expense Trends":     "base-years",
  "CAM Reconciliation": "base-years",
  "Estimates":          "base-years",
  "Commissions":        "commissions",
  "Retail Commissions": "commissions-retail",
  "Security Deposits":  "deposits",
  "Task Tracker":       "task-tracker",
  "Filing Tracker":     "tracker",
  "Bank Acc Tracker":   "bank-rec-tracker",
  "Bank Recs":          "bank-rec-tracker",
  "Payroll Invoicer":   "payroll-invoicer",
  "Payroll History":    "payroll-history",
  "CC Expense Coder":   "expenses",
  "CC Expense History": "expenses-history",
  "Allocated Invoicer": "allocated",
  "Requests":           "maintenance",
  "Maintenance Reports":"maintenance",
  "Reservations":       "reservations",
  "Tenant Emails":      "communications",
  "Bank Transfers":     "bank-transfers",
  // Budgets is its own key (Nancy sees only Budgets); the other financials
  // pages require the broader "financials-statements" key.
  // Its own key: Harry views Bank Balances without the statements.
  "Bank Balances":      "bank-balances",
  "Operating Statements": "financials-statements",
  "Management Fees":    "financials-statements",
  "Flags to Investigate": "financials-statements",
  "Reprojections":      "financials-statements",
  "Budgets":            "financials-budgets",
  "Budget Draft":       "financials-budgets",
  // Its own key: Greg keys building maintenance here and sees nothing else of
  // the budget — the Budgets pages stay closed to him.
  "Audit Log":          "audit",
  // Security group is admin-only in the sidebar (the "audit" key, which only
  // the admin profile's "all" grants). Required non-admins are still routed to
  // /security by the forced-enrollment redirect — they don't need the link.
  "Two-Factor Auth":    "audit",
};

// Group metadata. Sidebar items can opt into a group via `groupId`; the
// group renders as a collapsible header with its children indented
// beneath, replacing the inline order they'd otherwise appear in.
// Explicit within-group item order (by label). Listed items lead in this order;
// anything else in the group trails in nav order.
// A sub-page is listed straight after its parent (it only shows while you are
// in that parent — see `showFor`).
const GROUP_CHILD_ORDER: Record<string, string[]> = {
  // Bank Balances leads Banking (owner).
  banking: ["Bank Balances", "Bank Transfers", "Debt Tracker", "Security Deposits", "Bank Recs", "Bank Acc Tracker"],
  financials: [
    "Operating Statements", "Flags to Investigate",
    "Reprojections",
    "Budgets", "Budget Draft",
  ],
};
// Balance Sheet, the 1099 Register and Management Fees are not in the sidebar — they are
// occasional, and live in the Report Center (/reports) instead.

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
  security: {
    label: "Security",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
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
  // Monthly Review is folded into the Dashboard (finance users see it inline);
  // the standalone /reports/monthly route stays for a clean Print/PDF view.
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
    label: "Unit Info",
    href: "/units",
    external: false,
    indent: false,
    showFor: null as string | null,
    groupId: "directory",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
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
    label: "Estimates",
    href: "/cam-recon/estimates",
    external: false,
    indent: true,
    showFor: "/cam-recon",
    groupId: "cam",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
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
    // Tami's working page: Monthly Statements + Receipt Reconciliation, one
    // page (owner, 11/2026). The statements roster + tenant portal live at
    // /tenant-statements/statements, under the page's Open menu.
    label: "Receivables",
    href: "/tenant-statements",
    external: false,
    indent: false,
    showFor: null as string | null,
    groupId: "invoicing",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <line x1="2" y1="10" x2="22" y2="10" />
        <polyline points="8 15 10 17 14 13" />
      </svg>
    ),
  },
  {
    // Every tenant carrying a credit, itemized from Skyline's Credit Balance
    // report, and an email asking each how they want it applied.
    label: "Open Credits",
    href: "/tenant-statements/credits",
    external: false,
    indent: false,
    showFor: null as string | null,
    groupId: "invoicing",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .8-3 2s1.3 1.7 3 2 3 .8 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5" />
        <line x1="12" y1="6" x2="12" y2="8" /><line x1="12" y1="16" x2="12" y2="18" />
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
    label: "Bank Recs",
    href: "/bank-rec/reconcile",
    external: false,
    indent: false,
    showFor: null as string | null,
    groupId: "banking",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
        <polyline points="21 3 21 8 16 8" />
        <polyline points="8 12 11 15 16 10" />
      </svg>
    ),
  },
  {
    label: "Bank Acc Tracker",
    href: "/bank-rec",
    external: false,
    indent: true,
    showFor: "/bank-rec" as string | null,
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
    label: "Tenant Emails",
    href: "/communications",
    external: false,
    indent: false,
    showFor: null as string | null,
    groupId: "service",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="m22 7-10 6L2 7" />
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
    label: "Bank Balances",
    href: "/financials/cash-analysis",
    external: false,
    indent: false,
    showFor: null as string | null,
    groupId: "banking",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <line x1="2" y1="10" x2="22" y2="10" />
        <circle cx="7" cy="14.5" r="1.5" />
      </svg>
    ),
  },
  {
    label: "Operating Statements",
    href: "/financials/operating-statements",
    external: false,
    indent: false,
    showFor: null as string | null,
    groupId: "financials",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="8" y1="13" x2="16" y2="13" />
        <line x1="8" y1="17" x2="16" y2="17" />
        <line x1="8" y1="9" x2="11" y2="9" />
      </svg>
    ),
  },
  {
    // NAMED FOR WHAT IT HOLDS, AND ALWAYS REACHABLE.
    //
    // It was "Statement Review" in the nav while the page's own content, its
    // Excel and PDF exports ("Operating Statements - Flags to Investigate -
    // 2026.xlsx") and every other link to it said "Flags to Investigate" — so
    // looking for the thing by the name it is called everywhere else found
    // nothing in the sidebar.
    //
    // And `showFor` meant it only appeared once you were ALREADY on Operating
    // Statements, which is the one place you can reach it from by other means.
    // It is a monthly destination — the checklist email is sent from here —
    // not a detail of the page above it, so it stays indented and stays put.
    //
    // A sub-page: shown only while you are in Operating Statements (`showFor`),
    // and listed straight after it by GROUP_CHILD_ORDER.
    label: "Flags to Investigate",
    href: "/financials/operating-statements/review",
    external: false,
    indent: true,
    showFor: "/financials/operating-statements" as string | null,
    groupId: "financials",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
  {
    label: "Reprojections",
    href: "/financials/reprojections",
    external: false,
    indent: false,
    showFor: null as string | null,
    groupId: "financials",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v18h18" />
        <path d="M7 14l4-4 3 3 5-6" />
        <polyline points="16 4 19 4 19 7" />
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
  {
    label: "Budget Draft",
    href: "/financials/budgets/draft",
    external: false,
    indent: true,
    showFor: "/financials/budgets" as string | null,
    groupId: "financials",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    ),
  },
  {
    // The report center: every report the portal produces, in one place.
    // Everyone can open it; it lists only the reports that person can reach.
    label: "Reports",
    href: "/reports",
    external: false,
    indent: false,
    showFor: null as string | null,
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
    label: "Two-Factor Auth",
    href: "/security",
    external: false,
    indent: false,
    showFor: null as string | null,
    groupId: "security",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
  },
  {
    label: "Audit Log",
    href: "/audit",
    external: false,
    indent: false,
    showFor: null as string | null,
    groupId: "security",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11l3 3 8-8" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
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
  // Collapsed rail: hovering a section opens a flyout naming it, with its pages.
  const [flyout, setFlyout] = useState<{ gid: string; top: number } | null>(null);
  const flyoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keepFlyout = () => { if (flyoutTimer.current) clearTimeout(flyoutTimer.current); };
  const dropFlyout = () => { keepFlyout(); flyoutTimer.current = setTimeout(() => setFlyout(null), 160); };
  useEffect(() => { if (open) setFlyout(null); }, [open]);
  const kidsByGroup: Record<string, (typeof NAV)[number][]> = {};
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
  const W = isNarrow ? (open ? 260 : 0) : (open ? "var(--sb-w-open)" : 60);

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

  // Personal to-do count → folded into the Task Tracker badge (the personal list
  // now lives on the Tracker page + dashboard card, not its own nav item).
  const [todoBadge, setTodoBadge] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () => {
      fetch("/api/todos")
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (!alive || !Array.isArray(j?.todos)) return;
          setTodoBadge(openThisWeekCount(j.todos as Todo[], new Date()));
        })
        .catch(() => { /* ignore */ });
    };
    load();
    const timer = setInterval(load, 60000);
    return () => { alive = false; clearInterval(timer); };
  }, [pathname]);

  // Tasks still to do this calendar week (Mon–Sun containing today) — a badge on
  // the Task Tracker nav. Completed tasks (checked off, per the tracker's
  // localStorage) drop out of the count.
  const tasksThisWeek = useMemo(() => {
    const now = new Date();
    const monday = new Date(now); monday.setHours(0, 0, 0, 0);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6); sunday.setHours(23, 59, 59, 999);
    const occ = taskOccurrencesBetween(monday, sunday);
    const maps: Record<string, Record<string, boolean>> = {};
    return occ.filter((o) => {
      const k = `tracker-v2-${o.date.getFullYear()}-${o.date.getMonth()}`;
      if (!(k in maps)) { try { maps[k] = JSON.parse(localStorage.getItem(k) ?? "{}"); } catch { maps[k] = {}; } }
      return !maps[k]?.[o.id];
    }).length;
  }, []);

  // IMPORTS DUE: a badge on the page that takes the import (owner: "if GLs need
  // to be posted in operating statements page … or if i need to run the bank
  // balance report"). The viewer's own reminders only, judged by the same
  // `reminderStatus` the dashboard and Task Tracker use; a multi-file import
  // (the GL) counts the properties still owed. Hover the badge for what.
  const importOwner = user.id === "admin" ? "drew" : user.id;
  const [importsDue, setImportsDue] = useState<Record<string, { n: number; rows: { label: string; value: string }[] }>>({});
  useEffect(() => {
    let alive = true;
    const load = () => {
      fetch("/api/tracker/import-events", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { events?: Record<string, ImportEvent>; coverage?: Record<string, ImportCoverage> } | null) => {
          if (!alive || !j) return;
          const now = new Date();
          const out: Record<string, { n: number; rows: { label: string; value: string }[] }> = {};
          for (const r of IMPORT_REMINDERS) {
            if ((r.owner ?? "drew") !== importOwner) continue;
            const cov = j.coverage?.[r.id];
            const st = reminderStatus(r, j.events?.[r.id]?.at, now, cov);
            if (st !== "due" && st !== "overdue") continue;
            const n = cov && cov.total > 1 ? Math.max(1, cov.behind.length) : 1;
            const period = reminderPeriodLabel(r, now);
            const cur = out[r.link] ?? { n: 0, rows: [] };
            cur.n += n;
            cur.rows.push({
              label: `${r.label}${period ? ` · ${period}` : ""}`,
              value: cov && cov.total > 1 ? `${cov.behind.length} of ${cov.total} to import` : st === "overdue" ? "Overdue" : "Due now",
            });
            out[r.link] = cur;
          }
          setImportsDue(out);
        })
        .catch(() => { /* ignore */ });
    };
    load();
    const timer = setInterval(load, 120000);
    return () => { alive = false; clearInterval(timer); };
  }, [importOwner, pathname]);

  function isActive(item: (typeof NAV)[number]) {
    if (item.external) return false;
    if (item.href === "/") return pathname === "/";
    if (!pathname.startsWith(item.href)) return false;
    // Most-specific wins: defer to any nav item whose href is a longer
    // descendant of this one that also matches the current path (so on
    // /units/[ref] the "Unit Info" item lights up, not a broader parent).
    const moreSpecific = NAV.some(
      (o) =>
        !o.external && o.href !== "/" &&
        o.href.length > item.href.length &&
        o.href.startsWith(item.href) &&
        pathname.startsWith(o.href),
    );
    return !moreSpecific;
  }

  function isVisible(item: (typeof NAV)[number]) {
    // Role-based visibility (admin sees all; others must have the nav key)
    const roleKey = NAV_ROLE_KEY[item.label];
    // Operating Statements alone also answers to its own key (Tami reads the
    // statements without the rest of the financials group).
    const passesRole = !roleKey || user.navKeys.has("all") || user.navKeys.has(roleKey)
      || (item.label === "Operating Statements" && user.navKeys.has("operating-statements"))
      // Open Credits alone answers to its own key (Harry, Alison, Nancy view it).
      || (item.label === "Open Credits" && user.navKeys.has("open-credits"));
    if (!passesRole) return false;
    if (item.label === "Reports" && NO_REPORT_CENTER.has(user.id)) return false;


    // Existing context-based visibility (e.g. show child item only on parent route)
    if (item.showFor === null) return true;
    if (item.showFor === "/") return pathname === "/" || pathname.startsWith("/history");
    return pathname === item.showFor || pathname.startsWith(item.showFor + "/");
  }

  function badgeFor(item: (typeof NAV)[number]): number {
    if (item.label === "Reservations") return reservationPending;
    if (item.label === "Requests") return maintenancePending;
    if (item.label === "Task Tracker") return tasksThisWeek + todoBadge;
    if (!item.external && importsDue[item.href]) return importsDue[item.href].n;
    return 0;
  }

  return (
    <div
      className={open ? "sb sb-open" : "sb sb-rail"}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        height: "100vh",
        width: W,
        background: "var(--sb-bg)",
        color: "var(--sb-text)",
        display: "flex",
        flexDirection: "column",
        transition: "width 0.2s ease",
        zIndex: isNarrow ? 90 : 40,
        overflow: "hidden",
        borderRight: "1px solid var(--sb-line)",
      }}
    >
      {/* Logo (new look) over the user switcher + toggle button */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          padding: open ? "14px 12px 14px 12px" : "14px 0",
          borderBottom: "1px solid var(--sb-head-line)",
          background: "var(--sb-head-bg)",
          flexShrink: 0,
        }}
      >
        {/* The real Korman logo — shown by the new look only, the full width
            of the sidebar (owner: "make the logo bigger to fill the width"). */}
        {open && <img className="sb-logo" src="/site/Korman_CORPORATE_logo_WHT.png" alt="Korman Commercial Properties" width={1391} height={172} style={{ display: "none", width: "100%", height: "auto", objectFit: "contain", flexShrink: 0, padding: "2px 4px" }} />}
        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: open ? "space-between" : "center" }}>
          {open && (
            <div className="sb-head-main" style={{ minWidth: 0, flex: 1 }}>
              <UserSwitcher collapsed={false} />
            </div>
          )}
          <button
            onClick={onToggle}
            title={open ? "Collapse sidebar" : "Expand sidebar"}
            style={{
              background: "none",
              border: "none",
              color: "var(--sb-head-icon)",
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
      </div>

      {/* Global search trigger */}
      <div style={{ padding: open ? "12px 12px 4px" : "10px 6px 4px", flexShrink: 0 }}>
        <GlobalSearchTrigger collapsed={!open} />
      </div>

      {/* App label */}
      {open && (
        <div style={{ padding: "12px 16px 8px", fontSize: "var(--fs-11)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--sb-label)", flexShrink: 0 }}>
          Tools
        </div>
      )}

      {/* Nav links — items rendered in source order; items with a
          groupId collapse under their group header at the point of
          first occurrence so order is preserved. */}
      <nav className="sidebar-nav" style={{ flex: 1, padding: open ? "4px 8px" : "8px 6px", display: "flex", flexDirection: "column", gap: 2, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}>
        {(() => {
          let visible = NAV.filter((item) => isVisible(item));
          // Per-persona category order (ungrouped items stay on top; the listed
          // groups lead in this order, then any others in nav order; Security
          // still pins to the bottom via its own marginTop). Stable so order
          // within a group is preserved and the render loop emits each group at
          // its first child. Drew has a curated order; service staff lead with
          // the Service group (Requests + Reservations) since that's their job.
          const groupOrder: string[] | null =
            user.id === "drew"
              ? ["financials", "banking", "tenancy", "directory", "cam", "invoicing"]
              : accessGroup(user.id) === "service"
                ? ["service"]
                : null;
          if (groupOrder) {
            const rank = (item: (typeof NAV)[number]) => {
              const gid = (item as { groupId?: string }).groupId;
              if (!gid || !GROUPS[gid]) return 0; // ungrouped → top
              const i = groupOrder.indexOf(gid);
              return i === -1 ? 100 : i + 1;
            };
            visible = visible
              .map((item, idx) => ({ item, idx }))
              .sort((a, b) => rank(a.item) - rank(b.item) || a.idx - b.idx)
              .map((x) => x.item);
          }
          const renderedGroups = new Set<string>();
          const out: React.ReactNode[] = [];

          const renderLink = (item: (typeof NAV)[number], inGroup: boolean) => {
            const active = isActive(item);
            const badge = badgeFor(item);
            // Sub-pages (a group's children, or an indented item) drop their
            // icon when the rail is expanded — icons then read as a "this is a
            // section" signal, cleanly setting category headers apart from their
            // pages. The icon column is preserved (blank) so labels stay aligned.
            // Collapsed, the icon is the only glyph, so it's always kept there.
            const isSubPage = inGroup || item.indent;
            const hideIcon = isSubPage && open;
            return (
              <a
                key={item.label}
                className={`sb-link${isSubPage ? " sb-sub" : ""}${active ? " sb-active" : ""}`}
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
                  color: active ? "var(--sb-active-text)" : "var(--sb-text)",
                  textDecoration: "none",
                  fontSize: "var(--fs-14)",
                  fontWeight: active ? 700 : 500,
                  cursor: "pointer",
                  transition: "background 0.15s",
                  whiteSpace: "nowrap",
                  position: "relative",
                  background: active ? "var(--sb-active-bg)" : "transparent",
                }}
                onMouseEnter={(e) => {
                  if (!active) (e.currentTarget as HTMLElement).style.background = "var(--sb-hover)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = active ? "var(--sb-active-bg)" : "transparent";
                }}
              >
                <span className="sb-icon" style={{ flexShrink: 0, ...(hideIcon ? { width: 22, height: 22 } : {}) }}>{hideIcon ? null : item.icon}</span>
                {open && (
                  <span className="sb-label">
                    {item.label}
                    {item.href === "/rentroll/trends" && (
                      <span style={{
                        color: "var(--c-f87171)",
                        fontWeight: 800,
                        fontSize: "var(--fs-10)",
                        marginLeft: 6,
                        letterSpacing: "0.06em",
                      }}>DRAFT</span>
                    )}
                  </span>
                )}
                {open && badge > 0 && (() => {
                  const dot = (
                    <span style={{
                      minWidth: 18, height: 18, padding: "0 5px",
                      borderRadius: 999, background: "var(--c-dc2626)", color: "#fff",
                      fontSize: "var(--fs-10)", fontWeight: 800, lineHeight: 1,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>{badge}</span>
                  );
                  const due = !item.external ? importsDue[item.href] : undefined;
                  return due
                    ? <HoverCard title="Files to import" rows={due.rows} width={260} help={false} style={{ marginLeft: "auto", display: "flex" }}>{dot}</HoverCard>
                    : <span style={{ marginLeft: "auto", display: "flex" }}>{dot}</span>;
                })()}
                {!open && badge > 0 && (
                  <span style={{
                    position: "absolute", top: 3, right: 6,
                    minWidth: 15, height: 15, padding: "0 3px",
                    borderRadius: 999, background: "var(--c-dc2626)", color: "#fff",
                    fontSize: "var(--fs-9)", fontWeight: 800, lineHeight: 1,
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
              // Explicit within-group order for select groups; listed items lead,
              // anything else trails in nav order.
              const childOrder = GROUP_CHILD_ORDER[gid];
              if (childOrder) {
                children.sort((a, b) => {
                  const ia = childOrder.indexOf(a.label), ib = childOrder.indexOf(b.label);
                  return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
                });
              }
              kidsByGroup[gid] = children;
              const expanded = !collapsedGroups.has(gid);
              // Sum child badges and roll up onto the group header when
              // collapsed, so a pending Request / Reservation isn't
              // hidden behind a closed group.
              const childBadgeSum = children.reduce((s, c) => s + badgeFor(c), 0);
              const showGroupBadge = !expanded && childBadgeSum > 0;
              out.push(
                <button
                  key={`group-${gid}`}
                  className="sb-group"
                  type="button"
                  onClick={() => toggleGroup(gid)}
                  title={open ? meta.label : undefined}
                  onMouseOver={(e) => {
                    if (open) return;
                    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    keepFlyout();
                    setFlyout({ gid, top: r.top });
                  }}
                  onMouseOut={() => { if (!open) dropFlyout(); }}
                  style={{
                    // Pin the Security group to the bottom of the nav, by Sign Out.
                    ...(gid === "security" ? { marginTop: "auto" } : {}),
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: open ? "9px 10px" : "9px 0",
                    justifyContent: open ? "flex-start" : "center",
                    borderRadius: 8,
                    color: "var(--sb-group-text)",
                    border: "none",
                    fontFamily: "inherit",
                    fontSize: "var(--fs-13)",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    cursor: "pointer",
                    transition: "background 0.15s",
                    whiteSpace: "nowrap",
                    background: "var(--sb-group-bg)",
                    textAlign: "left",
                    width: "100%",
                    position: "relative",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--sb-group-hover)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--sb-group-bg)"; }}
                >
                  <span className="sb-icon" style={{ flexShrink: 0 }}>{meta.icon}</span>
                  {open && (
                    <>
                      <span className="sb-group-label" style={{ flex: 1 }}>{meta.label}</span>
                      {showGroupBadge && (
                        <span style={{
                          minWidth: 18, height: 18, padding: "0 5px",
                          borderRadius: 999, background: "var(--c-dc2626)", color: "#fff",
                          fontSize: "var(--fs-10)", fontWeight: 800, lineHeight: 1,
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
                      borderRadius: 999, background: "var(--c-dc2626)", color: "#fff",
                      fontSize: "var(--fs-9)", fontWeight: 800, lineHeight: 1,
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

      {!open && flyout && GROUPS[flyout.gid] && typeof document !== "undefined" && createPortal(
        <div
          className="sb-flyout"
          onMouseEnter={keepFlyout}
          onMouseLeave={dropFlyout}
          style={{
            position: "fixed", left: 64, top: Math.max(8, Math.min(flyout.top - 8, window.innerHeight - 80)), zIndex: 200,
            minWidth: 240, maxWidth: 320, maxHeight: "calc(100vh - 16px)", overflowY: "auto",
            background: "var(--card)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 12,
            boxShadow: "0 12px 32px rgba(16,24,40,0.18)", padding: "14px 10px 10px",
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.01em", padding: "0 10px 8px" }}>{GROUPS[flyout.gid].label}</div>
          {(kidsByGroup[flyout.gid] ?? []).map((child) => (
            <a key={child.label} href={child.href} style={{
              display: "block", padding: "9px 10px", borderRadius: 8, fontSize: 17,
              fontWeight: isActive(child) ? 700 : 500, textDecoration: "none",
              color: isActive(child) ? "var(--brand)" : "var(--text)",
              background: isActive(child) ? "var(--sb-active-bg)" : "transparent",
            }}>{child.label}</a>
          ))}
        </div>,
        document.body,
      )}

      {/* Bottom row — Sign Out + theme/notification toggles (only when expanded) */}
      <div style={{
        padding: open ? "10px 8px 14px" : "10px 6px 14px",
        borderTop: "1px solid var(--sb-line)",
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
            color: "var(--sb-text)",
            border: "none",
            fontSize: "var(--fs-14)",
            fontWeight: 500,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--sb-hover)"; }}
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
            <SkinToggle />
            <ThemeToggle />
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "./Sidebar";
import GlobalSearch from "./GlobalSearch";
import { useUser } from "./UserProvider";
import { isPathAllowed } from "../../lib/users";

// Routes that render without the portal chrome (no sidebar, no auth gate).
// These are exempt from the site-cookie check in middleware too, so anyone
// can reach them without signing in.
const PUBLIC_PATHS = new Set(["/submit", "/login", "/service", "/reserve"]);

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  const [isNarrow, setIsNarrow] = useState(false);
  const sidebarW = isNarrow ? 0 : open ? 220 : 60;
  const pathname = usePathname();
  const router = useRouter();
  const { user, hydrated } = useUser();
  const isPublic = PUBLIC_PATHS.has(pathname) || pathname.startsWith("/statement/") || pathname.startsWith("/portal/");

  // Auto-collapse the sidebar to a hidden drawer on narrow viewports.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 720px)");
    const apply = () => {
      setIsNarrow(mq.matches);
      if (mq.matches) setOpen(false);
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!hydrated || isPublic) return;
    if (!isPathAllowed(user.id, pathname)) {
      router.replace("/dashboard");
    }
  }, [hydrated, pathname, user.id, router, isPublic]);

  // Public pages render raw — no sidebar, no width offset.
  if (isPublic) return <>{children}</>;

  return (
    <div style={{ paddingLeft: sidebarW, transition: "padding-left 0.2s ease", minHeight: "100vh", overflowX: "hidden" }}>
      {isNarrow && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="no-print"
          style={{
            position: "fixed", top: 12, left: 12, zIndex: 90,
            width: 40, height: 40, borderRadius: 10,
            background: "var(--card)", border: "1px solid var(--border)",
            boxShadow: "0 2px 10px rgba(2,6,23,0.08)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6"  x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      )}
      {isNarrow && open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 80,
            background: "rgba(15,23,42,0.45)",
          }}
        />
      )}
      <Sidebar open={open} onToggle={() => setOpen((o) => !o)} />
      <GlobalSearch />
      <div style={{ paddingTop: isNarrow ? 56 : 0 }}>
        {children}
      </div>
    </div>
  );
}

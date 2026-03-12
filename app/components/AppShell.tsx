"use client";

import { useState } from "react";
import Sidebar from "./Sidebar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  const sidebarW = open ? 220 : 60;

  return (
    <div style={{ paddingLeft: sidebarW, transition: "padding-left 0.2s ease", minHeight: "100vh", overflowX: "hidden" }}>
      <Sidebar open={open} onToggle={() => setOpen((o) => !o)} />
      {/* Korman Commercial Properties logo — fixed top-right on every page */}
      <div style={{ position: "fixed", top: 22, right: 20, zIndex: 30, display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ fontFamily: "'Arial Black', 'Arial Bold', Arial, sans-serif", fontWeight: 900, fontSize: 30, letterSpacing: "-0.5px", lineHeight: 1 }}>KORMAN</span>
        <div style={{ width: 1, height: 36, background: "#000", flexShrink: 0 }} />
        <div style={{ fontSize: 11, letterSpacing: "0.22em", lineHeight: 1.7, fontFamily: "Arial, Helvetica, sans-serif" }}>
          <div>COMMERCIAL</div>
          <div>PROPERTIES</div>
        </div>
      </div>
      {children}
    </div>
  );
}

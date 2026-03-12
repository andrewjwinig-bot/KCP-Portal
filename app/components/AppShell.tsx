"use client";

import { useState } from "react";
import Sidebar from "./Sidebar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  const sidebarW = open ? 220 : 60;

  return (
    <div style={{ paddingLeft: sidebarW, transition: "padding-left 0.2s ease", minHeight: "100vh", overflowX: "hidden" }}>
      <Sidebar open={open} onToggle={() => setOpen((o) => !o)} />
      {children}
    </div>
  );
}

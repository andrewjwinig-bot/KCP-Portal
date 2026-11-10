"use client";
// An ⓘ button that opens the Skyline import steps in a small popover — the
// steps stay one click away instead of filling the page. Shared by the CAM
// recon's year-end exports, Receipt Reconciliation and Open Credits.

import { useState } from "react";
import { Info } from "lucide-react";

export function InfoPopover({ children, label = "Skyline import steps", align = "right" }: { children: React.ReactNode; label?: string; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label={label} title={label}
        style={{ width: 28, height: 28, borderRadius: 999, border: "1px solid var(--border)", background: "var(--card)", color: "var(--muted)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
        <Info size={16} strokeWidth={1.75} aria-hidden />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <div style={{ position: "absolute", top: "calc(100% + 8px)", [align]: 0, zIndex: 50, width: 400, maxWidth: "90vw", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "4px 16px 14px", boxShadow: "var(--shadow-pop, 0 10px 30px rgba(0,0,0,0.15))" }}>
            {children}
          </div>
        </>
      )}
    </span>
  );
}

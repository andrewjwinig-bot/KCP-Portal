"use client";

// Small "Download ▾" dropdown — the same footprint/behavior as the Budgets
// page's Download menu, extracted so Operating Statements, Reprojections, and
// anywhere else can reuse it. Items are download links (Excel / PDF / …) with
// an optional one-line description. Closes on outside click or Escape.

import React, { useEffect, useRef, useState } from "react";

// An item is either a download link (href) or a client-side action (onClick) —
// e.g. a workbook/PDF generated in the browser.
export type DownloadItem = { label: string; description?: string; href?: string; onClick?: () => void };

export function DownloadMenu({ label = "Download", items, variant = "primary", disabled }: {
  label?: string;
  items: DownloadItem[];
  variant?: "default" | "primary";
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDocClick); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        className={variant === "primary" ? "btn primary" : "btn"}
        style={{ fontSize: 13, padding: "8px 14px", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6 }}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {label}
        <span aria-hidden style={{ fontSize: 10, opacity: 0.75, lineHeight: 1 }}>▾</span>
      </button>
      {open && (
        <div role="menu" style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 40, minWidth: 260,
          background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10,
          boxShadow: "0 8px 24px rgba(15,23,42,0.18)", padding: 4, display: "flex", flexDirection: "column",
        }}>
          {items.map((item, i) => {
            const itemStyle: React.CSSProperties = { display: "block", textAlign: "left", textDecoration: "none", background: "transparent", border: 0, borderRadius: 6, padding: "8px 10px", cursor: "pointer", width: "100%", fontFamily: "inherit" };
            const onEnter = (e: React.MouseEvent<HTMLElement>) => { e.currentTarget.style.background = "rgba(15,23,42,0.05)"; };
            const onLeave = (e: React.MouseEvent<HTMLElement>) => { e.currentTarget.style.background = "transparent"; };
            const inner = (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{item.label}</div>
                {item.description && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2, lineHeight: 1.35 }}>{item.description}</div>}
              </>
            );
            return item.onClick ? (
              <button key={i} type="button" role="menuitem" onClick={() => { setOpen(false); item.onClick!(); }} onMouseEnter={onEnter} onMouseLeave={onLeave} style={itemStyle}>{inner}</button>
            ) : (
              <a key={i} href={item.href} role="menuitem" onClick={() => setOpen(false)} onMouseEnter={onEnter} onMouseLeave={onLeave} style={itemStyle}>{inner}</a>
            );
          })}
        </div>
      )}
    </div>
  );
}

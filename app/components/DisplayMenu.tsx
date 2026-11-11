"use client";
// THE page's "Display" menu — the settings someone changes now and then
// (amounts, empty rows, GL accounts, thresholds) in one dropdown instead of a
// row of toggles across the header (owner: "group the display controls in one
// dropdown to be more clean and simple"). Operating Statements and
// Reprojections share it; a page adds its rows as children.
import { useEffect, useRef, useState } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";

export const toggleLabel: React.CSSProperties = { fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" };
const toggleBtn: React.CSSProperties = {
  fontSize: "var(--fs-11)", fontWeight: 700, padding: "4px 10px",
  border: "1px solid var(--border)", background: "var(--card)",
  color: "var(--text)", cursor: "pointer", letterSpacing: "0.04em", textTransform: "uppercase",
};
const toggleActive: React.CSSProperties = { background: "var(--c-0b4a7d)", color: "#fff", borderColor: "var(--c-0b4a7d)" };

/** One two-way setting, label left and the two buttons right. */
export function ToggleRow({ label, left, right, active, onLeft, onRight, disabled }: {
  label: string; left: string; right: string; active: "left" | "right";
  onLeft: () => void; onRight: () => void; disabled?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, width: "100%" }}>
      <span className="muted small" style={toggleLabel}>{label}</span>
      <div style={{ display: "inline-flex", borderRadius: 6, overflow: "hidden", opacity: disabled ? 0.5 : 1 }}>
        <button type="button" disabled={disabled} onClick={() => !disabled && onLeft()} style={{ ...toggleBtn, cursor: disabled ? "not-allowed" : "pointer", borderRadius: "6px 0 0 6px", ...(active === "left" ? toggleActive : {}) }}>{left}</button>
        <button type="button" disabled={disabled} onClick={() => !disabled && onRight()} style={{ ...toggleBtn, cursor: disabled ? "not-allowed" : "pointer", borderLeft: "none", borderRadius: "0 6px 6px 0", ...(active === "right" ? toggleActive : {}) }}>{right}</button>
      </div>
    </div>
  );
}

/** The button and its popover. Closes on an outside click or Escape. */
export function DisplayMenu({ children, label = "Display" }: { children: React.ReactNode; label?: string }) {
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
      <button type="button" onClick={() => setOpen((v) => !v)} className="btn icon-tip" aria-haspopup="menu" aria-expanded={open} aria-label={label} data-tip={label}>
        <SlidersHorizontal size={16} strokeWidth={1.75} aria-hidden style={{ verticalAlign: "-3px", flexShrink: 0 }} />
        <span className="menu-btn-label" style={{ marginLeft: 6 }}>{label}</span>
        <ChevronDown size={16} strokeWidth={1.75} aria-hidden style={{ marginLeft: 6, verticalAlign: "-3px", flexShrink: 0 }} />
      </button>
      {open && (
        <div role="menu" style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 40, minWidth: 290,
          background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10,
          boxShadow: "0 8px 24px rgba(15,23,42,0.18)", padding: 14, display: "flex", flexDirection: "column", gap: 12,
        }}>
          {children}
        </div>
      )}
    </div>
  );
}

/** A yes / no option in the menu ("Only tenants with a balance", a column). */
export function CheckRow({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: "var(--fs-14)", cursor: "pointer" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ marginTop: 2 }} />
      <span>{label}{hint && <span className="muted" style={{ display: "block", fontSize: "var(--fs-13)" }}>{hint}</span>}</span>
    </label>
  );
}

/** A small heading over a group of rows inside the menu. */
export function MenuSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <span className="muted small" style={toggleLabel}>{label}</span>
      {children}
    </div>
  );
}

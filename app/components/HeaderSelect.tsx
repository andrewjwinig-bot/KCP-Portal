"use client";
// THE page's driving pickers — property first, then the period — as large,
// borderless text with a chevron (owner: "feels more crisp since its a good
// size without the boxes … put property first though before the period").
// A native <select> sits invisibly over the text, so the OS list still opens
// and keyboards / screen readers work. Secondary filters stay ordinary selects.
import { ChevronDown } from "lucide-react";

export function HeaderSelect({ value, onChange, displayLabel, ariaLabel, muted, maxWidth, children }: {
  value: string; onChange: (v: string) => void; displayLabel: string; ariaLabel: string;
  /** The secondary picker (the period beside a property) reads in grey. */
  muted?: boolean;
  maxWidth?: number;
  children: React.ReactNode;
}) {
  return (
    <span className="header-select" style={{ maxWidth: maxWidth ?? "100%" }}>
      <span className="header-select-label" style={{ color: muted ? "var(--muted)" : "var(--text)" }}>{displayLabel}</span>
      <ChevronDown size={16} strokeWidth={1.75} aria-hidden style={{ flexShrink: 0, opacity: 0.6, color: muted ? "var(--muted)" : "var(--text)" }} />
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={ariaLabel} className="header-select-native">
        {children}
      </select>
    </span>
  );
}

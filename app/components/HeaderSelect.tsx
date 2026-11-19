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

/** ONE way to name a property in a picker, header or option: "9510 · Shops of
 *  Lafayette Hill" (owner, 11/2026: "a lot of inconsistencies in how we do
 *  tenants and property dropdowns"). Never "—", never the code alone. */
export const propertyLabel = (code: string, name?: string | null) => (name && name !== code ? `${code} · ${name}` : code);

/** ONE way to name a tenant: the suite, then the tenant ("104 · Shear
 *  Sensation"), as `UnitSelect` lists them. A vacancy reads "104 · Vacant". */
export const tenantLabel = (suite: string, name?: string | null) => (name ? `${suite} · ${name}` : suite);

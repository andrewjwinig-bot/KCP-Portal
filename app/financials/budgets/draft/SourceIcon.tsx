"use client";

// The ONE marker a budget line carries for where its figure comes from: a small
// quiet icon — ⓘ for "here is the working" (hover it), ↗ for "it is worked out
// somewhere else" (click to go there). Text pills ("Per city", "$1.00/SF
// vacant", "6% of revenue", "Payroll") crowded the line name out of the narrow
// Line column, so only the short growth pills ("+3%", "Flat") stay as text.

import { HoverCard } from "@/app/components/HoverCard";

type TipRow = { label: string; value: string; color?: string };

export function InfoGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6.4" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 7.2v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="8" cy="4.9" r="0.95" fill="currentColor" />
    </svg>
  );
}

export function LinkGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M6 3.5H3.5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V10M9 2.5h4.5V7M13.5 2.5 7 9"
        fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const ICON_STYLE: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18,
  borderRadius: 999, flex: "0 0 auto", border: "none", background: "transparent", padding: 0, cursor: "pointer",
};

/** The icon itself, clickable when given `onClick` / `href`. */
export function SourceIconButton({ kind, label, href, onClick }: { kind: "info" | "link"; label: string; href?: string; onClick?: () => void }) {
  const glyph = kind === "link" ? <LinkGlyph /> : <InfoGlyph />;
  if (href) return <a href={href} aria-label={label} className="source-link" style={ICON_STYLE}>{glyph}</a>;
  if (onClick) return <button type="button" onClick={onClick} aria-label={label} className="source-link" style={ICON_STYLE}>{glyph}</button>;
  return <span aria-label={label} className="source-link" style={{ ...ICON_STYLE, cursor: "default" }}>{glyph}</span>;
}

/** Icon + the shared rich hover. */
export function SourceIcon({ kind = "info", title, rows = [], footer, body, width = 300, href, onClick, label }: {
  kind?: "info" | "link";
  title: string;
  rows?: TipRow[];
  footer?: { label: string; value: string; color?: string };
  body?: React.ReactNode;
  width?: number;
  href?: string;
  onClick?: () => void;
  label: string;
}) {
  return (
    <HoverCard title={title} rows={rows} footer={footer} body={body} width={width} help={false}>
      <SourceIconButton kind={kind} label={label} href={href} onClick={onClick} />
    </HoverCard>
  );
}

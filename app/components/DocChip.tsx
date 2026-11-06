"use client";

// A stored document, shown compactly in a table row: a status pill plus a
// document icon, the whole thing a link that opens the file in a new tab.
//
// The filename deliberately does NOT render. Filenames vary wildly in length
// ("2025 Parkwood SC K1P V1 FINAL.pdf" next to "k1.pdf"), so putting one in a
// cell either truncates to nothing useful or makes every row a different
// height. The name belongs in the hover, where there's room to read it whole —
// and the row stays the same shape for every owner.
//
// Shared so the places that show a stored document agree: the K-1 cell on the
// Investor Info ownership table and the per-investor document list.

import { Pill, type PillTone } from "@/app/components/Pill";
import { HoverCard, type TipRow } from "@/app/components/HoverCard";

/** Page-corner document glyph — the same mark wherever a file can be opened. */
export function DocIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

export function DocChip({
  href, tone, label, title, rows, footer, width = 290, minWidth = 104, icon = true,
}: {
  href: string;
  tone: PillTone;
  /** Short, uniform text — a status or a year. Never a filename. */
  label: string;
  /** Hover title: this IS where the filename goes. */
  title: string;
  rows: TipRow[];
  footer?: TipRow;
  width?: number;
  /** Keeps the chip the same footprint whatever the label says. */
  minWidth?: number;
  /** Drop it when the label already says the action ("VIEW"). */
  icon?: boolean;
}) {
  return (
    <HoverCard title={title} rows={rows} footer={footer} width={width}>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          // space-between pins the icon to the chip's right edge, so the icon
          // (and whatever follows it in the cell) lines up down the column even
          // though "PUBLISHED" and "READY" are different widths.
          display: "inline-flex", alignItems: "center", justifyContent: "space-between",
          gap: 5, minWidth, textDecoration: "none", color: "inherit",
        }}
      >
        <Pill tone={tone}>{label}</Pill>
        {icon && <span style={{ display: "inline-flex", color: "#0b4a7d" }}><DocIcon /></span>}
      </a>
    </HoverCard>
  );
}

"use client";

import React from "react";

/**
 * The portal's ONE check: an empty grey circle when open, a filled green
 * circle with a white tick when done. Every to-do list, checklist and
 * "mark done" control uses it, so a tick reads the same everywhere.
 */
export function RoundCheck({ done, onToggle, label, size = 22 }: {
  done: boolean;
  onToggle: () => void;
  /** What ticking it does, for screen readers ("Mark Liberty Bank Report done"). */
  label?: string;
  size?: number;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={label ?? (done ? "Mark not done" : "Mark done")}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(); }}
      className="round-check"
      style={{
        flexShrink: 0, width: size, height: size, borderRadius: 999, padding: 0, cursor: "pointer",
        border: `2px solid ${done ? "#067647" : "#98A2B3"}`,
        background: done ? "#067647" : "transparent",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        transition: "background .12s, border-color .12s",
      }}
    >
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none" stroke={done ? "#fff" : "transparent"} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </button>
  );
}

"use client";

import React, { useEffect, useRef, useState } from "react";

/**
 * The portal's ONE check: an empty grey circle when open, a filled green
 * circle with a white tick when done. Every to-do list, checklist and
 * "mark done" control uses it, so a tick reads the same everywhere.
 *
 * Ticking it is ACKNOWLEDGED (owner, 11/17/26: "do a little animation where
 * the check loads … so its more acknowledged"): the circle fills with a small
 * pop and a ring, and the tick draws itself in. Only on the change from open
 * to done — a list that loads already ticked draws still.
 */
export function RoundCheck({ done, onToggle, label, size = 22 }: {
  done: boolean;
  onToggle: () => void;
  /** What ticking it does, for screen readers ("Mark Liberty Bank Report done"). */
  label?: string;
  size?: number;
}) {
  const was = useRef(done);
  const [pop, setPop] = useState(false);
  useEffect(() => {
    if (done && !was.current) {
      setPop(true);
      const t = setTimeout(() => setPop(false), 700);
      was.current = done;
      return () => clearTimeout(t);
    }
    was.current = done;
  }, [done]);
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={label ?? (done ? "Mark not done" : "Mark done")}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(); }}
      className={`round-check${pop ? " round-check-pop" : ""}`}
      style={{
        flexShrink: 0, width: size, height: size, borderRadius: 999, padding: 0, cursor: "pointer",
        border: `2px solid ${done ? "var(--c-067647)" : "var(--c-98a2b3)"}`,
        background: done ? "var(--c-067647)" : "transparent",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        transition: "background .12s, border-color .12s",
      }}
    >
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none" stroke={done ? "#fff" : "transparent"} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <polyline points="20 6 9 17 4 12" pathLength={1} className="round-check-tick" />
      </svg>
    </button>
  );
}

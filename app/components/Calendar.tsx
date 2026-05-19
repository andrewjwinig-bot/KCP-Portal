"use client";

/**
 * Reusable popover calendar — same look as the one on /reserve.
 *
 * Two visual variants:
 *   variant="underline" — the public-form look (used on /reserve): no
 *     border around the trigger except a bottom underline; navy accent.
 *   variant="card" — the admin look: card-style trigger with a full
 *     border, matches other admin inputs.
 *
 * Both variants render the SAME popover grid so the calendar is visually
 * consistent across the app. See app/components/Pill.tsx for the general
 * style consistency guidelines.
 *
 * Optional features:
 *   - disableWeekends: greys out Sat/Sun and prevents selection.
 *   - minISO / maxISO: clamps the selectable range.
 */

import { useEffect, useMemo, useRef, useState } from "react";

export type CalendarProps = {
  value: string;
  onChange: (iso: string) => void;
  minISO?: string;
  maxISO?: string;
  disableWeekends?: boolean;
  required?: boolean;
  placeholder?: string;
  variant?: "underline" | "card";
};

const NAVY = "#0e2238";
const LINE = "rgba(14,34,56,0.18)";
const LINE_DARK = "rgba(14,34,56,0.55)";
const TEXT = "#1a2238";
const MUTED = "#5a657a";

export function Calendar({
  value,
  onChange,
  minISO,
  maxISO,
  disableWeekends = false,
  required = false,
  placeholder = "Pick a date",
  variant = "underline",
}: CalendarProps) {
  const [open, setOpen] = useState(false);
  const min = useMemo(() => (minISO ? parseISO(minISO) : null), [minISO]);
  const max = useMemo(() => (maxISO ? parseISO(maxISO) : null), [maxISO]);

  const [viewMonth, setViewMonth] = useState<Date>(() => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, mo] = value.split("-").map(Number);
      return new Date(y, mo - 1, 1);
    }
    if (min) return new Date(min.getFullYear(), min.getMonth(), 1);
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const wrapRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const monthLabel = viewMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const days = monthGridDays(viewMonth);

  function prevMonth() {
    const d = new Date(viewMonth);
    d.setMonth(d.getMonth() - 1);
    if (min && lastDayOfMonth(d) < min) return;
    setViewMonth(d);
  }
  function nextMonth() {
    const d = new Date(viewMonth);
    d.setMonth(d.getMonth() + 1);
    if (max && d > max) return;
    setViewMonth(d);
  }

  const displayValue = (() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
    const d = parseISO(value);
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  })();

  const trigger = variant === "card" ? cardTriggerStyle : underlineTriggerStyle;

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          ...trigger,
          color: displayValue ? TEXT : MUTED,
          backgroundImage: caretSvg(),
          backgroundRepeat: "no-repeat",
          backgroundPosition: variant === "card" ? "right 10px center" : "right 4px center",
          backgroundSize: 14,
        }}
      >
        {displayValue || placeholder}
      </button>
      {open && (
        <div style={popoverStyle}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <button type="button" onClick={prevMonth} style={navBtnStyle} aria-label="Previous month">‹</button>
            <div style={{ fontSize: 14, fontWeight: 600, color: NAVY }}>{monthLabel}</div>
            <button type="button" onClick={nextMonth} style={navBtnStyle} aria-label="Next month">›</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <div
                key={i}
                style={{
                  fontSize: 11, fontWeight: 600, textAlign: "center", padding: "4px 0",
                  color: disableWeekends && (i === 0 || i === 6) ? MUTED : NAVY,
                }}
              >
                {d}
              </div>
            ))}
            {days.map((d, i) => {
              const inMonth = d.getMonth() === viewMonth.getMonth();
              const dow = d.getDay();
              const isWeekend = disableWeekends && (dow === 0 || dow === 6);
              const outOfRange = (min && d < min) || (max && d > max);
              const disabled = !inMonth || isWeekend || !!outOfRange;
              const iso = toISO(d);
              const isSelected = iso === value;
              return (
                <button
                  key={i}
                  type="button"
                  disabled={disabled}
                  onClick={() => { onChange(iso); setOpen(false); }}
                  style={{
                    fontFamily: "inherit",
                    fontSize: 13,
                    padding: "6px 0",
                    border: "none",
                    background: isSelected ? NAVY : "transparent",
                    color: isSelected
                      ? "#fff"
                      : disabled
                      ? "rgba(14,34,56,0.25)"
                      : inMonth ? TEXT : MUTED,
                    cursor: disabled ? "default" : "pointer",
                    textAlign: "center",
                    borderRadius: 2,
                  }}
                  aria-label={d.toDateString()}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
          {(disableWeekends || min || max) && (
            <div style={{ fontSize: 11, color: MUTED, marginTop: 10, lineHeight: 1.5 }}>
              {disableWeekends ? "Weekends are unavailable. " : ""}
              {min || max ? `Pick a date${min ? ` from ${fmtShort(min)}` : ""}${max ? ` through ${fmtShort(max)}` : ""}.` : ""}
            </div>
          )}
        </div>
      )}
      <input type="hidden" value={value} required={required} />
    </div>
  );
}

function parseISO(iso: string): Date {
  const [y, mo, d] = iso.split("-").map(Number);
  return new Date(y, mo - 1, d);
}
function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function lastDayOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function fmtShort(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function monthGridDays(viewMonth: Date): Date[] {
  const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  const out: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    out.push(d);
  }
  return out;
}
function caretSvg() {
  const color = encodeURIComponent(NAVY);
  return `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 7' fill='none' stroke='${color}' stroke-width='1.4'><polyline points='1 1 6 6 11 1'/></svg>")`;
}

const underlineTriggerStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "8px 24px 9px 0",
  border: "none",
  borderBottom: `1px solid ${LINE}`,
  background: "transparent",
  fontFamily: "inherit",
  fontSize: 16,
  outline: "none",
  textAlign: "left",
  cursor: "pointer",
};

const cardTriggerStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "8px 30px 8px 10px",
  border: "1px solid var(--border)",
  borderRadius: 6,
  background: "var(--card)",
  fontFamily: "inherit",
  fontSize: 13,
  outline: "none",
  textAlign: "left",
  cursor: "pointer",
};

const popoverStyle: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 6px)",
  left: 0,
  zIndex: 50,
  background: "#fff",
  border: `1px solid ${LINE_DARK}`,
  boxShadow: "0 8px 24px rgba(14,34,56,0.12)",
  padding: 14,
  width: 280,
};

const navBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: `1px solid ${LINE}`,
  color: NAVY,
  width: 26,
  height: 26,
  fontSize: 16,
  lineHeight: 1,
  cursor: "pointer",
  fontFamily: "inherit",
};

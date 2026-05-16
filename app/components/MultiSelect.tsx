"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { paletteTone, type PillTone } from "./Pill";

// Multi-select chip input. Selected values render as removable colored
// chips; the dropdown panel offers a search box and a checkbox list.
// Option colors are stable — the Nth option always gets the Nth palette
// tone — so a given choice reads the same color everywhere.

function toneFor(options: readonly string[], value: string): PillTone {
  return paletteTone(options.indexOf(value));
}

function Chip({
  label,
  tone,
  onRemove,
  disabled,
}: {
  label: string;
  tone: PillTone;
  onRemove?: () => void;
  disabled?: boolean;
}) {
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "2px 8px", borderRadius: 999,
        fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
        background: tone.bg, color: tone.fg, border: `1px solid ${tone.border}`,
      }}
    >
      {label}
      {onRemove && (
        <button
          type="button"
          disabled={disabled}
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          aria-label={`Remove ${label}`}
          style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            background: "transparent", border: "none", padding: 0, margin: 0,
            cursor: disabled ? "default" : "pointer", color: tone.fg,
            fontSize: 12, lineHeight: 1, opacity: 0.8,
          }}
        >
          ✕
        </button>
      )}
    </span>
  );
}

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Select…",
  disabled,
}: {
  options: readonly string[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
  }, [options, query]);

  function toggle(value: string) {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    );
  }

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <div
        onClick={() => { if (!disabled) setOpen((v) => !v); }}
        style={{
          display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
          minHeight: 38, padding: "5px 32px 5px 10px",
          border: "1px solid var(--border)", borderRadius: 8,
          background: disabled ? "rgba(15,23,42,0.03)" : "var(--card)",
          cursor: disabled ? "default" : "pointer",
          position: "relative",
        }}
      >
        {selected.length === 0 && (
          <span style={{ fontSize: 13, color: "var(--muted)" }}>{placeholder}</span>
        )}
        {selected.map((v) => (
          <Chip
            key={v}
            label={v}
            tone={toneFor(options, v)}
            disabled={disabled}
            onRemove={() => onChange(selected.filter((x) => x !== v))}
          />
        ))}
        <span style={{
          position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
          color: "var(--muted)", fontSize: 11, pointerEvents: "none",
        }}>▾</span>
      </div>

      {open && (
        <div
          style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
            zIndex: 50, background: "var(--card)",
            border: "1px solid var(--border)", borderRadius: 10,
            boxShadow: "0 16px 40px rgba(15,23,42,0.18)",
            padding: 8, display: "flex", flexDirection: "column", gap: 6,
            maxHeight: 280, overflow: "auto",
          }}
        >
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find an option"
            style={{
              padding: "6px 8px", fontSize: 13, fontFamily: "inherit",
              border: "1px solid var(--border)", borderRadius: 6,
              background: "var(--card)", color: "var(--text)", outline: "none",
            }}
          />
          {filtered.length === 0 && (
            <div style={{ fontSize: 12, color: "var(--muted)", padding: "4px 6px" }}>
              No matches
            </div>
          )}
          {filtered.map((o) => {
            const checked = selected.includes(o);
            return (
              <button
                key={o}
                type="button"
                onClick={() => toggle(o)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "5px 6px", borderRadius: 6, cursor: "pointer",
                  background: "transparent", border: "none", textAlign: "left",
                  width: "100%",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(15,23,42,0.04)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{
                  width: 16, height: 16, flexShrink: 0, borderRadius: 4,
                  border: `1.5px solid ${checked ? "#2563eb" : "var(--border)"}`,
                  background: checked ? "#2563eb" : "transparent",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  color: "#fff", fontSize: 11, fontWeight: 900, lineHeight: 1,
                }}>
                  {checked ? "✓" : ""}
                </span>
                <Chip label={o} tone={toneFor(options, o)} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

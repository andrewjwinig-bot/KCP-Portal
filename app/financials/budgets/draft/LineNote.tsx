"use client";

// A note on a budget line. Every line carries a small note mark in its name
// cell: faint and shown only on row hover while there is no note (so the grid
// stays quiet), solid brand once there is one, with the note in the shared
// HoverCard. Clicking opens a small dialog to write, change or remove it.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HoverCard } from "@/app/components/HoverCard";

export type LineNote = { text: string; by: string; at: string };

const secLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" };
const stamp = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

/** The note glyph — a small speech bubble, drawn so it matches at any zoom. */
function Glyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true" style={{ display: "block" }}>
      <path d="M2.5 3.5h11a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H7l-3 2.5v-2.5H2.5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1z"
        fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export function NoteMark({ label, note, onOpen }: { label: string; note?: LineNote; onOpen: () => void }) {
  const btn = (
    <button type="button" onClick={onOpen} aria-label={note ? `Note on ${label}` : `Add a note to ${label}`}
      className={note ? "budget-note has" : "budget-note"}>
      <Glyph />
    </button>
  );
  if (!note) return btn;
  return (
    <HoverCard title={note.text} width={300} rows={[]}
      footer={{ label: note.by, value: stamp(note.at) }}>
      {btn}
    </HoverCard>
  );
}

export function NoteDialog({ label, section, note, onSave, onClose }: {
  label: string; section: string; note?: LineNote;
  onSave: (text: string) => Promise<string | null>;
  onClose: () => void;
}) {
  const [text, setText] = useState(note?.text ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = async (t: string) => {
    setBusy(true); setErr(null);
    const e = await onSave(t);
    setBusy(false);
    if (e) setErr(e); else onClose();
  };

  const body = (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 120, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "80px 16px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Note on ${label}`}
        style={{ background: "var(--card)", borderRadius: 12, width: "100%", maxWidth: 480, boxShadow: "0 20px 60px rgba(0,0,0,0.35)", borderTop: "3px solid var(--brand)" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <div>
            <div style={secLabel}>Note · {section}</div>
            <div style={{ fontSize: 17, fontWeight: 800, marginTop: 2 }}>{label}</div>
          </div>
          <button type="button" className="btn sm" onClick={onClose}>Cancel</button>
        </div>
        <div style={{ padding: "14px 18px", display: "grid", gap: 10 }}>
          <textarea ref={ref} value={text} onChange={(e) => setText(e.target.value)} rows={4}
            placeholder="Why this figure — a quote, an assumption, something to follow up…"
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save(text); }}
            style={{ width: "100%", resize: "vertical" }} />
          {note && <div className="muted small">Last edited by {note.by} · {stamp(note.at)}</div>}
          {err && <div className="small" style={{ color: "#b91c1c", fontWeight: 700 }}>{err}</div>}
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <span>{note && <button type="button" className="btn sm" disabled={busy} onClick={() => save("")} style={{ color: "#b91c1c" }}>Remove note</button>}</span>
            <button type="button" className="btn sm primary" disabled={busy || text.trim() === (note?.text ?? "")} onClick={() => save(text)}>
              {busy ? "Saving…" : "Save note"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
  return typeof document !== "undefined" ? createPortal(body, document.body) : null;
}

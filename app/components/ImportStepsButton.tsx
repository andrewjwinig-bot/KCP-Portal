"use client";

// The (i) beside every import prompt (owner, 11/2026: "next to import prompts
// should be a little info icon that has the steps … to help guide someone to
// access the report or file"). Click it for where the file comes from, the
// steps, and where it goes in the portal. The steps live in ONE place,
// `lib/tracker/importSteps.ts`, so every prompt says the same thing.

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, Info, X } from "lucide-react";
import { FilePath } from "@/app/components/FilePath";
import { importStepsFor } from "@/lib/tracker/importSteps";

export function ImportStepsButton({ id, size = 16 }: { id: string; size?: number }) {
  const steps = importStepsFor(id);
  const ref = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!rect) return;
    const close = (e: MouseEvent) => {
      if (card.current?.contains(e.target as Node) || ref.current?.contains(e.target as Node)) return;
      setRect(null);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setRect(null); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [rect]);

  if (!steps) return null;
  const W = 380;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const left = rect ? Math.min(Math.max(rect.left + rect.width / 2 - W / 2, 8), vw - W - 8) : 0;
  const below = rect ? rect.top < vh / 2 : true;

  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-label={`How to get the ${steps.title}`}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setRect(rect ? null : ref.current!.getBoundingClientRect()); }}
        style={{ border: 0, background: "none", padding: 2, cursor: "pointer", color: rect ? "var(--brand)" : "var(--muted)", display: "inline-flex", alignItems: "center", verticalAlign: "middle", flexShrink: 0 }}
      >
        <Info size={size} strokeWidth={1.75} />
      </button>
      {rect && typeof document !== "undefined" && createPortal(
        <div
          ref={card}
          role="dialog"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed", zIndex: 3000, left, width: W,
            ...(below ? { top: rect.bottom + 8 } : { bottom: vh - rect.top + 8 }),
            background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12,
            boxShadow: "0 12px 32px rgba(16,24,40,.14)", padding: "14px 16px", textAlign: "left",
            fontSize: "var(--fs-14)", lineHeight: 1.45, color: "var(--text)",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <div style={{ flex: 1, fontWeight: 700, fontSize: 16 }}>How to get the {steps.title}</div>
            <button type="button" aria-label="Close" onClick={() => setRect(null)} style={{ border: 0, background: "none", padding: 0, cursor: "pointer", color: "var(--muted)" }}>
              <X size={16} strokeWidth={1.75} />
            </button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 2, marginTop: 6, color: "var(--muted)", fontSize: "var(--fs-13)" }}>
            {steps.where.map((w, i) => (
              <React.Fragment key={i}>
                {i > 0 && <ChevronRight size={14} strokeWidth={1.75} />}
                <span style={{ fontWeight: i === steps.where.length - 1 ? 700 : 500, color: i === steps.where.length - 1 ? "var(--text)" : undefined }}>{w}</span>
              </React.Fragment>
            ))}
          </div>
          <ol style={{ margin: "10px 0 0", paddingLeft: 20, display: "grid", gap: 6 }}>
            {steps.steps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
          {steps.path && <div style={{ marginTop: 10 }}><FilePath label={steps.path.label} path={steps.path.value} /></div>}
          {steps.note && <div style={{ marginTop: 10, color: "var(--muted)", fontSize: "var(--fs-13)" }}>{steps.note}</div>}
          <a href={steps.importAt.href} className="text-link" style={{ display: "inline-flex", alignItems: "center", gap: 2, marginTop: 10, fontWeight: 600 }}>
            Import on {steps.importAt.label}<ChevronRight size={16} strokeWidth={1.75} />
          </a>
        </div>,
        document.body,
      )}
    </>
  );
}

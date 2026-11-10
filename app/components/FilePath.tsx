"use client";

// A FOLDER OR FILE PATH, shown the one way (owner, 11/2026: "file paths should
// have a format too"). Never type a path into a sentence or bold it: render it
// here — the path in navy mono on a quiet chip, `{year}`-style placeholders
// filled in, any part still to choose (`<NN Month YYYY>`) in italics, and a
// Copy button so it can be pasted straight into Explorer's address bar.

import { useState } from "react";
import { Check, Copy, Folder } from "lucide-react";

/** Fill `{year}` with the given year (default this year). */
export function fillPath(path: string, year = new Date().getFullYear()): string {
  return path.replace(/\{year\}/g, String(year));
}

export function FilePath({ path, year, label }: { path: string; year?: number; label?: string }) {
  const full = fillPath(path, year);
  const [copied, setCopied] = useState(false);
  const sep = full.includes("/") && !full.includes("\\") ? "/" : "\\";
  const parts = full.split(/[\\/]/).filter(Boolean);
  const copy = async () => {
    try { await navigator.clipboard.writeText(full); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };
  return (
    <span style={{ display: "grid", gap: 4 }}>
      {label && <span style={{ color: "var(--muted)", fontSize: "var(--fs-13)", fontWeight: 600 }}>{label}</span>}
      <span style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--canvas, var(--bg))" }}>
        <Folder size={16} strokeWidth={1.75} style={{ flexShrink: 0, marginTop: 2, color: "var(--muted)" }} aria-hidden />
        <code style={{ flex: 1, minWidth: 0, fontSize: "var(--fs-13)", lineHeight: 1.5, wordBreak: "break-word", background: "none", padding: 0, border: 0, borderRadius: 0 }}>
          {parts.map((p, i) => (
            <span key={i}>
              {i > 0 && <span style={{ color: "var(--muted)" }}>{sep}</span>}
              {/^<.*>$/.test(p) ? <i style={{ color: "var(--muted)" }}>{p}</i> : p}
            </span>
          ))}
        </code>
        <button type="button" onClick={copy} aria-label="Copy path"
          style={{ border: 0, background: "none", padding: 0, cursor: "pointer", flexShrink: 0, color: copied ? "var(--c-067647)" : "var(--muted)", display: "inline-flex", marginTop: 2 }}>
          {copied ? <Check size={16} strokeWidth={1.75} /> : <Copy size={16} strokeWidth={1.75} />}
        </button>
      </span>
    </span>
  );
}

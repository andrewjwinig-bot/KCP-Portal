"use client";

import type React from "react";
import { useEffect, useRef, useState } from "react";
import { centerImageSrc } from "../../../lib/centers/registry";

// Editable hero photo, shown as a banner at the top of a shopping-center
// property's info page. This is the ONE place the hero is managed — hover to
// replace (or drop/click an image). Uploads privately and serves through the
// /api/center-image proxy; the URL is merged into the center override (a fresh
// read-modify-write so it never clobbers the site plan / vacancy edits).

export default function CenterHeroBanner({ code, fallbackHero }: { code: string; fallbackHero?: string }) {
  const [hero, setHero] = useState<string | undefined>(fallbackHero);
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/centers/${code}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg) => { if (alive) { const h = cfg?.override?.assets?.hero ?? fallbackHero; if (h) setHero(h); } })
      .catch(() => { /* keep fallback */ });
    return () => { alive = false; };
  }, [code, fallbackHero]);

  async function replace(file: File | null) {
    if (!file || !file.type.startsWith("image/") || busy) return;
    setBusy(true); setPct(0.1); setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("key", "hero");
      const up = await fetch(`/api/centers/${code}/upload-direct`, { method: "POST", body: fd });
      const uj = await up.json().catch(() => null);
      if (!up.ok) throw new Error(uj?.error || `Upload failed (HTTP ${up.status})`);
      setPct(0.6);
      // Re-read the override and merge only the hero, preserving everything else.
      const cfg = await fetch(`/api/centers/${code}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      const ov = cfg?.override ?? {};
      const res = await fetch(`/api/centers/${code}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          assets: { ...(ov.assets ?? {}), hero: uj.url },
          availabilities: ov.availabilities ?? [],
          availDesc: ov.availDesc ?? {},
          dba: ov.dba ?? {},
        }),
      });
      if (!res.ok) throw new Error("Saved the image but couldn't update the page.");
      setHero(uj.url); setPct(1);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false); setPct(0);
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    replace(e.dataTransfer?.files?.[0] ?? null);
  };

  const src = centerImageSrc(hero);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={src ? "Replace hero photo" : "Add hero photo"}
      title="Click or drop an image to replace the hero photo"
      onClick={() => { if (!busy) fileRef.current?.click(); }}
      onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !busy) { e.preventDefault(); fileRef.current?.click(); } }}
      onDragOver={(e) => { e.preventDefault(); if (!busy) setDragOver(true); }}
      onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
      onDrop={onDrop}
      style={{
        position: "relative", width: "100%", aspectRatio: "24 / 7", maxHeight: 300,
        borderRadius: 14, overflow: "hidden", cursor: busy ? "default" : "pointer",
        border: `1px ${src ? "solid" : "dashed"} ${dragOver ? "var(--brand)" : "var(--border)"}`,
        background: "var(--panel, #f4f6f8)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      {src && <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
      {!src && !busy && (
        <span style={{ fontSize: 12, color: "var(--muted)" }}>
          {dragOver ? "Drop to upload hero photo" : "Add a hero photo — click or drop an image"}
        </span>
      )}

      {/* Hover / drag affordance over an existing image */}
      {src && !busy && (
        <div
          className="hero-hover"
          style={{
            position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
            background: dragOver ? "rgba(11,74,125,0.35)" : "rgba(15,23,42,0)", opacity: dragOver ? 1 : 0,
            transition: "opacity .15s, background .15s", color: "#fff", fontSize: 13, fontWeight: 700,
          }}
          onMouseEnter={(e) => { if (!dragOver) (e.currentTarget as HTMLElement).style.opacity = "1"; (e.currentTarget as HTMLElement).style.background = "rgba(15,23,42,0.35)"; }}
          onMouseLeave={(e) => { if (!dragOver) { (e.currentTarget as HTMLElement).style.opacity = "0"; (e.currentTarget as HTMLElement).style.background = "rgba(15,23,42,0)"; } }}
        >
          <span style={{ padding: "6px 12px", borderRadius: 999, background: "rgba(15,23,42,0.7)" }}>Replace photo</span>
        </div>
      )}

      {busy && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(15,23,42,0.5)", color: "#fff", display: "grid", placeItems: "center", fontSize: 13, fontWeight: 700 }}>
          Uploading… {Math.round(pct * 100)}%
        </div>
      )}
      {err && (
        <div style={{ position: "absolute", left: 12, bottom: 12, fontSize: 12, fontWeight: 700, color: "#fff", background: "rgba(185,28,28,0.9)", padding: "4px 8px", borderRadius: 6 }}>{err}</div>
      )}

      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
        onChange={(e) => { replace(e.target.files?.[0] ?? null); e.target.value = ""; }} />
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { SectionLabel } from "@/app/properties/PropertyDetail";
import type { SuiteAttachment } from "@/lib/suites/information";
import { blobSrc } from "@/lib/blobProxy";

// Standalone Floorplan card — sits in the top row of the unit page next
// to Lease Term and the shared-drive folder. Reads the floorplan field
// from /api/suites/{unitRef}/information and uses the same POST/DELETE
// (kind=floorplan) plumbing that SuiteInformationCard does for the rest
// of the suite-spec data.

export default function FloorplanCard({ unitRef }: { unitRef: string }) {
  const [floorplan, setFloorplan] = useState<SuiteAttachment | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const api = `/api/suites/${encodeURIComponent(unitRef)}/information`;

  useEffect(() => {
    let alive = true;
    fetch(api)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive && j?.info) setFloorplan(j.info.floorplan ?? null); })
      .catch(() => { /* ignore */ })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [api]);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    // Catch oversized files before they hit (and get silently dropped by) the
    // platform's ~4.5 MB request cap, which returns an empty body.
    const MAX_MB = 4;
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`That file is ${(file.size / 1024 / 1024).toFixed(1)} MB — please upload a floorplan under ${MAX_MB} MB (compress the image, or export the PDF at a lower resolution).`);
      setBusy(false);
      return;
    }
    try {
      const fd = new FormData();
      fd.append("kind", "floorplan");
      fd.append("file", file);
      const res = await fetch(api, { method: "POST", body: fd });
      const text = await res.text();
      let j: { info?: { floorplan?: SuiteAttachment | null }; error?: string } | null = null;
      try { j = text ? JSON.parse(text) : null; } catch { /* non-JSON / empty body */ }
      if (!res.ok || !j) {
        throw new Error(j?.error ?? (res.status === 413 ? `File too large — keep it under ${MAX_MB} MB.` : `Upload failed (${res.status || "no response"}).`));
      }
      setFloorplan(j.info?.floorplan ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${api}?kind=floorplan`, { method: "DELETE" });
      const text = await res.text();
      let j: { info?: { floorplan?: SuiteAttachment | null }; error?: string } | null = null;
      try { j = text ? JSON.parse(text) : null; } catch { /* non-JSON / empty body */ }
      if (!res.ok || !j) throw new Error(j?.error ?? `Delete failed (${res.status || "no response"}).`);
      setFloorplan(j.info?.floorplan ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <SectionLabel>Floorplan</SectionLabel>

      {error && (
        <div style={{
          margin: "0 0 8px", padding: "8px 10px", borderRadius: 8,
          background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.3)",
          color: "#b91c1c", fontSize: 12, fontWeight: 600,
        }}>{error}</div>
      )}

      {loading ? (
        <div style={{ fontSize: 13, color: "var(--muted)" }}>Loading…</div>
      ) : floorplan ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {floorplan.contentType.startsWith("image/") ? (
            <a href={blobSrc(floorplan.url)} target="_blank" rel="noreferrer">
              <img
                src={blobSrc(floorplan.url)}
                alt="Suite floorplan"
                style={{
                  width: "100%", maxHeight: 180, borderRadius: 10,
                  border: "1px solid var(--border)", display: "block",
                  objectFit: "contain", background: "rgba(15,23,42,0.02)",
                }}
              />
            </a>
          ) : (
            <a
              href={blobSrc(floorplan.url)}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 13, fontWeight: 600, color: "#0b4a7d" }}
            >
              {floorplan.name}
            </a>
          )}
          <div>
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="btn"
              style={{ fontSize: 12, padding: "5px 12px", fontWeight: 600 }}
            >
              {busy ? "Removing…" : "Remove floorplan"}
            </button>
          </div>
        </div>
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const f = e.dataTransfer.files?.[0];
            if (f) void upload(f);
          }}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "20px 16px", cursor: busy ? "default" : "pointer",
            border: `1.5px dashed ${drag ? "#2563eb" : "var(--border)"}`,
            borderRadius: 10,
            background: drag ? "rgba(37,99,235,0.05)" : "rgba(15,23,42,0.015)",
            fontSize: 13, color: "var(--muted)", textAlign: "center",
            minHeight: 120,
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*,application/pdf"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = "";
            }}
          />
          {busy ? "Uploading…" : (
            <span>⭳ Floorplan — drop a file here or{" "}
              <span style={{ color: "#2563eb", fontWeight: 600, textDecoration: "underline" }}>browse</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

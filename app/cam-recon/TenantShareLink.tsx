"use client";

// Admin control on a tenant's CAM statement: mint / copy / revoke the signed,
// private link that opens that tenant's public CAM statement (with shareable
// backup + escrow). Retail today; office to follow.

import { useCallback, useEffect, useState } from "react";

const BRAND = "#0b4a7d";

type Link = { id: string; url: string; createdAt: string; createdBy?: string; viewCount: number; lastViewedAt?: string | null; expiresAt?: string | null };

export function TenantShareLink({ property, unitRef, year, kind, tenantName }: {
  property: string; unitRef: string; year: number; kind: "retail" | "office"; tenantName: string;
}) {
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState<Link[]>([]);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    fetch(`/api/cam-recon/tenant-link?unitRef=${encodeURIComponent(unitRef)}&year=${year}`)
      .then((r) => (r.ok ? r.json() : { links: [] }))
      .then((j) => setLinks(Array.isArray(j.links) ? j.links : []))
      .catch(() => setLinks([]));
  }, [unitRef, year]);
  useEffect(() => { if (open) refresh(); }, [open, refresh]);

  async function create() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/cam-recon/tenant-link", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ property, unitRef, year, kind, tenantName }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Could not create link");
      refresh();
      copy(j.url);
    } catch (e: any) { setError(e?.message ?? "Could not create link"); }
    finally { setBusy(false); }
  }
  async function revoke(id: string) {
    if (!confirm("Revoke this link? The tenant will no longer be able to open it.")) return;
    setBusy(true);
    try { await fetch(`/api/cam-recon/tenant-link?id=${id}`, { method: "DELETE" }); refresh(); }
    finally { setBusy(false); }
  }
  function copy(url: string) {
    navigator.clipboard?.writeText(url).then(() => { setCopied(url); setTimeout(() => setCopied(null), 2000); }).catch(() => {});
  }

  return (
    <div style={{ display: "inline-block", position: "relative" }}>
      <button onClick={() => setOpen((o) => !o)} className="btn" style={{ fontSize: 13, padding: "8px 14px", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" /></svg>
        Share with tenant
      </button>
      {open && (
        <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 50, width: 420, maxWidth: "90vw", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "0 16px 40px rgba(15,23,42,0.22)", padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: BRAND }}>Tenant statement link</div>
          <p className="muted small" style={{ marginTop: 4, marginBottom: 10 }}>
            A private, revocable link to <b>{tenantName}</b>&rsquo;s {year} CAM statement — with the backup you&rsquo;ve flagged for the package and their escrow detail.
          </p>
          {links.length === 0 ? (
            <div className="muted small" style={{ marginBottom: 10 }}>No active link yet.</div>
          ) : links.map((l) => (
            <div key={l.id} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "9px 10px", marginBottom: 8, background: "rgba(15,23,42,0.02)" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input readOnly value={l.url} onFocus={(e) => e.currentTarget.select()} style={{ flex: 1, minWidth: 0, fontSize: 12, padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--card)", color: "var(--text)", fontFamily: "inherit" }} />
                <button onClick={() => copy(l.url)} className="btn" style={{ fontSize: 12, fontWeight: 700, padding: "6px 10px", flexShrink: 0 }}>{copied === l.url ? "Copied ✓" : "Copy"}</button>
              </div>
              <div className="muted" style={{ fontSize: 11, marginTop: 5, display: "flex", justifyContent: "space-between" }}>
                <span>{l.viewCount ? `${l.viewCount} view${l.viewCount === 1 ? "" : "s"}${l.lastViewedAt ? ` · last ${new Date(l.lastViewedAt).toLocaleDateString("en-US")}` : ""}` : "Not opened yet"}</span>
                <button onClick={() => revoke(l.id)} disabled={busy} style={{ background: "none", border: "none", color: "#b91c1c", fontSize: 11, fontWeight: 700, cursor: "pointer", padding: 0 }}>Revoke</button>
              </div>
            </div>
          ))}
          <button onClick={create} disabled={busy} className="btn primary" style={{ fontSize: 13, fontWeight: 700, width: "100%" }}>
            {busy ? "Working…" : links.length ? "Create another link" : "Create link"}
          </button>
          {error && <div className="small" style={{ color: "#b91c1c", fontWeight: 700, marginTop: 8 }}>{error}</div>}
        </div>
      )}
    </div>
  );
}

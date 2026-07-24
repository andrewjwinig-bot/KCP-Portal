"use client";

// Admin control on a tenant's CAM statement: mint / copy / revoke the signed,
// private link that opens that tenant's public CAM statement (with shareable
// backup + escrow). Retail today; office to follow.

import { useCallback, useEffect, useState } from "react";

const BRAND = "#0b4a7d";

type Link = { id: string; url: string; createdAt: string; createdBy?: string; viewCount: number; lastViewedAt?: string | null; expiresAt?: string | null; pin?: string | null };

export function TenantShareLink({ property, unitRef, year, kind, tenantName }: {
  property: string; unitRef: string; year: number; kind: "retail" | "office"; tenantName: string;
}) {
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState<Link[]>([]);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Email-to-tenant flow: which link is pending confirmation, and the last
  // send result. Kept deliberately distinct from copy so a send is never
  // accidental.
  const [confirmSend, setConfirmSend] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string[] | null>(null);
  // New links get an access PIN by default (staff can opt out before creating).
  const [requirePin, setRequirePin] = useState(true);

  const refresh = useCallback(() => {
    fetch(`/api/cam-recon/tenant-link?unitRef=${encodeURIComponent(unitRef)}&year=${year}`)
      .then((r) => (r.ok ? r.json() : { links: [], recipients: [] }))
      .then((j) => { setLinks(Array.isArray(j.links) ? j.links : []); setRecipients(Array.isArray(j.recipients) ? j.recipients : []); })
      .catch(() => { setLinks([]); setRecipients([]); });
  }, [unitRef, year]);
  useEffect(() => { if (open) refresh(); }, [open, refresh]);

  async function sendToTenant(id: string) {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/cam-recon/tenant-link/send", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, tenantName }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Could not send");
      setSentTo(Array.isArray(j.recipients) ? j.recipients : []);
      setConfirmSend(null);
    } catch (e: any) { setError(e?.message ?? "Could not send"); }
    finally { setBusy(false); }
  }

  async function create() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/cam-recon/tenant-link", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ property, unitRef, year, kind, tenantName, requirePin }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Could not create link");
      refresh();
      copy(j.url);
    } catch (e: any) { setError(e?.message ?? "Could not create link"); }
    finally { setBusy(false); }
  }
  async function managePin(id: string, action: "reset" | "remove") {
    if (action === "remove" && !confirm("Remove the PIN? Anyone with the link will be able to open it without a code.")) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/cam-recon/tenant-link", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error ?? "Could not update PIN"); }
      refresh();
    } catch (e: any) { setError(e?.message ?? "Could not update PIN"); }
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
            A private, revocable link for <b>{tenantName}</b>. When a link has an <b>access PIN</b>, share the PIN with the tenant (ideally separately) — they enter it to open the portal.
          </p>
          {links.length === 0 ? (
            <div className="muted small" style={{ marginBottom: 10 }}>No active link yet.</div>
          ) : links.map((l) => (
            <div key={l.id} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "9px 10px", marginBottom: 8, background: "rgba(15,23,42,0.02)" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input readOnly value={l.url} onFocus={(e) => e.currentTarget.select()} style={{ flex: 1, minWidth: 0, fontSize: 12, padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--card)", color: "var(--text)", fontFamily: "inherit" }} />
                <button onClick={() => copy(l.url)} className="btn" style={{ fontSize: 12, fontWeight: 700, padding: "6px 10px", flexShrink: 0 }}>{copied === l.url ? "Copied ✓" : "Copy"}</button>
              </div>
              {l.pin ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 7, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Access PIN</span>
                  <code style={{ fontSize: 15, fontWeight: 800, letterSpacing: "0.16em", color: BRAND, background: "rgba(11,74,125,0.08)", borderRadius: 6, padding: "3px 10px" }}>{l.pin}</code>
                  <button onClick={() => copy(l.pin!)} className="btn" style={{ fontSize: 11, fontWeight: 700, padding: "4px 8px" }}>{copied === l.pin ? "Copied ✓" : "Copy"}</button>
                  <div style={{ marginLeft: "auto", display: "flex", gap: 12 }}>
                    <button onClick={() => managePin(l.id, "reset")} disabled={busy} style={{ background: "none", border: "none", padding: 0, fontSize: 11, fontWeight: 700, cursor: "pointer", color: "var(--muted)" }}>Reset</button>
                    <button onClick={() => managePin(l.id, "remove")} disabled={busy} style={{ background: "none", border: "none", padding: 0, fontSize: 11, fontWeight: 700, cursor: "pointer", color: "#b91c1c" }}>Remove</button>
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 7 }}>
                  <button onClick={() => managePin(l.id, "reset")} disabled={busy} style={{ background: "none", border: "none", padding: 0, fontSize: 11, fontWeight: 700, cursor: "pointer", color: BRAND }}>+ Add an access PIN</button>
                </div>
              )}
              <div className="muted" style={{ fontSize: 11, marginTop: 7, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span>{l.viewCount ? `${l.viewCount} view${l.viewCount === 1 ? "" : "s"}${l.lastViewedAt ? ` · last ${new Date(l.lastViewedAt).toLocaleDateString("en-US")}` : ""}` : "Not opened yet"}</span>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <button onClick={() => { setConfirmSend(l.id); setSentTo(null); setError(null); }} disabled={busy} style={{ background: "none", border: "none", color: BRAND, fontSize: 11, fontWeight: 700, cursor: "pointer", padding: 0, display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 5L2 7" /></svg>
                    Email to tenant
                  </button>
                  <button onClick={() => revoke(l.id)} disabled={busy} style={{ background: "none", border: "none", color: "#b91c1c", fontSize: 11, fontWeight: 700, cursor: "pointer", padding: 0 }}>Revoke</button>
                </div>
              </div>
              {sentTo && confirmSend === null && (
                <div style={{ marginTop: 8, fontSize: 11.5, fontWeight: 700, color: "#15803d" }}>
                  ✓ Emailed to {sentTo.join(", ")}
                </div>
              )}
              {confirmSend === l.id && (
                <div style={{ marginTop: 8, border: "1px solid rgba(180,83,9,0.35)", background: "rgba(180,83,9,0.07)", borderRadius: 8, padding: "10px 11px" }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#b45309", display: "flex", alignItems: "center", gap: 6 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                    This emails the tenant
                  </div>
                  {recipients.length > 0 ? (
                    <p className="small" style={{ margin: "6px 0 10px", color: "var(--text)" }}>
                      The private link will be sent to: <b>{recipients.join(", ")}</b>. This is the tenant&rsquo;s copy — only send when you&rsquo;re ready for them to have it.
                    </p>
                  ) : (
                    <p className="small" style={{ margin: "6px 0 10px", color: "#b91c1c" }}>
                      No contact with an email is on file for this suite. Add a recipient in Contacts first.
                    </p>
                  )}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => sendToTenant(l.id)} disabled={busy || recipients.length === 0} className="btn primary" style={{ fontSize: 12, fontWeight: 700, padding: "6px 12px", opacity: busy || recipients.length === 0 ? 0.6 : 1 }}>{busy ? "Sending…" : "Send to tenant"}</button>
                    <button onClick={() => setConfirmSend(null)} className="btn" style={{ fontSize: 12, fontWeight: 700, padding: "6px 12px" }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {links.length === 0 && (
            <>
              <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, marginBottom: 8, cursor: "pointer", color: "var(--text)" }}>
                <input type="checkbox" checked={requirePin} onChange={(e) => setRequirePin(e.target.checked)} />
                Protect this link with an access PIN
              </label>
              <button onClick={create} disabled={busy} className="btn primary" style={{ fontSize: 13, fontWeight: 700, width: "100%" }}>
                {busy ? "Working…" : "Create link"}
              </button>
            </>
          )}
          {error && <div className="small" style={{ color: "#b91c1c", fontWeight: 700, marginTop: 8 }}>{error}</div>}
        </div>
      )}
    </div>
  );
}

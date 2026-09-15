"use client";

// Admin control on a tenant's CAM statement: mint / copy / revoke the signed,
// private link that opens that tenant's public CAM statement (with shareable
// backup + escrow). Retail today; office to follow.
//
// The card itself is ShareLinkCard, shared with the K-1 roster — sharing a
// document should look and behave the same wherever you do it. This file keeps
// only the tenant-specific actions.

import { useCallback, useEffect, useState } from "react";
import { ShareLinkCard } from "@/app/components/ShareLinkCard";

const BRAND = "#0b4a7d";

type Link = { id: string; url: string; createdAt: string; createdBy?: string; viewCount: number; lastViewedAt?: string | null; expiresAt?: string | null; pin?: string | null };

export function TenantShareLink({ property, unitRef, year, kind, tenantName }: {
  property: string; unitRef: string; year: number; kind: "retail" | "office"; tenantName: string;
}) {
  const [links, setLinks] = useState<Link[]>([]);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string[] | null>(null);

  const refresh = useCallback(() => {
    fetch(`/api/cam-recon/tenant-link?unitRef=${encodeURIComponent(unitRef)}&year=${year}`)
      .then((r) => (r.ok ? r.json() : { links: [], recipients: [] }))
      .then((j) => { setLinks(Array.isArray(j.links) ? j.links : []); setRecipients(Array.isArray(j.recipients) ? j.recipients : []); })
      .catch(() => { setLinks([]); setRecipients([]); });
  }, [unitRef, year]);

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
    } catch (e: any) { setError(e?.message ?? "Could not send"); }
    finally { setBusy(false); }
  }

  async function create(requirePin: boolean) {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/cam-recon/tenant-link", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ property, unitRef, year, kind, tenantName, requirePin }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Could not create link");
      refresh();
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

  return (
    <ShareLinkCard
      buttonLabel="Share with tenant"
      title="Tenant statement link"
      subject={tenantName}
      description="A private, revocable link to their statements and account."
      emptyNote="Create the link to give them access. You can copy it and send it yourself, or email it from here."
      links={links}
      busy={busy}
      error={error}
      recipients={recipients}
      sendLabel="Email to tenant"
      sentTo={sentTo}
      onOpen={refresh}
      onCreate={create}
      onSend={sendToTenant}
      onRevoke={revoke}
      onManagePin={managePin}
    />
  );
}

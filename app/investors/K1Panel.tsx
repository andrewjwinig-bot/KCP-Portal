"use client";

// K-1 distribution for ONE partnership, rendered inside that property's card on
// Investor Info. The batch arrives per property for all its investors, so this
// sits where the roster already is rather than on a page of its own.
//
// The roster IS the workflow: one row per owner, drop that owner's PDF on their
// row. Choosing the row is the assignment — nothing reads the filename — which
// is what makes it safe on a roster where six of Parkwood's 21 owners share a
// name with another owner.
//
// Gated by canManageK1 at the call site — NOT canEditOwnership, which includes
// a family member who is herself an owner. The API enforces the same rule
// server-side, so the gate here is about not showing a control, not about
// keeping data safe.

import { useCallback, useEffect, useState } from "react";
import { Pill, StatPill, TONE_AMBER, TONE_GREEN, TONE_NEUTRAL } from "@/app/components/Pill";
import { HoverCard } from "@/app/components/HoverCard";
import type { K1Document } from "@/lib/investors/k1";

const BRAND = "#0b4a7d";
const TEAL = "#0f766e";
const SECTION_LABEL: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)",
};
const th: React.CSSProperties = {
  textAlign: "left", padding: "6px 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase",
  letterSpacing: "0.04em", color: "var(--muted)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap",
};
const td: React.CSSProperties = { textAlign: "left", padding: "9px 10px", fontSize: 14 };

type OwnerRow = {
  id: string; name: string; detailedName: string | null; vendorCode: string | null;
  ownerPct: number | null; sharesName: boolean;
  link: { id: string; createdAt: string; viewCount: number; lastViewedAt: string | null } | null;
};
type Payload = { ok: true; years: number[]; owners: OwnerRow[]; documents: K1Document[]; blockers: string[] };

const kb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** One owner's K-1 cell: the file they have, or the target you drop it on. */
function K1Cell({ owner, doc, busy, onUpload, onDelete }: {
  owner: OwnerRow; doc: K1Document | undefined; busy: boolean;
  onUpload: (owner: OwnerRow, file: File) => void; onDelete: (doc: K1Document) => void;
}) {
  const [dragOver, setDragOver] = useState(false);

  if (doc) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <Pill tone={doc.published ? TONE_GREEN : TONE_AMBER}>{doc.published ? "PUBLISHED" : "READY"}</Pill>
        <HoverCard title={doc.filename} width={300}
          rows={[
            { label: "For", value: owner.detailedName ?? `${owner.name} · held personally` },
            { label: "Size", value: kb(doc.size) },
            { label: "Uploaded", value: `${shortDate(doc.uploadedAt)}${doc.uploadedBy ? ` · ${doc.uploadedBy}` : ""}` },
          ]}
          footer={{ label: doc.published ? "Opened" : "Status", value: doc.published ? (doc.viewCount ? `${doc.viewCount}×` : "Not yet") : "Not published" }}>
          <a href={`/api/investor-k1/file?id=${doc.id}`} target="_blank" rel="noopener noreferrer"
            style={{ display: "block", minWidth: 0, color: BRAND, textDecoration: "none", fontWeight: 600, fontSize: 12.5 }}>
            <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 190 }}>{doc.filename}</div>
            <div className="muted" style={{ fontSize: 11 }}>{kb(doc.size)} · {shortDate(doc.uploadedAt)}</div>
          </a>
        </HoverCard>
        <button onClick={() => onDelete(doc)} disabled={busy} title="Remove this K-1"
          style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", padding: 2, flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
        </button>
      </div>
    );
  }

  return (
    <label
      onDragOver={(e) => { e.preventDefault(); if (!busy) setDragOver(true); }}
      onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
      onDrop={(e) => {
        e.preventDefault(); setDragOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f && !busy) onUpload(owner, f);
      }}
      title={`Drop ${owner.name}'s ${owner.detailedName ? `“${owner.detailedName}” ` : ""}K-1 here`}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, cursor: busy ? "default" : "pointer",
        border: `1.5px dashed ${dragOver ? TEAL : "var(--border)"}`, borderRadius: 8, padding: "5px 10px",
        background: dragOver ? "rgba(15,118,110,0.09)" : "transparent",
        color: dragOver ? TEAL : "var(--muted)", fontSize: 12, fontWeight: 700,
        transition: "border-color .15s, background .15s, color .15s",
      }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
      Drop PDF
      <input type="file" accept="application/pdf,.pdf" disabled={busy} style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onUpload(owner, f); }} />
    </label>
  );
}

export function K1Panel({ propertyCode }: { propertyCode: string }) {
  const [year, setYear] = useState(new Date().getFullYear() - 1);
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null); // ownerId in flight
  const [shared, setShared] = useState<{ ownerId: string; ownerName: string; url: string; pin: string; sentTo: string[]; mailError: string | null } | null>(null);

  const load = useCallback(async () => {
    try {
      const j = await fetch(`/api/investor-k1?property=${propertyCode}&year=${year}`, { cache: "no-store" }).then((r) => r.json());
      if (!j.ok) throw new Error(j.error ?? "Could not load.");
      setData(j);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load."); }
  }, [propertyCode, year]);
  useEffect(() => { void load(); }, [load]);

  async function upload(owner: OwnerRow, file: File) {
    setBusy(true); setUploading(owner.id); setError(null);
    try {
      const fd = new FormData();
      fd.append("property", propertyCode);
      fd.append("year", String(year));
      fd.append("ownerId", owner.id);
      fd.append("file", file);
      const res = await fetch("/api/investor-k1", { method: "POST", body: fd });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? `Upload failed (HTTP ${res.status})`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed."); }
    finally { setBusy(false); setUploading(null); }
  }

  async function remove(doc: K1Document) {
    if (!confirm(`Remove ${doc.ownerName}'s ${doc.taxYear} K-1 (${doc.filename})? The file is deleted permanently.`)) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/investor-k1?id=${doc.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Could not delete.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not delete."); } finally { setBusy(false); }
  }

  async function setPublished(publish: boolean) {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/investor-k1", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: publish ? "publish" : "unpublish", property: propertyCode, year }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Could not update.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update."); } finally { setBusy(false); }
  }

  async function share(owner: OwnerRow, send: boolean) {
    setBusy(true); setError(null); setShared(null);
    try {
      const res = await fetch("/api/investor-k1/share", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyCode, ownerId: owner.id, send }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Could not create the link.");
      setShared({ ownerId: owner.id, ownerName: owner.name, url: j.url, pin: j.pin, sentTo: j.sentTo ?? [], mailError: j.mailError ?? null });
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create the link."); } finally { setBusy(false); }
  }

  const docs = data?.documents ?? [];
  const owners = data?.owners ?? [];
  const published = docs.length > 0 && docs.every((d) => d.published);
  const missing = owners.filter((o) => !docs.some((d) => d.ownerId === o.id)).length;

  return (
    <div style={{ borderTop: "1px solid var(--border)", background: "rgba(15,118,110,0.03)", padding: "16px 16px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ ...SECTION_LABEL, color: TEAL }}>Schedule K-1s</div>
          <div className="muted small" style={{ marginTop: 3 }}>
            Drop each investor&rsquo;s PDF on their row, then publish the year and share a private link.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ fontSize: 12.5, padding: "5px 9px" }}>
            {Array.from(new Set([...(data?.years ?? []), new Date().getFullYear() - 1, new Date().getFullYear() - 2]))
              .sort((a, b) => b - a).map((y) => <option key={y} value={y}>{y} tax year</option>)}
          </select>
          <Pill tone={published ? TONE_GREEN : TONE_NEUTRAL}>{published ? "SHAREABLE" : "NOT PUBLISHED"}</Pill>
          <button className={published ? "btn" : "btn primary"} disabled={busy || docs.length === 0}
            onClick={() => setPublished(!published)}
            style={{ fontSize: 12.5, padding: "5px 11px", fontWeight: 700 }}>
            {published ? "Unpublish" : "Publish"}
          </button>
        </div>
      </div>

      {error && <div style={{ marginTop: 10, color: "#b91c1c", fontSize: 12.5, fontWeight: 600 }}>{error}</div>}

      <div className="pills" style={{ flexWrap: "wrap", justifyContent: "flex-start", marginTop: 12 }}>
        <StatPill label="K-1s uploaded" value={`${docs.length}/${owners.length}`} sub={year + " tax year"} accent={owners.length && docs.length === owners.length ? "#15803d" : "#b45309"} />
        <StatPill label="Still to collect" value={missing} sub={missing === 1 ? "investor" : "investors"} accent={missing ? "#b45309" : undefined} />
        <StatPill label="Links shared" value={owners.filter((o) => o.link).length} sub={`${owners.filter((o) => (o.link?.viewCount ?? 0) > 0).length} opened`} />
      </div>

      {data && data.blockers.length > 0 && (
        <div style={{ marginTop: 10, borderRadius: 10, padding: "10px 13px", background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.3)", fontSize: 12.5, color: "#b91c1c", fontWeight: 600 }}>
          {data.blockers.map((b, i) => <div key={i} style={{ marginTop: i ? 4 : 0 }}>{b}</div>)}
        </div>
      )}

      <div style={{ marginTop: 14, border: "1px solid var(--border)", borderRadius: 10, overflowX: "auto", background: "var(--card)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 780 }}>
          <thead>
            <tr>
              <th style={th}>Investor</th><th style={th}>Held as</th>
              <th style={{ ...th, textAlign: "right" }}>Share</th>
              <th style={th}>{year} K-1</th>
              <th style={{ ...th, textAlign: "right" }}>Portal</th>
            </tr>
          </thead>
          <tbody>
            {owners.map((o) => {
              const doc = docs.find((d) => d.ownerId === o.id);
              return (
                <tr key={o.id} style={{ borderTop: "1px solid var(--border)", background: uploading === o.id ? "rgba(15,118,110,0.06)" : undefined }}>
                  <td style={td}>
                    <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                      {o.name}
                      {o.sharesName && (
                        <HoverCard title="Shared name" width={274}
                          rows={[{ label: "Held as", value: o.detailedName ?? "Held personally" }, { label: "Vendor code", value: o.vendorCode ?? "—" }]}
                          footer={{ label: "Before you drop", value: "Check Held as — this name appears twice" }}>
                          <Pill tone={TONE_AMBER}>SHARED NAME</Pill>
                        </HoverCard>
                      )}
                    </div>
                    {o.vendorCode && <div className="muted" style={{ fontSize: 11.5 }}><code style={{ fontSize: 11.5 }}>{o.vendorCode}</code></div>}
                  </td>
                  <td style={{ ...td, fontSize: 12.5, color: "var(--muted)", maxWidth: 230 }}>
                    {/* On a shared name this column IS the disambiguator, so it
                        never renders as a dash — say "held personally" outright. */}
                    {o.detailedName ?? (o.sharesName ? <em>Held personally</em> : "—")}
                  </td>
                  <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{o.ownerPct != null ? `${(o.ownerPct * 100).toFixed(4)}%` : "—"}</td>
                  <td style={td}>
                    {uploading === o.id
                      ? <span style={{ fontSize: 12, fontWeight: 700, color: TEAL }}>Uploading…</span>
                      : <K1Cell owner={o} doc={doc} busy={busy} onUpload={upload} onDelete={remove} />}
                  </td>
                  <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                    {o.link && (
                      <HoverCard title="Investor link" width={250}
                        rows={[
                          { label: "Shared", value: shortDate(o.link.createdAt) },
                          { label: "Opened", value: o.link.viewCount ? `${o.link.viewCount}×` : "Not yet" },
                        ]}
                        footer={{ label: "Last opened", value: o.link.lastViewedAt ? new Date(o.link.lastViewedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—" }}>
                        <Pill tone={o.link.viewCount ? TONE_GREEN : TONE_NEUTRAL}>{o.link.viewCount ? `OPENED ${o.link.viewCount}×` : "SHARED"}</Pill>
                      </HoverCard>
                    )}
                    <button className="btn" disabled={busy || !doc?.published} onClick={() => share(o, false)}
                      title={doc?.published ? "Create a private link + PIN" : doc ? "Publish the year first" : "Upload their K-1 first"}
                      style={{ fontSize: 12, padding: "4px 9px", marginLeft: 5 }}>{o.link ? "New link" : "Create link"}</button>
                    <button className="btn" disabled={busy || !doc?.published} onClick={() => share(o, true)} style={{ fontSize: 12, padding: "4px 9px", marginLeft: 5 }}>Email it</button>
                  </td>
                </tr>
              );
            })}
            {owners.length === 0 && (
              <tr><td style={{ ...td, color: "var(--muted)" }} colSpan={5}>No owners on file for this partnership.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {missing > 0 && docs.length > 0 && (
        <div className="muted" style={{ fontSize: 11.5, marginTop: 9 }}>
          Publishing releases every K-1 uploaded here at once — the {missing} investor{missing === 1 ? "" : "s"} still missing one simply {missing === 1 ? "has" : "have"} nothing to open.
        </div>
      )}

      {shared && (
        <div style={{ marginTop: 12, border: "1.5px solid rgba(11,74,125,0.4)", borderRadius: 10, background: "rgba(11,74,125,0.04)", padding: "13px 15px" }}>
          <div style={{ fontWeight: 800, fontSize: 14 }}>Link for {shared.ownerName}</div>
          <div className="muted small" style={{ marginTop: 3 }}>
            {shared.sentTo.length ? `Emailed to ${shared.sentTo.join(", ")}.` : "Not emailed — copy it below."}{" "}
            Send the PIN separately (a text or a call), never in the same email as the link.
          </div>
          <div style={{ display: "flex", gap: 9, marginTop: 11, flexWrap: "wrap", alignItems: "center" }}>
            <input readOnly value={shared.url} onFocus={(e) => e.currentTarget.select()}
              style={{ flex: "1 1 340px", fontSize: 12, padding: "6px 8px", fontFamily: "ui-monospace, monospace" }} />
            <button className="btn" onClick={() => navigator.clipboard?.writeText(shared.url)} style={{ fontSize: 12, padding: "5px 11px" }}>Copy link</button>
            <div style={{ padding: "5px 13px", borderRadius: 8, background: "var(--card)", border: "1px solid var(--border)" }}>
              <div style={SECTION_LABEL}>PIN</div>
              <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: "0.14em", fontFamily: "ui-monospace, monospace" }}>{shared.pin}</div>
            </div>
            <button className="btn" onClick={() => setShared(null)} style={{ fontSize: 12, padding: "5px 11px", marginLeft: "auto" }}>Done</button>
          </div>
          {shared.mailError && <div style={{ color: "#b45309", fontSize: 12, fontWeight: 600, marginTop: 9 }}>{shared.mailError}</div>}
        </div>
      )}
    </div>
  );
}

"use client";

// The K-1 pieces that render INSIDE a property's ownership table on Investor
// Info — a header band above it, and two cells per owner row.
//
// There is deliberately no second table. Owner, vendor code, held-as and share
// already sit in the ownership table; repeating them under a "Schedule K-1s"
// heading made one card carry the same roster twice. So the ownership table
// grows a K-1 column and a Portal column, and each interest's row is where you
// drop that interest's PDF. Choosing the row is still the assignment — nothing
// reads the filename — which is what makes it safe where six of Parkwood's 21
// owners share a name with another owner.
//
// Gated by canManageK1 at the call site — NOT canEditOwnership, which includes
// a family member who is herself an owner. The API enforces the same rule
// server-side, so the gate here is about not showing a control.

import { useState } from "react";
import { Pill, StatPill, TONE_AMBER, TONE_GREEN, TONE_NEUTRAL } from "@/app/components/Pill";
import { HoverCard } from "@/app/components/HoverCard";
import type { K1Document } from "@/lib/investors/k1";
import type { K1Owner, K1Slice, ShareBatch } from "./useK1";

const BRAND = "#0b4a7d";
const TEAL = "#0f766e";
const SECTION_LABEL: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)",
};

const kb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** The band above the ownership table: year, publish, counts, and the bulk send. */
export function K1Header({ k1 }: { k1: K1Slice }) {
  const selectable = k1.shareableIds;
  const chosen = [...k1.selected].filter((id) => selectable.includes(id));
  const allChosen = selectable.length > 0 && chosen.length === selectable.length;

  return (
    <div style={{ borderTop: "1px solid var(--border)", background: "rgba(15,118,110,0.04)", padding: "13px 16px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ ...SECTION_LABEL, color: TEAL }}>Schedule K-1s</div>
          <div className="muted small" style={{ marginTop: 3 }}>
            Drop each investor&rsquo;s PDF on their row below, publish the year, then send links.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <select value={k1.year} onChange={(e) => k1.setYear(Number(e.target.value))} style={{ fontSize: 12.5, padding: "5px 9px" }}>
            {k1.years.map((y) => <option key={y} value={y}>{y} tax year</option>)}
          </select>
          <Pill tone={k1.published ? TONE_GREEN : TONE_NEUTRAL}>{k1.published ? "SHAREABLE" : "NOT PUBLISHED"}</Pill>
          <button className={k1.published ? "btn" : "btn primary"} disabled={k1.busy || k1.uploadedCount === 0}
            onClick={() => k1.setPublished(!k1.published)}
            style={{ fontSize: 12.5, padding: "5px 11px", fontWeight: 700 }}>
            {k1.published ? "Unpublish" : "Publish"}
          </button>
        </div>
      </div>

      {k1.error && <div style={{ marginTop: 10, color: "#b91c1c", fontSize: 12.5, fontWeight: 600 }}>{k1.error}</div>}

      <div className="pills" style={{ flexWrap: "wrap", justifyContent: "flex-start", marginTop: 11 }}>
        <StatPill label="K-1s uploaded" value={`${k1.uploadedCount}/${k1.ownerCount}`} sub={`${k1.year} tax year`}
          accent={k1.ownerCount && k1.uploadedCount === k1.ownerCount ? "#15803d" : "#b45309"} />
        <StatPill label="Still to collect" value={k1.missingCount} sub={k1.missingCount === 1 ? "investor" : "investors"}
          accent={k1.missingCount ? "#b45309" : undefined} />
        <StatPill label="Links shared" value={k1.linkCount} sub={`${k1.openedCount} opened`} />
      </div>

      {k1.data && k1.data.blockers.length > 0 && (
        <div style={{ marginTop: 10, borderRadius: 10, padding: "10px 13px", background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.3)", fontSize: 12.5, color: "#b91c1c", fontWeight: 600 }}>
          {k1.data.blockers.map((b, i) => <div key={i} style={{ marginTop: i ? 4 : 0 }}>{b}</div>)}
        </div>
      )}

      {/* Bulk send. Only offered once something is publishable, because a link
          can't be minted for an owner whose K-1 isn't published. */}
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", marginTop: 12 }}>
        <button className="btn" disabled={k1.busy || selectable.length === 0}
          onClick={() => k1.setSelected(allChosen ? [] : selectable)}
          style={{ fontSize: 12, padding: "5px 10px", fontWeight: 700 }}>
          {allChosen ? "Clear selection" : `Select all ${selectable.length || ""}`.trim()}
        </button>
        <span className="muted small">
          {selectable.length === 0
            ? "Publish the year to enable sending."
            : chosen.length === 0
              ? `${selectable.length} investor${selectable.length === 1 ? "" : "s"} ready to send`
              : `${chosen.length} selected`}
        </span>
        <button className="btn primary" disabled={k1.busy || chosen.length === 0}
          onClick={() => {
            if (confirm(`Email a private K-1 link to ${chosen.length} investor${chosen.length === 1 ? "" : "s"}? Each gets their own link and their own PIN, and the PINs are shown here for you to send separately.`)) {
              k1.share(chosen, true);
            }
          }}
          style={{ fontSize: 12, padding: "5px 11px", fontWeight: 700, marginLeft: "auto" }}>
          Email {chosen.length || ""} selected
        </button>
        <button className="btn" disabled={k1.busy || chosen.length === 0} onClick={() => k1.share(chosen, false)}
          title="Create the links without emailing — you send them yourself"
          style={{ fontSize: 12, padding: "5px 10px" }}>
          Links only
        </button>
      </div>
    </div>
  );
}

/** The tick that adds an owner to the bulk send. */
export function K1SelectCell({ ownerId, k1 }: { ownerId: string; k1: K1Slice }) {
  const shareable = k1.shareableIds.includes(ownerId);
  const doc = k1.docFor(ownerId);
  return (
    <input
      type="checkbox"
      checked={k1.selected.has(ownerId)}
      disabled={!shareable || k1.busy}
      onChange={() => k1.toggleSelected(ownerId)}
      aria-label="Select for sending"
      title={shareable ? "Include in the send" : doc ? "Publish the year first" : "Upload their K-1 first"}
      style={{ cursor: shareable ? "pointer" : "not-allowed" }}
    />
  );
}

/** One owner's K-1 cell: the file they have, or the target you drop it on. */
export function K1Cell({ owner, k1 }: { owner: K1Owner; k1: K1Slice }) {
  const [dragOver, setDragOver] = useState(false);
  const doc = k1.docFor(owner.id);

  if (k1.uploading === owner.id) {
    return <span style={{ fontSize: 12, fontWeight: 700, color: TEAL }}>Uploading…</span>;
  }

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
            style={{ display: "block", minWidth: 0, color: BRAND, textDecoration: "none", fontWeight: 600, fontSize: 12 }}>
            <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 150 }}>{doc.filename}</div>
          </a>
        </HoverCard>
        <button onClick={() => k1.remove(doc)} disabled={k1.busy} title="Remove this K-1"
          style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", padding: 2, flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
        </button>
      </div>
    );
  }

  return (
    <label
      onDragOver={(e) => { e.preventDefault(); if (!k1.busy) setDragOver(true); }}
      onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
      onDrop={(e) => {
        e.preventDefault(); setDragOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f && !k1.busy) k1.upload(owner.id, f);
      }}
      title={`Drop ${owner.name}'s ${owner.detailedName ? `“${owner.detailedName}” ` : ""}K-1 here`}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, cursor: k1.busy ? "default" : "pointer",
        border: `1.5px dashed ${dragOver ? TEAL : "var(--border)"}`, borderRadius: 8, padding: "4px 9px",
        background: dragOver ? "rgba(15,118,110,0.09)" : "transparent",
        color: dragOver ? TEAL : "var(--muted)", fontSize: 11.5, fontWeight: 700,
        transition: "border-color .15s, background .15s, color .15s",
      }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
      Drop PDF
      <input type="file" accept="application/pdf,.pdf" disabled={k1.busy} style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) k1.upload(owner.id, f); }} />
    </label>
  );
}

/** One owner's portal cell: their live link's state, and a single re-send. */
export function K1PortalCell({ owner, k1 }: { owner: K1Owner; k1: K1Slice }) {
  const shareable = k1.shareableIds.includes(owner.id);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
      {owner.link ? (
        <HoverCard title="Investor link" width={250}
          rows={[
            { label: "Shared", value: shortDate(owner.link.createdAt) },
            { label: "Opened", value: owner.link.viewCount ? `${owner.link.viewCount}×` : "Not yet" },
          ]}
          footer={{ label: "Last opened", value: owner.link.lastViewedAt ? new Date(owner.link.lastViewedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—" }}>
          <Pill tone={owner.link.viewCount ? TONE_GREEN : TONE_NEUTRAL}>{owner.link.viewCount ? `OPENED ${owner.link.viewCount}×` : "SHARED"}</Pill>
        </HoverCard>
      ) : (
        <Pill tone={TONE_NEUTRAL}>NO LINK</Pill>
      )}
      <button className="btn" disabled={k1.busy || !shareable} onClick={() => k1.share([owner.id], true)}
        title={shareable ? `Email ${owner.name} their link` : "Publish their K-1 first"}
        style={{ fontSize: 11.5, padding: "3px 8px" }}>
        {owner.link ? "Re-send" : "Send"}
      </button>
    </span>
  );
}

/**
 * What a send produced — one row per investor, each with their OWN PIN.
 *
 * The PINs are shown here and never emailed: the link goes to the investor's
 * inbox, the PIN goes by a different channel, so a forwarded or intercepted
 * email is not enough on its own to open a K-1.
 */
export function K1ShareResults({ batch, onClose }: { batch: ShareBatch; onClose: () => void }) {
  const ok = batch.results.filter((r) => !r.error);
  const failed = batch.results.filter((r) => r.error);
  const unsent = ok.filter((r) => r.mailError);
  // Say what actually happened, not what was asked for: with mail unconfigured
  // "Links emailed · 3" over three "not emailed" rows is just wrong.
  const emailed = ok.filter((r) => r.sentTo.length).length;

  return (
    <div style={{ borderTop: "1px solid var(--border)", background: "rgba(11,74,125,0.04)", padding: "13px 16px 15px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ ...SECTION_LABEL, color: BRAND }}>
            {emailed > 0 ? `Links emailed · ${emailed}` : `Links created · ${ok.length}`}
            {emailed > 0 && emailed < ok.length ? ` · ${ok.length - emailed} not sent` : ""}
          </div>
          <div className="muted small" style={{ marginTop: 3, maxWidth: 640 }}>
            Every investor got their own link and their own PIN. <b>Send the PINs separately</b> — a text or a call —
            never in the same email as the link.
          </div>
        </div>
        <button className="btn" onClick={onClose} style={{ fontSize: 12, padding: "5px 11px" }}>Done</button>
      </div>

      {failed.length > 0 && (
        <div style={{ marginTop: 10, borderRadius: 9, padding: "9px 12px", background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.3)", fontSize: 12.5, color: "#b91c1c" }}>
          <b>{failed.length} could not be sent.</b> {failed.map((r) => r.error).join(" ")}
        </div>
      )}
      {unsent.length > 0 && (
        <div style={{ marginTop: 10, borderRadius: 9, padding: "9px 12px", background: "rgba(217,119,6,0.07)", border: "1px solid rgba(217,119,6,0.35)", fontSize: 12.5, color: "#7c3d06" }}>
          <b>{unsent.length} link{unsent.length === 1 ? "" : "s"} created but not emailed.</b>{" "}
          {[...new Set(unsent.map((r) => r.mailError))].join(" ")}
        </div>
      )}

      <div style={{ marginTop: 11, border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", background: "var(--card)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ color: "var(--muted)", fontSize: 11, letterSpacing: "0.04em", textAlign: "left" }}>
              <th style={{ padding: "8px 12px", fontWeight: 700 }}>INVESTOR</th>
              <th style={{ padding: "8px 12px", fontWeight: 700 }}>EMAILED TO</th>
              <th style={{ padding: "8px 12px", fontWeight: 700, width: 110 }}>PIN</th>
              <th style={{ padding: "8px 12px", fontWeight: 700, width: 90, textAlign: "right" }}>LINK</th>
            </tr>
          </thead>
          <tbody>
            {ok.map((r) => (
              <tr key={r.ownerId} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={{ padding: "8px 12px" }}>
                  <div style={{ fontWeight: 600 }}>{r.ownerName}</div>
                  <div className="muted" style={{ fontSize: 11.5 }}>{r.heldAs ?? "Held personally"}</div>
                </td>
                <td style={{ padding: "8px 12px", color: "var(--muted)", fontSize: 12.5 }}>
                  {r.sentTo.length ? r.sentTo.join(", ") : <em>not emailed</em>}
                </td>
                <td style={{ padding: "8px 12px", fontFamily: "ui-monospace, monospace", fontWeight: 800, letterSpacing: "0.12em" }}>{r.pin}</td>
                <td style={{ padding: "8px 12px", textAlign: "right" }}>
                  <button className="btn" onClick={() => r.url && navigator.clipboard?.writeText(r.url)}
                    style={{ fontSize: 11.5, padding: "3px 9px" }}>Copy</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button className="btn" style={{ fontSize: 11.5, padding: "4px 10px", marginTop: 9 }}
        onClick={() => navigator.clipboard?.writeText(
          ok.map((r) => `${r.ownerName}\t${r.heldAs ?? "Held personally"}\t${r.pin}`).join("\n"))}>
        Copy all PINs
      </button>
    </div>
  );
}

export type { K1Document };

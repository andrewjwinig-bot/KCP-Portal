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
import { Pill, StatPill, TONE_AMBER, TONE_GREEN, TONE_NEUTRAL, TONE_RED } from "@/app/components/Pill";
import { HoverCard } from "@/app/components/HoverCard";
import { DocChip } from "@/app/components/DocChip";
import { YearSelect } from "@/app/components/YearSelect";
import { ShareLinkCard, type EmailDraft, type SendOutcome, type SendOptions } from "@/app/components/ShareLinkCard";
import type { K1Document } from "@/lib/investors/k1";
import type { K1Interest, K1Owner, K1Slice, ShareBatch } from "./useK1";
import { sendState, sendStateTone } from "./sendState";
import { mailtoUrl } from "@/lib/investors/k1ShareEmail";

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
            Drop each investor&rsquo;s PDF on their row below, then send. Sending is what makes a
            K-1 visible — nothing is readable until you send it.
          </div>
        </div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <a href="/investor/preview" target="_blank" rel="noopener noreferrer" className="btn"
            title="See exactly what an investor sees — sample data, nothing sent"
            style={{ fontSize: 12, padding: "5px 10px", fontWeight: 700, textDecoration: "none" }}>
            Preview investor view
          </a>
          <YearSelect value={k1.year} years={k1.years} onChange={k1.setYear} small aria-label="Tax year" />
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
            ? "Upload a K-1 to enable sending."
            : chosen.length === 0
              ? `${selectable.length} investor${selectable.length === 1 ? "" : "s"} ready to send`
              : `${chosen.length} selected`}
          {k1.selectedWithoutEmail.length > 0 && (
            <span style={{ color: "#b91c1c", fontWeight: 700 }}> · {k1.selectedWithoutEmail.length} with no email</span>
          )}
        </span>
        <button className="btn primary" disabled={k1.busy || chosen.length === 0}
          onClick={() => {
            const missing = k1.selectedWithoutEmail;
            const warn = missing.length
              ? `\n\n${missing.length} of them have no email on file (${missing.slice(0, 3).join(", ")}${missing.length > 3 ? ", …" : ""}). Their links will be created but not sent.`
              : "";
            if (confirm(`Email a private K-1 link to ${chosen.length} investor${chosen.length === 1 ? "" : "s"}? This also makes their K-1 readable. Each gets their own link and their own PIN, in two separate emails — the PIN goes out automatically.${warn}`)) {
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


/**
 * Hand ONE draft to the user's own mail client.
 *
 * One per call, and each call comes from its own click. Opening both from a
 * single click does not work: the second `mailto:` fires outside the browser's
 * user-activation window and is silently blocked, so only the link email ever
 * appeared. The two messages stay disjoint whoever sends them, so two buttons
 * is also the honest shape — you are preparing two emails, not one.
 */
function openDraftInMail(msg: { subject: string; body: string }, to: string[], cc: string[]) {
  window.location.href = mailtoUrl(msg, to, cc);
}

/**
 * Every address a send reaches: the investor, then their additional
 * recipients. ONE definition, because this list has to be identical to the one
 * `/api/investor-k1/share` builds — a confirm that under-reports the
 * recipients is worse than no confirm at all.
 */
function recipientsOf(email: string | null, also: string[] | undefined): string[] {
  return [...new Set([email ?? "", ...(also ?? [])].map((e) => e.trim()).filter(Boolean))];
}

/**
 * The investor's additional recipients, shown beside their own address.
 *
 * Not decoration: an address on this list can open this investor's K-1, so it
 * has to be visible where you send from, not only in the contact card two
 * tabs away. Edited there — `alsoEmail` is deliberately one-row-at-a-time on
 * the contact card rather than a field you can widen in passing.
 */
function AlsoRecipients({ also }: { also: string[] | undefined }) {
  const list = (also ?? []).map((e) => e.trim()).filter(Boolean);
  if (list.length === 0) return null;
  return (
    <HoverCard
      title={`Also receives ${list.length === 1 ? "this link" : "this link"}`}
      width={300}
      rows={list.map((a) => ({ label: "Also", value: a }))}
      footer={{ label: "Edit", value: "on their contact card" }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {list.map((a) => (
          <span key={a} style={{
            fontSize: 11.5, fontWeight: 600, padding: "2px 8px", borderRadius: 999,
            background: "rgba(11,74,125,0.08)", color: "#0b4a7d",
            border: "1px solid rgba(11,74,125,0.25)", maxWidth: 230,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>+ {a}</span>
        ))}
      </span>
    </HoverCard>
  );
}

/**
 * Where this owner's link gets emailed — click to edit.
 *
 * Editable in place because the gap is real: only 4 of Parkwood's 21 owners
 * resolve to an address from the name-keyed sources, and the moment you notice
 * is while you're looking at the roster about to send. What you type is stored
 * against the OWNER ID, so it never depends on matching a name again.
 */
export function K1EmailCell({ owner, k1 }: { owner: K1Owner; k1: K1Slice }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(owner.email ?? "");

  if (editing) {
    const commit = () => { setEditing(false); if (draft.trim() !== (owner.email ?? "")) k1.setEmail(owner.id, draft.trim()); };
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") { setDraft(owner.email ?? ""); setEditing(false); }
        }}
        placeholder="name@example.com"
        style={{ width: "100%", maxWidth: 230, fontSize: 12.5, padding: "3px 6px" }}
      />
    );
  }

  if (!owner.email) {
    return (
      <button type="button" onClick={() => { setDraft(""); setEditing(true); }} disabled={k1.busy}
        title={`Add an email for ${owner.name}`}
        style={{
          background: "rgba(220,38,38,0.08)", border: "1.5px dashed rgba(220,38,38,0.45)",
          borderRadius: 999, padding: "2px 9px", cursor: "pointer", fontFamily: "inherit",
          fontSize: 11, fontWeight: 700, color: "#b91c1c",
        }}>
        ADD EMAIL
      </button>
    );
  }

  return (
    <HoverCard title={owner.email} width={280}
      rows={[
        { label: "Source", value: owner.emailNote },
        { label: "For", value: owner.detailedName ?? `${owner.name} · held personally` },
      ]}
      footer={{ label: "Click", value: "to change it" }}>
      <button type="button" onClick={() => { setDraft(owner.email ?? ""); setEditing(true); }} disabled={k1.busy}
        style={{
          background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit",
          fontSize: 12.5, color: "var(--text)", textAlign: "left", maxWidth: 230,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block",
          // A guessed address is the one worth a second look before sending.
          borderBottom: owner.emailSource === "trustee-directory" ? "1px dotted #b45309" : "none",
        }}>
        {owner.email}
      </button>
    </HoverCard>
  );
}

/** One owner's K-1 cell: the file they have, or the target you drop it on. */
export function K1Cell({ owner, k1 }: { owner: K1Owner; k1: K1Slice }) {
  const [dragOver, setDragOver] = useState(false);
  const doc = k1.docFor(owner.id);

  if (k1.uploading === owner.id) {
    return <span style={{ display: "inline-block", minWidth: 62, fontSize: 12, fontWeight: 700, color: TEAL }}>Uploading…</span>;
  }

  if (doc) {
    // Filename lives in the hover, not the cell — see DocChip. Every owner's row
    // is then the same shape whatever their accountant named the file.
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <DocChip
          href={`/api/investor-k1/file?id=${doc.id}`}
          tone={TONE_GREEN}
          label="VIEW"
          icon={false}
          minWidth={62}
          title={doc.filename}
          rows={[
            { label: "For", value: owner.detailedName ?? `${owner.name} · held personally` },
            { label: "Size", value: kb(doc.size) },
            { label: "Uploaded", value: `${shortDate(doc.uploadedAt)}${doc.uploadedBy ? ` · ${doc.uploadedBy}` : ""}` },
          ]}
          footer={{ label: "Status", value: doc.published ? (doc.viewCount ? `Sent · opened ${doc.viewCount}×` : "Sent · not opened yet") : "Not sent — not readable by the investor yet" }}
        />
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
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5,
        cursor: k1.busy ? "default" : "pointer", minWidth: 62,
        border: `1.5px dashed ${dragOver ? TEAL : "rgba(220,38,38,0.45)"}`, borderRadius: 999,
        padding: "2px 9px",
        background: dragOver ? "rgba(15,118,110,0.09)" : "rgba(220,38,38,0.08)",
        color: dragOver ? TEAL : "#b91c1c", fontSize: 11, fontWeight: 700, letterSpacing: "0.02em",
        transition: "border-color .15s, background .15s, color .15s",
      }}
    >
      {dragOver ? "DROP IT" : "MISSING"}
      <input type="file" accept="application/pdf,.pdf" disabled={k1.busy} style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) k1.upload(owner.id, f); }} />
    </label>
  );
}

/**
 * One owner's link — the same share card the CAM statement uses.
 *
 * Two ways out on purpose: copy the link and send it yourself, or have the app
 * email it. Copying changes nothing; only creating and sending do, and Revoke
 * undoes both. Creating a link is what publishes the K-1 (see the header), so
 * the card says so before you press it.
 */
/** "Sep 9" — short enough to sit in a pill inside a table cell. */
const sentStamp = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

/**
 * "Sep 9, 2026 at 3:47 PM EDT" — the full stamp, for the hover.
 *
 * A send is an event you may have to quote back to an investor on the phone
 * ("it went out at 3:47 this afternoon, check your junk folder"), so the hover
 * carries the time and the zone, not just the day. Rendered in the reader's
 * own timezone, which is the one they'd be speaking in.
 */
const sentStampFull = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  return `${date} at ${time}`;
};

type PortalLink = NonNullable<K1Owner["link"]>;

/**
 * Did this investor's K-1 actually go out, and when.
 *
 * The pill used to read "SHARED" for any live link, which conflated two
 * different facts: a link CREATED (copy it and send it yourself) and a link
 * EMAILED. Staff had no way to tell them apart on the roster, and the only
 * places that knew were the results panel that disappears, the admin audit
 * log behind a second password, and Postmark.
 *
 * Now the pill says which, carries the DATE, and is green only when something
 * actually went. The hover has the detail — recipients, PIN status, opens —
 * per the shared rich-hover rule; this is data, not a label.
 */
function SendPill({ link, name }: { link: PortalLink; name: string }) {
  const sentAt = link.sentAt ?? null;
  // Links minted from the send-tracking release on carry `sendCount` (0 when
  // created but not emailed). Null means the link is older than the tracking.
  const tracked = link.sendCount !== null && link.sendCount !== undefined;
  const rows: { label: string; value: string }[] = [];

  const manual = link.sentVia === "manual";
  if (sentAt) {
    rows.push({ label: "Emailed", value: sentStampFull(sentAt) });
    if (link.sentTo?.length) rows.push({ label: "To", value: link.sentTo.join(", ") });
    // A hand-recorded send is somebody's word, not something the app watched
    // happen — there is no message id behind it. Say so, rather than letting
    // it read with the same certainty as one the app made and confirmed.
    rows.push({
      label: "Sent by",
      value: manual ? "Recorded by hand — sent from Outlook" : "The portal, confirmed by Postmark",
    });
    rows.push({
      label: "PIN email",
      value: manual
        ? "Sent by hand alongside the link"
        : link.pinSentAt ? "Sent separately, same time" : "DID NOT SEND — give them the PIN",
    });
    if ((link.sendCount ?? 0) > 1) rows.push({ label: "Times sent", value: String(link.sendCount) });
  } else {
    rows.push({ label: "Link created", value: sentStampFull(link.createdAt) });
    // A link minted before send tracking existed genuinely cannot say. Claiming
    // "never emailed" for one that WAS emailed is the worse error of the two,
    // so an untracked link says so plainly instead.
    rows.push({
      label: "Emailed",
      value: tracked
        ? "Never — copy the link and send it yourself"
        : "Not recorded — this link predates send tracking",
    });
  }
  rows.push({
    label: "Opened",
    value: link.viewCount
      ? `${link.viewCount}×${link.lastViewedAt ? ` · last ${sentStampFull(link.lastViewedAt)}` : ""}`
      : "Not yet",
  });

  // The three states are decided in `sendState.ts`, which is tested — getting
  // "did it send" wrong is the one thing this pill cannot do.
  const state = sendState(link);
  const label = state === "opened"
    ? `OPENED ${link.viewCount}×`
    : state === "sent"
      ? `SENT ${sentStamp(sentAt!)}`
      : state === "link-only"
        ? "LINK ONLY"
        : "SHARED";
  const toneName = sendStateTone(state);
  const tone = toneName === "green" ? TONE_GREEN : toneName === "amber" ? TONE_AMBER : TONE_NEUTRAL;

  return (
    <HoverCard
      title={name}
      width={320}
      rows={rows}
      footer={sentAt && !link.pinSentAt
        ? { label: "Action", value: "They cannot open this until they have the PIN" }
        : undefined}
    >
      <span><Pill tone={tone}>{label}</Pill></span>
    </HoverCard>
  );
}

export function K1PortalCell({ owner, k1 }: { owner: K1Owner; k1: K1Slice }) {
  const doc = k1.docFor(owner.id);
  const links = owner.link?.url
    ? [{
        id: owner.link.id, url: owner.link.url, pin: owner.link.pin ?? null,
        createdAt: owner.link.createdAt, viewCount: owner.link.viewCount,
        lastViewedAt: owner.link.lastViewedAt,
      }]
    : [];

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
      {/* No "NO LINK" pill — the Share button sitting right there already says
          there isn't one. The pill earns its place once there IS a link, and
          what it reports is whether the K-1 actually WENT OUT. */}
      {owner.link && <SendPill link={owner.link} name={owner.name} />}
      <ShareLinkCard
        small
        buttonLabel={owner.link ? "Link" : "Share"}
        title="Investor K-1 link"
        // The link belongs to the PERSON and covers every K-1 they hold, so it
        // is not labelled with the trust this row happens to be — that name
        // belongs on the document, not on the link.
        subject={owner.name}
        description="One private, revocable link, covering every K-1 they hold with us."
        links={links}
        busy={k1.busy}
        error={k1.error}
        // Every address the send actually reaches, so the confirm names them
        // all — the share route mails the additional recipients too, and an
        // address that only appears in the route is one nobody agreed to.
        recipients={recipientsOf(owner.email, owner.alsoEmail)}
        secondaryRecipients={owner.alsoEmail ?? []}
        sendLabel="Email the investor"
        pinOptional={false}
        viewAsHref={`/investor/preview?owner=${encodeURIComponent(owner.id)}`}
        recipientSlot={
          <>
            <K1EmailCell owner={owner} k1={k1} />
            <AlsoRecipients also={owner.alsoEmail} />
          </>
        }
        emptyNote={doc
          ? <>Create the link to make {owner.name}&rsquo;s {k1.year} K-1 readable. You can copy it and send it yourself, or email it from here.</>
          : <>Their {k1.year} K-1 hasn&rsquo;t been uploaded yet — drop it on their row first, then a link can be created.</>}
        onCreate={doc ? () => k1.share([owner.id], false) : undefined}
        // The confirm reads the real message first — see `loadDraft`. Whatever
        // it holds when you confirm is what gets sent.
        loadDraft={() => k1.loadDraft(owner.id)}
        // Send it yourself from Outlook instead — same message, your mailbox.
        onOpenInMail={(m) => openDraftInMail(m, owner.email ? [owner.email] : [], owner.alsoEmail ?? [])}
        onMarkSent={owner.link ? () => k1.markSent(owner.link!.id, recipientsOf(owner.email, owner.alsoEmail)) : undefined}
        // Gated on the document, like `onCreate`: with the send now offered
        // before a link exists, an ungated one would put "Email the investor"
        // in front of an owner whose K-1 hasn't been uploaded, and the server
        // would refuse it after the click.
        onSend={doc ? (_id, draft, opts) => k1.share([owner.id], true, draft, opts) : undefined}
        onRevoke={(id) => {
          if (confirm(`Revoke ${owner.name}'s link? It stops working immediately and their K-1 is no longer readable.`)) {
            k1.revoke(id);
          }
        }}
      />
    </span>
  );
}


/**
 * The investor's ONE link, on their own card.
 *
 * This is where it belongs now that a link covers every partnership a person
 * holds: By Investor IS the person. The property cards keep their own copy of
 * the same control for when you're working a batch, but they act on the same
 * single link.
 */
export function K1InvestorShare({ name, inv }: {
  name: string;
  inv: {
    busy: boolean; error: string | null;
    link: K1Interest["link"];
    email: string | null;
    alsoEmail: string[];
    sendableFrom: K1Interest | null;
    interests: K1Interest[];
    send: (i: K1Interest, taxYear: number, send?: boolean, draft?: EmailDraft, opts?: SendOptions) => Promise<SendOutcome | void>;
    markSent?: (linkId: string, sentTo: string[]) => Promise<void>;
    loadDraft: (i: K1Interest, taxYear: number) => Promise<EmailDraft>;
    revoke: (linkId: string) => void;
    setEmail: (ownerId: string, email: string) => void;
  };
}) {
  const filing = inv.interests.filter((i) => i.filesK1);
  const withDocs = filing.filter((i) => i.documents.length > 0);
  if (filing.length === 0) return null;

  const links = inv.link?.url
    ? [{ id: inv.link.id, url: inv.link.url, pin: inv.link.pin ?? null, createdAt: inv.link.createdAt, viewCount: inv.link.viewCount, lastViewedAt: inv.link.lastViewedAt }]
    : [];
  const target = inv.sendableFrom;
  const newest = target?.documents[0];

  return (
    <ShareLinkCard
      small
      buttonLabel={inv.link ? "Link" : "Share"}
      title="Investor K-1 link"
      subject={name}
      description={`One private, revocable link, covering ${withDocs.length || filing.length} partnership${(withDocs.length || filing.length) === 1 ? "" : "s"} they hold with us.`}
      links={links}
      busy={inv.busy}
      error={inv.error}
      recipients={recipientsOf(inv.email, inv.alsoEmail)}
      secondaryRecipients={inv.alsoEmail ?? []}
      sendLabel="Email the investor"
      pinOptional={false}
      viewAsHref={target ? `/investor/preview?owner=${encodeURIComponent(target.ownerId)}` : undefined}
      recipientSlot={target
        ? (
          <>
            <InlineEmail value={inv.email} busy={inv.busy} onSave={(v) => inv.setEmail(target.ownerId, v)} />
            <AlsoRecipients also={inv.alsoEmail} />
          </>
        )
        : undefined}
      emptyNote={target && newest
        ? <>Create the link to make {name}&rsquo;s {withDocs.length === 1 ? "K-1" : "K-1s"} readable. You can copy it and send it yourself, or email it from here.</>
        : <>No K-1 has been uploaded for {name} yet. They arrive as a batch per partnership, so upload one on the property card first.</>}
      // Create mints the link WITHOUT emailing; only onSend emails, and the
      // card puts a confirm in front of that.
      onCreate={target && newest ? () => inv.send(target, newest.taxYear, false) : undefined}
      loadDraft={target && newest ? () => inv.loadDraft(target, newest.taxYear) : undefined}
      onOpenInMail={(m) => openDraftInMail(m, inv.email ? [inv.email] : [], inv.alsoEmail ?? [])}
      onMarkSent={inv.link && inv.markSent ? () => inv.markSent!(inv.link!.id, recipientsOf(inv.email, inv.alsoEmail)) : undefined}
      onSend={target && newest ? (_id, draft, opts) => inv.send(target, newest.taxYear, true, draft, opts) : undefined}
      onRevoke={(id) => {
        if (confirm(`Revoke ${name}'s link? It stops working immediately and none of their K-1s are readable until you share a new one.`)) {
          inv.revoke(id);
        }
      }}
    />
  );
}

/** The same click-to-edit address as the roster, without a K1Slice behind it. */
function InlineEmail({ value, busy, onSave }: { value: string | null; busy: boolean; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  if (editing) {
    const commit = () => { setEditing(false); if (draft.trim() !== (value ?? "")) onSave(draft.trim()); };
    return (
      <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(value ?? ""); setEditing(false); } }}
        placeholder="name@example.com" style={{ flex: 1, minWidth: 160, fontSize: 12.5, padding: "3px 6px" }} />
    );
  }
  if (!value) {
    return (
      <button type="button" onClick={() => { setDraft(""); setEditing(true); }} disabled={busy}
        style={{ background: "rgba(220,38,38,0.08)", border: "1.5px dashed rgba(220,38,38,0.45)", borderRadius: 999, padding: "2px 9px", cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 700, color: "#b91c1c" }}>
        ADD EMAIL
      </button>
    );
  }
  return (
    <button type="button" onClick={() => { setDraft(value); setEditing(true); }} disabled={busy}
      style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, color: "var(--text)", textAlign: "left" }}>
      {value}
    </button>
  );
}

/**
 * The K-1 and Portal cells on the BY INVESTOR table — the same two columns the
 * property table carries, read from the person's side.
 *
 * Read-only for uploads (a K-1 arrives as a batch on its partnership, so that
 * is where you drop it), but a re-send belongs here: "Carol called, she can't
 * find hers" starts from her name, not from Parkwood.
 */
export function K1InvestorCells({ interest, inv }: {
  interest: K1Interest | undefined;
  inv: { busy: boolean; send: (i: K1Interest, taxYear: number, send?: boolean) => void };
}) {
  // A partnership that issues nobody a K-1 has no cell to fill — listing it as
  // "missing" would be noise on every wholly-owned building.
  if (!interest?.filesK1) {
    return (
      <>
        <td style={{ padding: "12px 16px", color: "var(--muted)" }} className="no-print">—</td>
        <td className="no-print" />
      </>
    );
  }
  const newest = interest.documents[0];
  return (
    <>
      <td style={{ padding: "12px 16px" }} className="no-print">
        {newest ? (
          <DocChip
            href={`/api/investor-k1/file?id=${newest.id}`}
            tone={TONE_GREEN}
            label={`VIEW ${newest.taxYear}`}
            icon={false}
            minWidth={0}
            title={newest.filename}
            rows={[
              { label: "Tax year", value: String(newest.taxYear) },
              { label: "For", value: interest.heldAs ?? "Held personally" },
              ...(interest.documents.length > 1
                ? [{ label: "Other years", value: interest.documents.slice(1).map((d) => d.taxYear).join(", ") }]
                : []),
            ]}
            footer={{ label: "Status", value: newest.published ? (newest.viewCount ? `Sent · opened ${newest.viewCount}×` : "Sent · not opened yet") : "Not sent yet" }}
          />
        ) : (
          <Pill tone={TONE_RED}>MISSING</Pill>
        )}
      </td>
      <td style={{ padding: "12px 16px", textAlign: "right", whiteSpace: "nowrap" }} className="no-print">
        {/* Status only. The link is the PERSON's and is managed in their card
            header — repeating a control per property would imply four links. */}
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {/* The SAME pill as By Property. Two views of one link that disagreed
              on whether it had been sent would be worse than either alone. */}
          {interest.link ? <SendPill link={interest.link} name={interest.propertyName} /> : null}
        </span>
      </td>
    </>
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
  // The link went but the PIN did not — the one outcome that leaves an
  // investor holding something they cannot open, so it gets its own banner.
  const pinStuck = ok.filter((r) => r.sentTo.length && !(r.pinSentTo?.length));
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
            {emailed > 0
              ? <>Every investor got their own link and their own PIN, in two separate emails — the PIN goes out automatically, so there is nothing left to hand over. The PINs are listed below in case someone loses theirs.</>
              : <>Every investor has their own link and their own PIN. Nothing was emailed, so <b>send both yourself</b> — and keep the PIN out of the email carrying the link.</>}
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

      {pinStuck.length > 0 && (
        <div style={{ marginTop: 10, borderRadius: 9, padding: "9px 12px", background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.3)", fontSize: 12.5, color: "#b91c1c" }}>
          <b>{pinStuck.length} PIN{pinStuck.length === 1 ? "" : "s"} did not go out</b> — {pinStuck.map((r) => r.ownerName).join(", ")}{" "}
          {pinStuck.length === 1 ? "has" : "have"} the link but cannot open it. Give them the PIN from the table below.
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
                <td style={{ padding: "8px 12px" }}>
                  <div style={{ fontFamily: "ui-monospace, monospace", fontWeight: 800, letterSpacing: "0.12em" }}>{r.pin}</div>
                  {r.sentTo.length > 0 && (
                    <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.04em", marginTop: 2, color: r.pinSentTo?.length ? "#15803d" : "#b91c1c" }}>
                      {r.pinSentTo?.length ? "EMAILED" : "NOT EMAILED"}
                    </div>
                  )}
                </td>
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

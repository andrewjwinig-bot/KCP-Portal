"use client";

// The share-a-private-link DIALOG, in one place.
//
// The CAM statement grew it first ("Share with tenant"); the K-1 roster needed
// the same thing and would otherwise have been a second, subtly different share
// flow. Sharing a document should feel identical wherever you do it: the same
// button, the same card, the same link box, the same PIN treatment, the same
// two ways out — copy it and send it yourself, or have the app email it.
//
// This component owns the LOOK and the interaction only. Each caller supplies
// its own actions, because a tenant link and a K-1 link are different objects
// with different rules (a K-1's PIN is mandatory; a tenant's is optional).
//
// It is a MODAL, not a popover. Sending someone their K-1 or their statement is
// a deliberate act, and it was being decided in a 420px card wedged under a
// button inside a scrolling table — which clipped it, and made the link, the
// PIN and the send button compete for room. A centred dialog gives the URL and
// the PIN space to be read aloud over the phone, and puts the send behind a
// confirm that names every recipient. Rendered through a portal so no table
// overflow can crop it.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const BRAND = "#0b4a7d";

/**
 * `confirmSend` when the send will MINT the link on its way out.
 *
 * Not a link id, because there is no link yet — that is the point. Sending
 * used to require creating a link first, which meant minting one you had not
 * asked for purely to make the send button appear.
 */
const PENDING_LINK = "__pending__";

/** The one section label in the dialog — every block is introduced the same way. */
const SECTION: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em",
  textTransform: "uppercase", color: "var(--muted)", marginBottom: 6,
};

/**
 * What a send actually did, reported back so the dialog can confirm it in
 * place rather than closing and leaving you to go looking.
 *
 * `onSend` may return this (or a promise of it). Return nothing and the card
 * falls back to its old behaviour — close on click — so the tenant flow is
 * unaffected until it wants the same treatment.
 */
export type SendOutcome = {
  /** Addresses the message reached. Empty with no `error` means nothing sent. */
  sentTo: string[];
  /** Addresses the follow-up (the K-1 PIN) reached, when there is one. */
  pinSentTo?: string[];
  /** Set when the send failed, or half-succeeded — shown instead of the tick. */
  error?: string | null;
};

/** The email a send would deliver — previewed, optionally edited, then sent. */
export type EmailDraft = {
  subject: string;
  body: string;
  /** A second message the same send delivers, shown but not editable — the
   *  K-1 flow uses it for the PIN, which follows the link automatically. */
  followUp?: { subject: string; body: string } | null;
  /** Addresses blind-copied on both messages. Named in the confirm because a
   *  copy the UI never mentions is what surprises someone later. */
  copyTo?: string[];
};

export type ShareLink = {
  id: string;
  url: string;
  createdAt?: string;
  viewCount?: number;
  lastViewedAt?: string | null;
  pin?: string | null;
};

export type ShareLinkCardProps = {
  /** Trigger label, e.g. "Share with tenant". */
  buttonLabel: string;
  /** Small caps kicker above the name, e.g. "Investor K-1 link". */
  title: string;
  /** WHO the link is for. The dialog is about a person, so they are the
   *  heading — not a name buried in a sentence of explanation. */
  subject?: string;
  /** One or two sentences on what this link is. */
  description: React.ReactNode;
  links: ShareLink[];
  busy?: boolean;
  error?: string | null;
  /** Who an email would go to. Empty means the send is offered but blocked. */
  recipients?: string[];
  /** Wording for the send action, e.g. "Email to tenant". */
  sendLabel?: string;
  /** Shown after a successful send. */
  sentTo?: string[] | null;
  onOpen?: () => void;
  onCreate?: (requirePin: boolean) => void;
  onSend?: (id: string, draft?: EmailDraft) => void | Promise<SendOutcome | void>;
  /**
   * Load the message the send would actually deliver, so the confirm shows the
   * email rather than only naming its recipients.
   *
   * Provide it and the confirm becomes a read-and-edit step: subject and body
   * are fetched from the server that will send them, shown in full, and any
   * edit is handed back through `onSend`. Omit it and the confirm stays as it
   * was — a tenant statement link is not the same irreversible act as an
   * investor's tax document.
   */
  loadDraft?: (id: string) => Promise<EmailDraft>;
  onRevoke?: (id: string) => void;
  /** Omit to hide the PIN controls entirely (a K-1's PIN is not optional). */
  onManagePin?: (id: string, action: "reset" | "remove") => void;
  /** False when the link type always carries a PIN — hides the opt-out. */
  pinOptional?: boolean;
  /** Compact trigger for a table cell rather than a card header. */
  small?: boolean;
  /** Retained for callers; the dialog is centred, so it no longer positions. */
  align?: "left" | "right";
  /** Opens the recipient's page as they would see it — a look, not a share. */
  viewAsHref?: string;
  /** Editable "sends to" control. The address belongs where the decision to
   *  send is made, not as a column on a roster you mostly read. */
  recipientSlot?: React.ReactNode;
  /**
   * Why there is no link yet, when the caller cannot offer to create one.
   * Without it the dialog dead-ends on "No active link yet." with no button
   * and no reason — which reads as broken rather than as a missing step.
   */
  emptyNote?: React.ReactNode;
};

export function ShareLinkCard({
  buttonLabel, title, subject, description, links, busy = false, error = null,
  recipients = [], sendLabel = "Email it", sentTo = null,
  onOpen, onCreate, onSend, onRevoke, onManagePin, loadDraft,
  pinOptional = true, small = false, align = "right", viewAsHref, recipientSlot, emptyNote,
}: ShareLinkCardProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [confirmSend, setConfirmSend] = useState<string | null>(null);
  /** The draft on the open confirm: null while loading, an error string if it
   *  couldn't be built. Cleared whenever the confirm closes, so a stale draft
   *  can never be the thing that gets sent. */
  const [draft, setDraft] = useState<EmailDraft | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  /**
   * The send in flight, then what it did.
   *
   * The dialog used to close the instant you confirmed, which reads as "did
   * that work?" on the one action in the app you cannot take back. Now it
   * stays open: the button becomes a spinner, then the confirm is replaced by
   * the outcome — who was reached, and whether the PIN went with it.
   */
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState<SendOutcome | null>(null);
  const [requirePin, setRequirePin] = useState(true);
  const [mounted, setMounted] = useState(false);

  /** Leave the confirm, dropping the draft and any outcome with it. */
  function closeConfirm() {
    setConfirmSend(null);
    setDraft(null);
    setDraftError(null);
    setEditing(false);
    setSending(false);
    setOutcome(null);
  }

  /**
   * Run the send and hold the dialog open on its result.
   *
   * A caller that reports nothing back keeps the old behaviour — close on
   * click — so a flow that hasn't opted in doesn't sit on a blank panel
   * waiting for a confirmation that will never arrive.
   */
  async function runSend(id: string) {
    if (!onSend) return;
    setSending(true);
    try {
      const result = await onSend(id, draft ?? undefined);
      if (!result) { closeConfirm(); return; }
      setOutcome(result);
    } catch (e) {
      setOutcome({ sentTo: [], error: e instanceof Error ? e.message : "The send failed." });
    } finally {
      setSending(false);
    }
  }

  /**
   * Open the confirm and, where the caller can supply one, fetch the message
   * that would go out. The draft is loaded fresh every time rather than cached:
   * the address, the document count and the link can all have changed since the
   * dialog was opened, and a preview of a stale email is worse than none.
   */
  function openConfirm(id: string) {
    setConfirmSend(id);
    setDraft(null);
    setDraftError(null);
    setEditing(false);
    if (!loadDraft) return;
    void loadDraft(id)
      .then((d) => setDraft(d))
      .catch((e) => setDraftError(e instanceof Error ? e.message : "Couldn't load the message."));
  }

  useEffect(() => setMounted(true), []);
  useEffect(() => { if (open) onOpen?.(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open]);
  useEffect(() => {
    if (!open) return;
    // Closing always drops any half-made send decision, so reopening never
    // lands on a primed confirm button.
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { closeConfirm(); setOpen(false); } };
    document.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; };
  }, [open]);

  function close() { closeConfirm(); setOpen(false); }

  function copy(text: string) {
    navigator.clipboard?.writeText(text)
      .then(() => { setCopied(text); setTimeout(() => setCopied(null), 2000); })
      .catch(() => {});
  }

  const dialog = (
    <div
      onClick={close}
      style={{
        position: "fixed", inset: 0, zIndex: 200, background: "rgba(15,23,42,0.55)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "56px 16px 32px", overflow: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="card"
        style={{
          width: 620, maxWidth: "100%", textAlign: "left", padding: 0,
          boxShadow: "0 30px 70px rgba(15,23,42,0.38)",
        }}
      >
        <div style={{
          display: "flex", alignItems: "flex-start", justifyContent: "space-between",
          gap: 14, padding: "18px 20px 14px", borderBottom: "1px solid var(--border)",
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase", color: BRAND }}>{title}</div>
            {subject && (
              <div style={{ fontSize: 23, fontWeight: 800, lineHeight: 1.15, marginTop: 4, wordBreak: "break-word" }}>{subject}</div>
            )}
            <p className="muted" style={{ margin: "6px 0 0", fontSize: 13, lineHeight: 1.5 }}>{description}</p>
          </div>
          <button onClick={close} className="btn" style={{ fontSize: 12, padding: "6px 12px", flexShrink: 0 }}>Close</button>
        </div>

        <div style={{ padding: "16px 20px 20px" }}>

          {viewAsHref && (
            <a href={viewAsHref} target="_blank" rel="noopener noreferrer" className="btn"
              style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 700, color: BRAND, textDecoration: "none", padding: "8px 14px", marginBottom: 16 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
              View their page
            </a>
          )}

          {recipientSlot && (
            <div style={{ marginBottom: 16 }}>
              <div style={SECTION}>Sends to</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>{recipientSlot}</div>
            </div>
          )}

          {links.length === 0 ? (
            <div style={{
              marginBottom: 14, padding: "12px 14px", borderRadius: 10,
              border: "1px dashed var(--border)", background: "rgba(15,23,42,0.02)",
            }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>No link yet — nothing has been sent.</div>
              {emptyNote && <div className="muted" style={{ fontSize: 12.5, marginTop: 5, lineHeight: 1.5 }}>{emptyNote}</div>}
            </div>
          ) : links.map((l) => (
            <div key={l.id}>
              {/* Link, then PIN, each under its own label — the two things you
                  came here for, stacked rather than crowded onto one row. */}
              <div style={{ marginBottom: 16 }}>
                <div style={SECTION}>Private link</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input readOnly value={l.url} onFocus={(e) => e.currentTarget.select()}
                    style={{ flex: 1, minWidth: 0, fontSize: 13 }} />
                  <button onClick={() => copy(l.url)} className="btn" style={{ fontSize: 13, fontWeight: 700, padding: "8px 14px", flexShrink: 0 }}>
                    {copied === l.url ? "Copied ✓" : "Copy"}
                  </button>
                </div>
              </div>

              {l.pin ? (
                <div style={{ marginBottom: 16 }}>
                  <div style={SECTION}>Access PIN</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <code style={{ fontSize: 26, fontWeight: 800, letterSpacing: "0.22em", color: BRAND, background: "rgba(11,74,125,0.08)", borderRadius: 10, padding: "7px 16px" }}>{l.pin}</code>
                    <button onClick={() => copy(l.pin!)} className="btn" style={{ fontSize: 13, fontWeight: 700, padding: "8px 13px" }}>
                      {copied === l.pin ? "Copied ✓" : "Copy"}
                    </button>
                    {onManagePin && (
                      <div style={{ marginLeft: "auto", display: "flex", gap: 12 }}>
                        <button onClick={() => onManagePin(l.id, "reset")} disabled={busy} style={{ background: "none", border: "none", padding: 0, fontSize: 12, fontWeight: 700, cursor: "pointer", color: "var(--muted)" }}>Reset</button>
                        {pinOptional && (
                          <button onClick={() => onManagePin(l.id, "remove")} disabled={busy} style={{ background: "none", border: "none", padding: 0, fontSize: 12, fontWeight: 700, cursor: "pointer", color: "#b91c1c" }}>Remove</button>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                    {loadDraft
                      ? "Emailed to them automatically, as its own message just after the link."
                      : "Send this separately — never in the same email as the link."}
                  </div>
                </div>
              ) : onManagePin && pinOptional ? (
                <div style={{ marginBottom: 16 }}>
                  <button onClick={() => onManagePin(l.id, "reset")} disabled={busy} className="btn" style={{ fontSize: 12.5, fontWeight: 700, padding: "7px 12px", color: BRAND }}>+ Add an access PIN</button>
                </div>
              ) : null}

              <div className="muted" style={{ fontSize: 12, paddingTop: 14, borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span>{l.viewCount ? `${l.viewCount} view${l.viewCount === 1 ? "" : "s"}${l.lastViewedAt ? ` · last ${new Date(l.lastViewedAt).toLocaleDateString("en-US")}` : ""}` : "Not opened yet"}</span>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  {onSend && (
                    <button onClick={() => openConfirm(l.id)} disabled={busy} className="btn primary"
                      style={{ fontSize: 13, fontWeight: 700, padding: "8px 14px", display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 5L2 7" /></svg>
                      {sendLabel}
                    </button>
                  )}
                  {onRevoke && (
                    <button onClick={() => onRevoke(l.id)} disabled={busy} className="btn"
                      style={{ fontSize: 12, fontWeight: 700, padding: "7px 12px", color: "#b91c1c" }}>Revoke</button>
                  )}
                </div>
              </div>

              {sentTo && confirmSend === null && (
                <div style={{ marginTop: 8, fontSize: 11.5, fontWeight: 700, color: "#15803d" }}>✓ Emailed to {sentTo.join(", ")}</div>
              )}
            </div>
          ))}
          {/* The confirm + outcome, rendered ONCE outside the links loop.
              It used to live inside it, which meant it could only exist for a
              link that already existed — forcing "Create link" as a separate
              step before you could email anyone. `confirmSend` is a link id, or
              PENDING_LINK when the send will mint one. */}
          {confirmSend !== null && (
            <div>

              {/* Sending is always a deliberate second step — a copy must never
                  turn into a send by a misplaced click. */}
              {/* What the send did. Replaces the confirm rather than closing
                  the dialog — on the one action you cannot take back, "it
                  vanished" is not a confirmation. */}
              {outcome && (
                <div className="send-outcome" style={{
                  marginTop: 12, borderRadius: 10, padding: "14px 15px",
                  border: outcome.error ? "1.5px solid rgba(220,38,38,0.45)" : "1.5px solid rgba(22,163,74,0.45)",
                  background: outcome.error ? "rgba(220,38,38,0.06)" : "rgba(22,163,74,0.07)",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {outcome.error ? (
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#b91c1c" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="13" /><line x1="12" y1="16.5" x2="12.01" y2="16.5" /></svg>
                    ) : (
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <circle cx="12" cy="12" r="10" fill="none" stroke="#15803d" strokeWidth="2" className="sent-ring" />
                        <path d="M7.5 12.4l3 3 6-6.4" fill="none" stroke="#15803d" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="sent-check" />
                      </svg>
                    )}
                    <div style={{ fontSize: 14.5, fontWeight: 800, color: outcome.error ? "#b91c1c" : "#15803d" }}>
                      {outcome.error ? "Not sent" : outcome.sentTo.length ? "Sent" : "Link created — not emailed"}
                    </div>
                  </div>

                  {outcome.error && (
                    <div style={{ fontSize: 12.5, marginTop: 8, color: "var(--text)" }}>{outcome.error}</div>
                  )}

                  {outcome.sentTo.length > 0 && (
                    <ul style={{ margin: "9px 0 0", paddingLeft: 18 }}>
                      {outcome.sentTo.map((r) => (
                        <li key={r} style={{ fontSize: 13, fontWeight: 700 }}>{r}</li>
                      ))}
                    </ul>
                  )}

                  {/* Both halves reported separately: the one that matters is
                      the PIN, since a link without it opens nothing. */}
                  {outcome.sentTo.length > 0 && outcome.pinSentTo && (
                    <div style={{ fontSize: 12.5, marginTop: 9, fontWeight: 600, color: outcome.pinSentTo.length ? "#15803d" : "#b91c1c" }}>
                      {outcome.pinSentTo.length
                        ? "✓ The PIN went out as its own email too."
                        : "⚠ The PIN email did NOT go out — give them the PIN above yourself, or they can't open the link."}
                    </div>
                  )}

                  <div style={{ marginTop: 12 }}>
                    <button onClick={closeConfirm} className="btn" style={{ fontSize: 13, fontWeight: 700, padding: "8px 15px" }}>Done</button>
                  </div>
                </div>
              )}

              {!outcome && (
                <div style={{ marginTop: 12, border: "1.5px solid rgba(180,83,9,0.45)", background: "rgba(180,83,9,0.07)", borderRadius: 10, padding: "13px 15px" }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#b45309", display: "flex", alignItems: "center", gap: 7 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                    This sends the email
                  </div>
                  {/* Say that the link is being created here, since there was
                      no "Create link" step to make that obvious. */}
                  {confirmSend === PENDING_LINK && (
                    <div className="muted" style={{ fontSize: 12.5, marginTop: 7 }}>
                      This also creates their private link and access PIN — there is nothing to set up first.
                    </div>
                  )}
                  {recipients.length > 0 ? (
                    <div style={{ margin: "8px 0 12px" }}>
                      <div style={{ fontSize: 12.5, color: "var(--text)" }}>
                        This emails the private link — and the document it opens — to
                        {recipients.length === 1 ? "" : ` all ${recipients.length} of these addresses`}:
                      </div>
                      {/* Every recipient named on its own line. A second address
                          is someone who can then open this person's document, so
                          it must be read, not skimmed past in a joined string. */}
                      <ul style={{ margin: "7px 0 0", paddingLeft: 18 }}>
                        {recipients.map((r) => (
                          <li key={r} style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{r}</li>
                        ))}
                      </ul>
                      <div className="muted" style={{ fontSize: 12, marginTop: 7 }}>
                        {loadDraft
                          ? "Their PIN follows as its own separate email — nothing to hand over."
                          : "The PIN is not emailed — give it to them separately."}
                      </div>
                      {draft?.copyTo && draft.copyTo.length > 0 && (
                        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                          Blind-copied on both, so you can confirm they went out:{" "}
                          <b>{draft.copyTo.join(", ")}</b>. The investor doesn&rsquo;t see this.
                        </div>
                      )}

                      {/* The message itself. A send is irreversible — you
                          cannot unsend someone their tax document — so the
                          words are read here, before, rather than found in a
                          reply afterwards. Editable in place, and what the
                          server sends is what this box holds. */}
                      {loadDraft && (
                        <div style={{ marginTop: 12 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                            <div style={{ ...SECTION, marginBottom: 0 }}>The message</div>
                            {draft && (
                              <button type="button" onClick={() => setEditing((v) => !v)}
                                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 12, fontWeight: 700, color: BRAND }}>
                                {editing ? "Done editing" : "Edit"}
                              </button>
                            )}
                          </div>
                          {draftError ? (
                            <div className="small" style={{ color: "#b91c1c" }}>
                              {draftError} You can still send — the standard message will be used.
                            </div>
                          ) : !draft ? (
                            <div className="muted small">Loading the message…</div>
                          ) : editing ? (
                            <div style={{ display: "grid", gap: 8 }}>
                              <input
                                value={draft.subject}
                                onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                                aria-label="Subject"
                                style={{ width: "100%", fontSize: 13, fontWeight: 700 }}
                              />
                              <textarea
                                value={draft.body}
                                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                                aria-label="Message"
                                rows={12}
                                style={{ width: "100%", fontSize: 12.5, lineHeight: 1.55, fontFamily: "inherit", resize: "vertical" }}
                              />
                              <div className="muted" style={{ fontSize: 11.5 }}>
                                Keep the link in the message — if you delete it we add it back, because
                                the investor has no other way to reach the document.
                              </div>
                            </div>
                          ) : (
                            <div style={{ border: "1px solid var(--border)", borderRadius: 10, background: "var(--card)", overflow: "hidden" }}>
                              <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", fontSize: 13, fontWeight: 700 }}>
                                {draft.subject}
                              </div>
                              <div style={{ padding: "10px 12px", fontSize: 12.5, lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 260, overflowY: "auto" }}>
                                {draft.body}
                              </div>
                            </div>
                          )}

                          {/* The second message, sent straight after. Read-only
                              on purpose: it is three lines and a number, and
                              the number is the one thing an edit could get
                              wrong. */}
                          {draft?.followUp && (
                            <div style={{ marginTop: 10 }}>
                              <div style={{ ...SECTION, marginBottom: 6 }}>Then, separately</div>
                              <div style={{ border: "1px solid var(--border)", borderRadius: 10, background: "var(--card)", overflow: "hidden" }}>
                                <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", fontSize: 13, fontWeight: 700 }}>
                                  {draft.followUp.subject}
                                </div>
                                <div style={{ padding: "10px 12px", fontSize: 12.5, lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 200, overflowY: "auto" }}>
                                  {draft.followUp.body}
                                </div>
                              </div>
                              <div className="muted" style={{ fontSize: 11.5, marginTop: 5 }}>
                                Sent automatically as its own email. It carries no link, and the
                                message above carries no PIN — so neither one on its own opens the document.
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="small" style={{ margin: "6px 0 10px", color: "#b91c1c" }}>
                      No email address on file. Copy the link above and send it yourself, or add an address first.
                    </p>
                  )}
                  <div style={{ display: "flex", gap: 8 }}>
                    {/* Nothing sends while the message is still loading: the
                        whole point is that it was read first. */}
                    <button onClick={() => void runSend(confirmSend)}
                      disabled={busy || sending || recipients.length === 0 || (!!loadDraft && !draft && !draftError)}
                      className="btn primary" style={{ fontSize: 13, fontWeight: 700, padding: "9px 16px", display: "inline-flex", alignItems: "center", gap: 7, opacity: busy || sending || recipients.length === 0 || (!!loadDraft && !draft && !draftError) ? 0.6 : 1 }}>
                      {(busy || sending) && <span className="spin-dot" aria-hidden />}
                      {busy || sending ? "Sending…" : `Yes, ${sendLabel.toLowerCase()}`}
                    </button>
                    <button onClick={closeConfirm} disabled={sending} className="btn" style={{ fontSize: 13, fontWeight: 700, padding: "9px 16px" }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {links.length === 0 && (onCreate || onSend) && confirmSend === null && (
            <>
              {pinOptional ? (
                <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, marginBottom: 8, cursor: "pointer", color: "var(--text)" }}>
                  <input type="checkbox" checked={requirePin} onChange={(e) => setRequirePin(e.target.checked)} />
                  Protect this link with an access PIN
                </label>
              ) : (
                <div className="muted small" style={{ marginBottom: 8 }}>
                  This link always carries an access PIN.
                </div>
              )}

              {/* Emailing is ONE action, not two.
                  "Create link" used to be a prerequisite: you minted a link
                  you had not asked for, only so the send button would appear.
                  The rule it seemed to serve — never mail an investor without a
                  deliberate confirm — is satisfied by the confirm itself, which
                  now shows the whole message before anything goes. So the send
                  is offered straight away and mints the link on its way. */}
              {onSend ? (
                <>
                  <button onClick={() => openConfirm(PENDING_LINK)} disabled={busy || sending} className="btn primary"
                    style={{ fontSize: 13, fontWeight: 700, width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 5L2 7" /></svg>
                    {sendLabel}
                  </button>
                  {/* The other way out is kept, quietly: copying mutates
                      nothing, which is how you check a link before anyone
                      gets one. */}
                  {onCreate && (
                    <button onClick={() => onCreate(pinOptional ? requirePin : true)} disabled={busy} className="btn"
                      style={{ fontSize: 12.5, fontWeight: 700, width: "100%", marginTop: 8 }}>
                      {busy ? "Working…" : "Just create the link — I'll send it myself"}
                    </button>
                  )}
                </>
              ) : onCreate ? (
                <button onClick={() => onCreate(pinOptional ? requirePin : true)} disabled={busy} className="btn primary"
                  style={{ fontSize: 13, fontWeight: 700, width: "100%" }}>
                  {busy ? "Working…" : "Create link"}
                </button>
              ) : null}
            </>
          )}

          {error && <div className="small" style={{ color: "#b91c1c", fontWeight: 700, marginTop: 10 }}>{error}</div>}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn"
        style={small
          ? { fontSize: 11.5, padding: "3px 9px", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 5 }
          : { fontSize: 13, padding: "8px 14px", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6 }}>
        <svg width={small ? 12 : 14} height={small ? 12 : 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" /></svg>
        {buttonLabel}
      </button>
      {/* Through a portal: the trigger usually sits in a scrolling table cell,
          which would crop a dialog rendered in place. */}
      {open && mounted ? createPortal(dialog, document.body) : null}
    </>
  );
}

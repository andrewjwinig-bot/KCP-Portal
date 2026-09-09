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
  /** Small caps heading inside the card. */
  title: string;
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
  onSend?: (id: string) => void;
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
  buttonLabel, title, description, links, busy = false, error = null,
  recipients = [], sendLabel = "Email it", sentTo = null,
  onOpen, onCreate, onSend, onRevoke, onManagePin,
  pinOptional = true, small = false, align = "right", viewAsHref, recipientSlot, emptyNote,
}: ShareLinkCardProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [confirmSend, setConfirmSend] = useState<string | null>(null);
  const [requirePin, setRequirePin] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => { if (open) onOpen?.(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open]);
  useEffect(() => {
    if (!open) return;
    // Closing always drops any half-made send decision, so reopening never
    // lands on a primed confirm button.
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setConfirmSend(null); setOpen(false); } };
    document.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; };
  }, [open]);

  function close() { setConfirmSend(null); setOpen(false); }

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
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: BRAND }}>{title}</div>
            <p className="muted" style={{ margin: "5px 0 0", fontSize: 13, lineHeight: 1.5 }}>{description}</p>
          </div>
          <button onClick={close} className="btn" style={{ fontSize: 12, padding: "6px 12px", flexShrink: 0 }}>Close</button>
        </div>

        <div style={{ padding: "16px 20px 20px" }}>

          {viewAsHref && (
            <a href={viewAsHref} target="_blank" rel="noopener noreferrer"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: BRAND, textDecoration: "none", marginBottom: 14 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
              View their page — nothing is sent
            </a>
          )}

          {recipientSlot && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid var(--border)" }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Sends to</span>
              {recipientSlot}
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
            <div key={l.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "14px 15px", marginBottom: 10, background: "rgba(15,23,42,0.02)" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input readOnly value={l.url} onFocus={(e) => e.currentTarget.select()}
                  style={{ flex: 1, minWidth: 0, fontSize: 13 }} />
                <button onClick={() => copy(l.url)} className="btn" style={{ fontSize: 13, fontWeight: 700, padding: "8px 14px", flexShrink: 0 }}>
                  {copied === l.url ? "Copied ✓" : "Copy"}
                </button>
              </div>

              {l.pin ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 7, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Access PIN</span>
                  <code style={{ fontSize: 22, fontWeight: 800, letterSpacing: "0.2em", color: BRAND, background: "rgba(11,74,125,0.08)", borderRadius: 8, padding: "5px 14px" }}>{l.pin}</code>
                  <button onClick={() => copy(l.pin!)} className="btn" style={{ fontSize: 12, fontWeight: 700, padding: "6px 11px" }}>
                    {copied === l.pin ? "Copied ✓" : "Copy"}
                  </button>
                  {onManagePin && (
                    <div style={{ marginLeft: "auto", display: "flex", gap: 12 }}>
                      <button onClick={() => onManagePin(l.id, "reset")} disabled={busy} style={{ background: "none", border: "none", padding: 0, fontSize: 11, fontWeight: 700, cursor: "pointer", color: "var(--muted)" }}>Reset</button>
                      {pinOptional && (
                        <button onClick={() => onManagePin(l.id, "remove")} disabled={busy} style={{ background: "none", border: "none", padding: 0, fontSize: 11, fontWeight: 700, cursor: "pointer", color: "#b91c1c" }}>Remove</button>
                      )}
                    </div>
                  )}
                </div>
              ) : onManagePin && pinOptional ? (
                <div style={{ marginTop: 7 }}>
                  <button onClick={() => onManagePin(l.id, "reset")} disabled={busy} style={{ background: "none", border: "none", padding: 0, fontSize: 11, fontWeight: 700, cursor: "pointer", color: BRAND }}>+ Add an access PIN</button>
                </div>
              ) : null}

              <div className="muted" style={{ fontSize: 11, marginTop: 7, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span>{l.viewCount ? `${l.viewCount} view${l.viewCount === 1 ? "" : "s"}${l.lastViewedAt ? ` · last ${new Date(l.lastViewedAt).toLocaleDateString("en-US")}` : ""}` : "Not opened yet"}</span>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  {onSend && (
                    <button onClick={() => setConfirmSend(l.id)} disabled={busy} className="btn primary"
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

              {/* Sending is always a deliberate second step — a copy must never
                  turn into a send by a misplaced click. */}
              {confirmSend === l.id && (
                <div style={{ marginTop: 12, border: "1.5px solid rgba(180,83,9,0.45)", background: "rgba(180,83,9,0.07)", borderRadius: 10, padding: "13px 15px" }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#b45309", display: "flex", alignItems: "center", gap: 7 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                    This sends the email
                  </div>
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
                        The PIN is not emailed — give it to them separately.
                      </div>
                    </div>
                  ) : (
                    <p className="small" style={{ margin: "6px 0 10px", color: "#b91c1c" }}>
                      No email address on file. Copy the link above and send it yourself, or add an address first.
                    </p>
                  )}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => { onSend?.(l.id); setConfirmSend(null); }} disabled={busy || recipients.length === 0}
                      className="btn primary" style={{ fontSize: 13, fontWeight: 700, padding: "9px 16px", opacity: busy || recipients.length === 0 ? 0.6 : 1 }}>
                      {busy ? "Sending…" : `Yes, ${sendLabel.toLowerCase()}`}
                    </button>
                    <button onClick={() => setConfirmSend(null)} className="btn" style={{ fontSize: 13, fontWeight: 700, padding: "9px 16px" }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {links.length === 0 && onCreate && (
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
              <button onClick={() => onCreate(pinOptional ? requirePin : true)} disabled={busy} className="btn primary"
                style={{ fontSize: 13, fontWeight: 700, width: "100%" }}>
                {busy ? "Working…" : "Create link"}
              </button>
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

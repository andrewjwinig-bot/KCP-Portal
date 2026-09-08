"use client";

// The share-a-private-link popover, in one place.
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

import { useEffect, useRef, useState } from "react";

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
  /** Right-align the popover under the trigger. */
  align?: "left" | "right";
};

export function ShareLinkCard({
  buttonLabel, title, description, links, busy = false, error = null,
  recipients = [], sendLabel = "Email it", sentTo = null,
  onOpen, onCreate, onSend, onRevoke, onManagePin,
  pinOptional = true, small = false, align = "right",
}: ShareLinkCardProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [confirmSend, setConfirmSend] = useState<string | null>(null);
  const [requirePin, setRequirePin] = useState(true);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { if (open) onOpen?.(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open]);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  function copy(text: string) {
    navigator.clipboard?.writeText(text)
      .then(() => { setCopied(text); setTimeout(() => setCopied(null), 2000); })
      .catch(() => {});
  }

  return (
    <div ref={wrapRef} style={{ display: "inline-block", position: "relative" }}>
      <button onClick={() => setOpen((o) => !o)} className="btn"
        style={small
          ? { fontSize: 11.5, padding: "3px 9px", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 5 }
          : { fontSize: 13, padding: "8px 14px", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6 }}>
        <svg width={small ? 12 : 14} height={small ? 12 : 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" /></svg>
        {buttonLabel}
      </button>

      {open && (
        <div style={{
          position: "absolute", [align]: 0, top: "calc(100% + 6px)", zIndex: 50,
          width: 420, maxWidth: "90vw", background: "var(--card)", border: "1px solid var(--border)",
          borderRadius: 12, boxShadow: "0 16px 40px rgba(15,23,42,0.22)", padding: 16, textAlign: "left",
        } as React.CSSProperties}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: BRAND }}>{title}</div>
          <p className="muted small" style={{ marginTop: 4, marginBottom: 10 }}>{description}</p>

          {links.length === 0 ? (
            <div className="muted small" style={{ marginBottom: 10 }}>No active link yet.</div>
          ) : links.map((l) => (
            <div key={l.id} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "9px 10px", marginBottom: 8, background: "rgba(15,23,42,0.02)" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input readOnly value={l.url} onFocus={(e) => e.currentTarget.select()}
                  style={{ flex: 1, minWidth: 0, fontSize: 12, padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--card)", color: "var(--text)", fontFamily: "inherit" }} />
                <button onClick={() => copy(l.url)} className="btn" style={{ fontSize: 12, fontWeight: 700, padding: "6px 10px", flexShrink: 0 }}>
                  {copied === l.url ? "Copied ✓" : "Copy"}
                </button>
              </div>

              {l.pin ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 7, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Access PIN</span>
                  <code style={{ fontSize: 15, fontWeight: 800, letterSpacing: "0.16em", color: BRAND, background: "rgba(11,74,125,0.08)", borderRadius: 6, padding: "3px 10px" }}>{l.pin}</code>
                  <button onClick={() => copy(l.pin!)} className="btn" style={{ fontSize: 11, fontWeight: 700, padding: "4px 8px" }}>
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
                    <button onClick={() => setConfirmSend(l.id)} disabled={busy}
                      style={{ background: "none", border: "none", color: BRAND, fontSize: 11, fontWeight: 700, cursor: "pointer", padding: 0, display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 5L2 7" /></svg>
                      {sendLabel}
                    </button>
                  )}
                  {onRevoke && (
                    <button onClick={() => onRevoke(l.id)} disabled={busy} style={{ background: "none", border: "none", color: "#b91c1c", fontSize: 11, fontWeight: 700, cursor: "pointer", padding: 0 }}>Revoke</button>
                  )}
                </div>
              </div>

              {sentTo && confirmSend === null && (
                <div style={{ marginTop: 8, fontSize: 11.5, fontWeight: 700, color: "#15803d" }}>✓ Emailed to {sentTo.join(", ")}</div>
              )}

              {/* Sending is always a deliberate second step — a copy must never
                  turn into a send by a misplaced click. */}
              {confirmSend === l.id && (
                <div style={{ marginTop: 8, border: "1px solid rgba(180,83,9,0.35)", background: "rgba(180,83,9,0.07)", borderRadius: 8, padding: "10px 11px" }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#b45309", display: "flex", alignItems: "center", gap: 6 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                    This sends the email
                  </div>
                  {recipients.length > 0 ? (
                    <p className="small" style={{ margin: "6px 0 10px", color: "var(--text)" }}>
                      The private link will be sent to: <b>{recipients.join(", ")}</b>. Only send when you&rsquo;re ready for them to have it.
                    </p>
                  ) : (
                    <p className="small" style={{ margin: "6px 0 10px", color: "#b91c1c" }}>
                      No email address on file. Copy the link above and send it yourself, or add an address first.
                    </p>
                  )}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => { onSend?.(l.id); setConfirmSend(null); }} disabled={busy || recipients.length === 0}
                      className="btn primary" style={{ fontSize: 12, fontWeight: 700, padding: "6px 12px", opacity: busy || recipients.length === 0 ? 0.6 : 1 }}>
                      {busy ? "Sending…" : sendLabel}
                    </button>
                    <button onClick={() => setConfirmSend(null)} className="btn" style={{ fontSize: 12, fontWeight: 700, padding: "6px 12px" }}>Cancel</button>
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

          {error && <div className="small" style={{ color: "#b91c1c", fontWeight: 700, marginTop: 8 }}>{error}</div>}
        </div>
      )}
    </div>
  );
}

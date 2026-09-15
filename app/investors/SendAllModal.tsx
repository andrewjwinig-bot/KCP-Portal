"use client";

// The confirm in front of the largest action in the app: one click, every
// investor, each send irreversible and each releasing somebody's tax document.
//
// It was a native `confirm()` — a wall of plain text that could show a name and
// an address and nothing else. The things worth pausing on are exactly the
// things that wall could not carry: which addresses were matched LOOSELY rather
// than found, who is skipped for having none, and who will receive a link to
// fewer K-1s than they hold. So it is a real dialog, rendered like the share
// card it sits beside.

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Pill, TONE_AMBER, TONE_NEUTRAL } from "@/app/components/Pill";

export type SendAllRow = {
  name: string;
  /** One interest per person — the server derives the rest of their group. */
  ownerId: string;
  email: string;
  alsoEmail: string[];
  /** The address came from a relaxed name match, not an exact one. */
  uncertain: boolean;
  /** Partnerships whose K-1 is already uploaded for them. */
  properties: string[];
  /** Interests they hold with NO K-1 uploaded yet. */
  outstanding: number;
};

const LABEL: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
  textTransform: "uppercase", color: "var(--muted)",
};

export function SendAllModal({
  rows, year, noEmailCount, busy, onSend, onClose,
}: {
  rows: SendAllRow[];
  year: number;
  /** Investors a send cannot reach — stated, never quietly dropped. */
  noEmailCount: number;
  busy: boolean;
  onSend: (ownerIds: string[]) => void;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [busy, onClose]);

  const uncertain = rows.filter((r) => r.uncertain);
  const partial = rows.filter((r) => r.outstanding > 0);
  const docs = rows.reduce((n, r) => n + r.properties.length, 0);

  const dialog = (
    <div
      onClick={() => { if (!busy) onClose(); }}
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
        aria-label="Email every investor"
        className="card"
        style={{ width: 660, maxWidth: "100%", textAlign: "left", padding: 0, boxShadow: "0 30px 70px rgba(15,23,42,0.38)" }}
      >
        <div style={{ padding: "16px 18px 12px", borderBottom: "1px solid var(--border)" }}>
          <div style={LABEL}>Send {year} Schedule K-1s</div>
          <div style={{ fontSize: 21, fontWeight: 800, marginTop: 4 }}>
            Email {rows.length} investor{rows.length === 1 ? "" : "s"}
          </div>
          <div className="muted" style={{ fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>
            {docs} K-1{docs === 1 ? "" : "s"} become readable. Each investor gets their own link and
            their own PIN, as two separate emails.
          </div>
        </div>

        {/* The things worth stopping on, before the list rather than inside it. */}
        <div style={{ padding: "12px 18px 0", display: "grid", gap: 8 }}>
          {uncertain.length > 0 && (
            <Note tone="amber" title={`${uncertain.length} address${uncertain.length === 1 ? "" : "es"} matched on name — check before sending`}>
              Found by a loosened name match rather than an exact one. A wrong address here mails one
              investor&rsquo;s tax document to another person: {uncertain.map((r) => r.name).join(", ")}.
            </Note>
          )}
          {noEmailCount > 0 && (
            <Note tone="neutral" title={`${noEmailCount} investor${noEmailCount === 1 ? "" : "s"} skipped — no address on file`}>
              They are not in this send and will receive nothing. Add an address on their row to include them.
            </Note>
          )}
          {partial.length > 0 && (
            <Note tone="neutral" title={`${partial.length} will see fewer K-1s than they hold`}>
              Their remaining partnerships have no K-1 uploaded yet. Those appear on the same link as
              soon as you import them — no second send needed.
            </Note>
          )}
        </div>

        {/* Every recipient, named. A count is not something anyone can agree to
            when each row is a document going to a real person. */}
        <div style={{ padding: "12px 18px 0" }}>
          <div style={LABEL}>Goes to</div>
        </div>
        <div style={{ maxHeight: 280, overflowY: "auto", padding: "6px 18px 0" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <tbody>
              {rows.map((r) => (
                <tr key={r.ownerId} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "8px 0", verticalAlign: "top" }}>
                    <div style={{ fontWeight: 700 }}>{r.name}</div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 1, wordBreak: "break-all" }}>
                      {r.email}
                      {r.alsoEmail.map((e) => <span key={e}> · cc {e}</span>)}
                    </div>
                  </td>
                  <td style={{ padding: "8px 0", textAlign: "right", verticalAlign: "top", whiteSpace: "nowrap" }}>
                    {r.uncertain && <Pill tone={TONE_AMBER}>CHECK</Pill>}{" "}
                    <Pill tone={TONE_NEUTRAL}>
                      {r.properties.length} K-1{r.properties.length === 1 ? "" : "s"}
                    </Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ padding: "14px 18px 16px", borderTop: "1px solid var(--border)", marginTop: 12 }}>
          <div className="muted" style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 10 }}>
            <b>This cannot be undone.</b> An investor cannot be un-emailed. Revoking a link afterwards
            stops it opening, but the message has gone.
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <button type="button" className="btn" onClick={onClose} disabled={busy} style={{ fontSize: 13, fontWeight: 700 }}>
              Cancel
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={busy}
              onClick={() => onSend(rows.map((r) => r.ownerId))}
              style={{ fontSize: 13, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 7 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 5L2 7" /></svg>
              {busy ? "Sending…" : `Send to ${rows.length}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return mounted ? createPortal(dialog, document.body) : null;
}

function Note({ tone, title, children }: { tone: "amber" | "neutral"; title: string; children: React.ReactNode }) {
  const amber = tone === "amber";
  return (
    <div style={{
      borderRadius: 9, padding: "9px 12px", fontSize: 12.5, lineHeight: 1.5,
      background: amber ? "rgba(217,119,6,0.08)" : "rgba(15,23,42,0.035)",
      border: `1px solid ${amber ? "rgba(217,119,6,0.35)" : "var(--border)"}`,
    }}>
      <div style={{ fontWeight: 700, color: amber ? "#b45309" : "var(--text)" }}>{title}</div>
      <div className="muted" style={{ marginTop: 2 }}>{children}</div>
    </div>
  );
}

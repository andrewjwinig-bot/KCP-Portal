"use client";

// One email as it went to a tenant: the headers, the rendered body, what was
// attached, and an .eml download that opens in Outlook as the record. Shared by
// Receipt Reconciliation and the Monthly Statements roster's correspondence.
// `src` is the JSON URL; `${src}&format=eml|pdf` serve the file and attachment.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Pill, TONE_AMBER } from "@/app/components/Pill";

type Email = {
  tenantName: string; sentAt: string; sentBy: string | null; from: string | null; to: string[]; bcc: string | null;
  replyTo: string | null; subject: string; html: string | null; text: string | null; messageId: string | null;
  testMode: boolean; attachmentName: string | null; respondByISO?: string | null; summary?: string | null;
};

const SECTION: React.CSSProperties = { fontSize: "var(--fs-11)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" };
const longDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

export function SentEmailModal({ src, onClose }: { src: string; onClose: () => void }) {
  const [e, setE] = useState<Email | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetch(src, { cache: "no-store" })
      .then(async (r) => { const j = await r.json(); if (!live) return; if (!r.ok) setErr(j.error ?? "Could not open it."); else setE(j.email); })
      .catch(() => live && setErr("Could not open it."));
    return () => { live = false; };
  }, [src]);
  useEffect(() => {
    const k = (ev: KeyboardEvent) => { if (ev.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  if (typeof document === "undefined") return null;
  const row = (label: string, value: React.ReactNode) => (
    <div style={{ display: "grid", gridTemplateColumns: "92px 1fr", gap: 8, alignItems: "baseline" }}>
      <span style={SECTION}>{label}</span><span className="small" style={{ wordBreak: "break-word" }}>{value}</span>
    </div>
  );
  const body = e?.html ?? (e?.text ? `<pre style="font-family:Arial,Helvetica,sans-serif;font-size:14px;white-space:pre-wrap;margin:0">${esc(e.text)}</pre>` : null);
  return createPortal(
    <div role="dialog" aria-modal="true" onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", display: "grid", placeItems: "center", zIndex: 1000, padding: 16 }}>
      <div className="card" onClick={(ev) => ev.stopPropagation()} style={{ width: "min(820px, 100%)", maxHeight: "92vh", display: "grid", gridTemplateRows: "auto auto 1fr auto", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 18, fontWeight: 800, flex: 1 }}>Sent email{e ? ` — ${e.tenantName}` : ""}</div>
          {e?.testMode && <Pill tone={TONE_AMBER}>TEST MODE · NOT DELIVERED</Pill>}
          <button className="btn sm" onClick={onClose} title="Close">✕</button>
        </div>
        {err ? <div className="small" style={{ color: "#b91c1c" }}>{err}</div> : !e ? <div className="muted small">Opening…</div> : (
          <div style={{ display: "grid", gap: 4 }}>
            {row("Sent", <>{new Date(e.sentAt).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" })}{e.sentBy ? ` · by ${e.sentBy}` : ""}</>)}
            {e.from && row("From", e.from)}
            {row("To", e.to.join(", "))}
            {e.bcc && row("Bcc", e.bcc)}
            {e.replyTo && row("Reply-To", e.replyTo)}
            {row("Subject", <b>{e.subject}</b>)}
            {e.respondByISO && row("Answer by", longDate(e.respondByISO))}
            {row("Message ID", e.messageId ? <code style={{ fontSize: "var(--fs-12)" }}>{e.messageId}</code> : <span className="muted">none on file</span>)}
            {row("Attached", e.attachmentName ? <a href={`${src}&format=pdf`} target="_blank" rel="noreferrer">{e.attachmentName}</a> : <span className="muted">nothing</span>)}
          </div>
        )}
        {e ? (body
          ? <iframe title="Email as sent" sandbox="" srcDoc={body} style={{ width: "100%", minHeight: 320, height: "100%", border: "1px solid var(--border)", borderRadius: 8, background: "#fff" }} />
          : <div className="muted small" style={{ border: "1px dashed var(--border)", borderRadius: 8, padding: 14 }}>{e.summary ?? "The wording of this email was not kept."}</div>
        ) : <div />}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span className="muted small">The archived copy — the exact wording, recipients and attachment that went. The Message ID finds it in Postmark&rsquo;s activity log.</span>
          {e && body && <a className="btn primary" style={{ textDecoration: "none" }} href={`${src}&format=eml`}>Download .eml</a>}
        </div>
      </div>
    </div>,
    document.body,
  );
}

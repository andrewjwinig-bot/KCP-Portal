"use client";

// The quarter's send, under the worksheet's Quarterly Statement: what went (or
// is held, or is next), and a Send button that opens the same kind of confirm
// as the Allocated Expenses send — tiles, the email exactly as it goes, the
// PDF to open, and who receives it. The GL import sends a quarter on its own
// (lib/cam/retail/quarterlySend.ts); this is the way to send one by hand,
// release a held one, or re-send.

import { useState } from "react";
import { createPortal } from "react-dom";
import { Pill, StatPill, TONE_AMBER, TONE_GREEN, TONE_NEUTRAL } from "../components/Pill";
import type { Quarter } from "@/lib/cam/retail/quarterly";

export type QuarterSendRecord = {
  status: "sent" | "held" | "sending";
  sentAt?: string | null;
  sentBy?: string | null;
  to?: string;
  total?: number;
  testMode?: boolean;
  auto?: boolean;
  outside?: boolean;
  heldReasons?: string[];
  lastError?: string;
  hasDetail?: boolean;
};

type Preview = {
  to: string; from: string; bcc: string;
  subject: string; body: string; attachmentName: string;
  figures: { camBalance: number; retDue: number; total: number };
  ready: boolean; maxPosted: number; lastMonth: number;
  auto: boolean; spikes: string[];
  record: QuarterSendRecord | null;
};

const money0 = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
const secLabel: React.CSSProperties = { fontSize: "var(--fs-11)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)" };

export default function QuarterlySend({ billingKey, year, quarter, record, name, onSent }: {
  billingKey: string; year: number; quarter: Quarter; name: string;
  record: QuarterSendRecord | null | undefined;
  onSent: (r: QuarterSendRecord) => void;
}) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const qs = `key=${encodeURIComponent(billingKey)}&year=${year}&quarter=${quarter}`;
  const sent = record?.status === "sent";

  async function openConfirm() {
    setOpen(true); setPreview(null); setError(null);
    const r = await fetch(`/api/cam-recon/quarterly/send?${qs}`, { cache: "no-store" }).catch(() => null);
    const j = r ? await r.json().catch(() => null) : null;
    if (!r?.ok || !j) setError(j?.error ?? "Couldn't load the send."); else setPreview(j);
  }

  async function send() {
    setSending(true); setError(null);
    const r = await fetch("/api/cam-recon/quarterly/send", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: billingKey, year, quarter, force: sent || !preview?.ready }),
    }).catch(() => null);
    const j = r ? await r.json().catch(() => null) : null;
    setSending(false);
    if (!j?.ok || !j.record) { setError(j?.error ?? "The email could not be sent."); return; }
    onSent(j.record);
    setOpen(false);
  }

  const status = sent ? (
    record!.outside
      ? <Pill tone={TONE_GREEN}>Sent by hand</Pill>
      : <Pill tone={TONE_GREEN}>Sent {record!.sentAt ? when(record!.sentAt) : ""}</Pill>
  ) : record?.status === "held" ? <Pill tone={TONE_AMBER}>Held for review</Pill> : <Pill tone={TONE_NEUTRAL}>Not sent</Pill>;

  return (
    <div style={{ marginBottom: 12, maxWidth: 640, padding: "10px 12px", border: "1px solid var(--border)", borderLeft: `3px solid ${sent ? TONE_GREEN.fg : "var(--brand)"}`, borderRadius: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      {status}
      <span className="small muted" style={{ flex: 1, minWidth: 220 }}>
        {sent && !record!.outside && <>To {record!.to}{record!.auto ? " · sent automatically on the GL import" : record!.sentBy ? ` · by ${record!.sentBy}` : ""}{record!.total != null ? ` · ${money0(record!.total)}` : ""}{record!.testMode ? " · TEST MODE — nothing delivered" : ""}</>}
        {sent && record!.outside && <>Emailed before the portal sent it.</>}
        {sent && record!.hasDetail && <> · GL detail saved as sent</>}
        {record?.status === "held" && <>Not sent automatically: {(record.heldReasons ?? []).join("; ") || record.lastError}</>}
        {!record && <>Goes out on its own when the GL for the quarter&rsquo;s last month is imported.</>}
      </span>
      <a className="btn sm" href={`/api/cam-recon/quarterly/send?${qs}&detail=1`} target="_blank" rel="noreferrer">GL Detail (PDF)</a>
      <button type="button" className={sent ? "btn sm" : "btn sm primary"} onClick={() => void openConfirm()}>
        {sent ? `Re-send ${quarter}` : `Send ${quarter} to ${name}`}
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div onClick={() => !sending && setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 130, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "60px 16px", overflowY: "auto" }}>
          <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Send ${quarter} ${year} to ${name}`}
            style={{ background: "var(--card)", borderRadius: 12, width: "100%", maxWidth: 640, boxShadow: "0 20px 60px rgba(0,0,0,0.35)", borderTop: "3px solid var(--brand)" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
              <div style={secLabel}>{sent ? "Re-send" : "Send"} quarterly CAM and tax</div>
              <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>{name} · {quarter} {year}</div>
            </div>
            {!preview && !error && <div className="muted small" style={{ padding: "16px 18px" }}>Building the statement…</div>}
            {preview && (
              <>
                <div className="pills" style={{ padding: "12px 18px 0" }}>
                  <StatPill label="Total due" value={money0(preview.figures.total)} total />
                  <StatPill label="CAM" value={money0(preview.figures.camBalance)} />
                  <StatPill label="Tax" value={money0(preview.figures.retDue)} />
                </div>
                {!preview.ready && (
                  <div className="small" style={{ margin: "12px 18px 0", color: "#b45309", fontWeight: 600 }}>
                    The GL is posted through month {preview.maxPosted}; {quarter} ends in month {preview.lastMonth}. Sending now bills a quarter that isn&rsquo;t complete.
                  </div>
                )}
                {preview.spikes.length > 0 && (
                  <div className="small" style={{ margin: "12px 18px 0", padding: "8px 10px", borderRadius: 8, background: TONE_AMBER.bg, color: TONE_AMBER.fg }}>
                    <b>Look before sending:</b> {preview.spikes.join("; ")}. Correct a line on the worksheet if it doesn&rsquo;t belong in Wawa&rsquo;s CAM.
                  </div>
                )}
                {sent && (
                  <div className="small" style={{ margin: "12px 18px 0", color: "#b45309", fontWeight: 600 }}>
                    This quarter was already sent{record?.sentAt ? ` on ${when(record.sentAt)}` : " by hand"} — this sends it again.
                  </div>
                )}
                <div style={{ margin: "14px 18px 0", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
                  <div className="small" style={{ padding: "8px 12px", background: "var(--hover, rgba(15,23,42,0.03))", borderBottom: "1px solid var(--border)", lineHeight: 1.6 }}>
                    <div><span className="muted">From</span> {preview.from}</div>
                    <div><span className="muted">To</span> <b>{preview.to}</b></div>
                    <div><span className="muted">Bcc</span> {preview.bcc} <span className="muted">(your copy)</span></div>
                    <div><span className="muted">Subject</span> {preview.subject}</div>
                  </div>
                  <pre style={{ margin: 0, padding: "10px 12px", whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: "var(--fs-13)" }}>{preview.body}</pre>
                  <div className="small" style={{ padding: "8px 12px", borderTop: "1px solid var(--border)" }}>
                    📎 <a href={`/api/cam-recon/quarterly/send?${qs}&pdf=1`} target="_blank" rel="noreferrer" style={{ fontWeight: 600, color: "var(--brand)" }}>{preview.attachmentName}</a>
                    <span className="muted"> · backup if asked: </span>
                    <a href={`/api/cam-recon/quarterly/send?${qs}&detail=1`} target="_blank" rel="noreferrer" style={{ fontWeight: 600, color: "var(--brand)" }}>GL Detail (PDF)</a>
                    <span className="muted"> — not attached; saved with the send</span>
                  </div>
                </div>
              </>
            )}
            {error && <div className="small" style={{ padding: "12px 18px 0", color: "#b91c1c", fontWeight: 700 }}>{error}</div>}
            <div style={{ padding: "14px 18px", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="btn sm" disabled={sending} onClick={() => setOpen(false)}>Cancel</button>
              {preview && (
                <button type="button" className="btn sm primary" disabled={sending} onClick={() => void send()}>
                  {sending ? "Sending…" : `${sent ? "Re-send" : "Send"} to ${preview.to} · ${money0(preview.figures.total)}`}
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

"use client";

// Shared "Review before send to AvidXchange" gate + success confirmation, used
// by all three invoicers (Allocated, Credit Card, Payroll) so the review popup
// and the "✓ Sent" confirmation look and behave the same everywhere.
//
// The review modal is purely presentational — each page wires its own onConfirm
// (the allocated flow re-sends server-side from a staged GL; CC/payroll POST
// their client-built attachments to /api/avid-send). The success modal confirms
// what actually went out.

import { useMemo } from "react";

export type AvidProperty = { code: string; name: string; amount: number };

function money(n: number): string {
  return "$" + (n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const overlay: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 999,
  display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
};

function PropertyTable({ rows, total }: { rows: AvidProperty[]; total: number }) {
  return (
    <div className="tableWrap" style={{ overflowY: "auto", maxHeight: "46vh" }}>
      <table>
        <thead>
          <tr><th>Property</th><th style={{ textAlign: "right" }}>Amount</th></tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={2} className="muted" style={{ padding: "12px 4px" }}>No properties bill this run.</td></tr>
          )}
          {rows.map((b) => (
            <tr key={b.code}>
              <td><code style={{ fontSize: 12 }}>{b.code}</code> {b.name}</td>
              <td style={{ textAlign: "right" }}>{money(b.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr><td style={{ fontWeight: 700 }}>Total</td><td style={{ textAlign: "right", fontWeight: 800 }}>{money(total)}</td></tr>
        </tfoot>
      </table>
    </div>
  );
}

export function AvidReviewModal(props: {
  open: boolean;
  /** e.g. "Credit Card Expenses" */
  title: string;
  period: string;
  byProperty: AvidProperty[];
  total: number;
  invoiceCount?: number;
  /** File names that will be attached to the Avid email. */
  attachments?: string[];
  /** Extra note under the header (e.g. the payroll privacy reassurance). */
  note?: string;
  sending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { open, title, period, byProperty, total, invoiceCount, attachments, note, sending, onCancel, onConfirm } = props;
  const count = invoiceCount ?? byProperty.length;
  if (!open) return null;
  return (
    <div style={overlay} onClick={sending ? undefined : onCancel}>
      <div className="card" style={{ maxWidth: 560, width: "100%", maxHeight: "88vh", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 4 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>Review before sending</div>
            <b style={{ fontSize: 17 }}>{title} — {period}</b>
          </div>
          <button className="btn" style={{ padding: "4px 10px" }} disabled={sending} onClick={onCancel}>✕</button>
        </div>
        <div className="small muted" style={{ marginBottom: 10 }}>
          Confirm the per-building allocation below. On send, {count ? <><b>{count}</b> invoice{count === 1 ? "" : "s"} </> : null}
          {count ? "and the summary " : "the summary "}
          go to <b>AvidXchange</b> (<code style={{ fontSize: 11 }}>kormancommercial@avidbill.com</code>) for processing, cc Marie, Drew &amp; Harry. Nothing has been sent yet.
        </div>
        {note && (
          <div className="small" style={{ marginBottom: 10, padding: "7px 10px", borderRadius: 8, background: "rgba(11,74,125,0.06)", border: "1px solid rgba(11,74,125,0.25)", color: "#0b4a7d", fontWeight: 600 }}>
            {note}
          </div>
        )}
        <PropertyTable rows={byProperty} total={total} />
        {attachments && attachments.length > 0 && (
          <div className="small muted" style={{ marginTop: 10 }}>
            <b style={{ color: "var(--fg)" }}>Attachments:</b>
            <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
              {attachments.map((a) => <li key={a} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a}</li>)}
            </ul>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button className="btn" disabled={sending} onClick={onCancel}>Cancel</button>
          <button
            className="btn"
            style={{ background: "#16a34a", color: "#fff", borderColor: "transparent", fontWeight: 700, whiteSpace: "nowrap", opacity: sending ? 0.75 : 1 }}
            disabled={sending || byProperty.length === 0}
            onClick={onConfirm}
          >
            {sending ? "Sending…" : "Send to AvidXchange"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AvidSuccessModal(props: {
  open: boolean;
  title: string;
  period: string;
  byProperty: AvidProperty[];
  total: number;
  invoiceCount?: number;
  sentAt: string;
  /** false when mail isn't configured — reassures instead of over-claiming. */
  mailSent?: boolean;
  onClose: () => void;
}) {
  const { open, title, period, byProperty, total, invoiceCount, sentAt, mailSent = true, onClose } = props;
  const count = invoiceCount ?? byProperty.length;
  const when = useMemo(() => {
    const d = new Date(sentAt);
    return isNaN(d.getTime()) ? "" : d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  }, [sentAt]);
  if (!open) return null;
  return (
    <div style={overlay} onClick={onClose}>
      <div className="card" style={{ maxWidth: 520, width: "100%", maxHeight: "88vh", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ textAlign: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 44, lineHeight: 1 }}>{mailSent ? "✅" : "📄"}</div>
          <b style={{ fontSize: 18, display: "block", marginTop: 8 }}>
            {mailSent ? "Sent to AvidXchange" : "Prepared — mail not configured"}
          </b>
          <div className="small muted" style={{ marginTop: 4 }}>
            {mailSent
              ? <>{title} for <b>{period}</b> {count ? <>({count} invoice{count === 1 ? "" : "s"}) </> : null}were sent to AvidXchange for processing, cc Marie, Drew &amp; Harry.</>
              : <>{title} for <b>{period}</b> is ready, but email isn&rsquo;t configured in this environment, so nothing was transmitted.</>}
            {when ? <> · {when}</> : null}
          </div>
        </div>
        <PropertyTable rows={byProperty} total={total} />
        <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
          <button className="btn" style={{ background: "var(--navy)", color: "#fff", borderColor: "transparent", fontWeight: 700, padding: "8px 22px" }} onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

// Client helper: release a CC/payroll run to AvidXchange (POST /api/avid-send).
// Attachments are already-built, property-level Blobs. Returns the send result
// for the success modal. Throws on a hard failure so the caller can surface it.
export async function sendToAvid(args: {
  source: "credit-card" | "payroll";
  period: string;
  label?: string;
  byProperty: AvidProperty[];
  total: number;
  invoiceCount?: number;
  attachments: { name: string; blob: Blob; contentType: string }[];
}): Promise<{ sent: boolean; reason?: string; byProperty: AvidProperty[]; total: number; invoiceCount: number; sentAt: string }> {
  const chunk = 0x8000;
  const toB64 = async (blob: Blob) => {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
    return btoa(bin);
  };
  const attachments = await Promise.all(
    args.attachments.map(async (a) => ({ name: a.name, contentType: a.contentType, contentBase64: await toB64(a.blob) })),
  );
  const res = await fetch("/api/avid-send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: args.source, period: args.period, label: args.label,
      byProperty: args.byProperty, total: args.total, invoiceCount: args.invoiceCount,
      attachments,
    }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j?.error ?? "Failed to send to AvidXchange");
  return j;
}

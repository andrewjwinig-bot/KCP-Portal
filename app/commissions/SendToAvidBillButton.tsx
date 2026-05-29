"use client";

import { useState } from "react";

/** Section header used to separate Pending vs. Paid commission
 *  quarters on /commissions and /commissions/retail. Tone-tagged so
 *  the eye lands on the right group quickly: blue for pending, green
 *  for paid (matches the SENT TO AVIDXCHANGE badge). */
export function CommissionSectionHeading({
  label,
  count,
  tone,
  subtitle,
}: {
  label: string;
  count: number;
  tone: "blue" | "green";
  subtitle?: string;
}) {
  const accent = tone === "green" ? "#15803d" : "#0b4a7d";
  const bg     = tone === "green" ? "rgba(22,163,74,0.10)" : "rgba(11,74,125,0.08)";
  const border = tone === "green" ? "rgba(22,163,74,0.30)" : "rgba(11,74,125,0.25)";
  return (
    <div style={{
      padding: "10px 14px",
      borderRadius: 8,
      marginBottom: 10,
      background: bg,
      border: `1px solid ${border}`,
      display: "flex",
      alignItems: "baseline",
      gap: 10,
      flexWrap: "wrap",
    }}>
      <span style={{
        fontSize: 13, fontWeight: 800,
        letterSpacing: "0.06em", textTransform: "uppercase",
        color: accent,
      }}>
        {label}
      </span>
      <span className="muted small">{count} quarter{count === 1 ? "" : "s"}</span>
      {subtitle && (
        <span className="muted small" style={{ marginLeft: "auto", fontStyle: "italic" }}>
          {subtitle}
        </span>
      )}
    </div>
  );
}

/** Render an ISO timestamp as "MM/DD/YY". */
export function formatSentDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const mm = d.getMonth() + 1;
  const dd = d.getDate();
  const yy = String(d.getFullYear()).slice(-2);
  return `${mm}/${dd}/${yy}`;
}

function toMoney(n: number): string {
  return (Number(n) || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/** "Send to AvidBill" trigger button for a single quarter. Two-step
 *  flow: clicking the button POSTs `dryRun: true` first and shows a
 *  preview ("This will send N invoices totaling $X to
 *  kormancommercial@avidbill.com. Continue?"); confirm fires the real
 *  POST and renders the result. Idempotent on the server — a quarter
 *  that's already been sent reports `alreadySent: true` instead of
 *  re-billing.
 *
 *  Shared by /commissions (office) and /commissions/retail since
 *  both pages drive the same AvidBill batch. */
export function SendToAvidBillButton({ quarterLabel, onSent }: { quarterLabel: string; onSent?: () => void }) {
  type Preview = {
    ok: boolean;
    count: number;
    total: number;
    reason?: string;
    alreadySent?: boolean;
    dryRun?: boolean;
  };
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<Preview | null>(null);

  const ENDPOINT = "/api/commissions/avidbill-quarter";

  const post = async (dryRun: boolean): Promise<Preview> => {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quarterLabel, dryRun }),
    });
    return res.json();
  };

  const openPreview = async () => {
    setBusy(true);
    setPreview(null);
    setResult(null);
    try {
      const p = await post(true);
      setPreview(p);
      setConfirming(true);
    } finally {
      setBusy(false);
    }
  };

  const sendForReal = async () => {
    setBusy(true);
    try {
      const r = await post(false);
      setResult(r);
      setConfirming(false);
      if (r?.ok && r?.count > 0) onSent?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        className="btn large"
        onClick={openPreview}
        disabled={busy}
        title="Email all commission invoices for this quarter to kormancommercial@avidbill.com"
      >
        {busy && !confirming ? "Preparing…" : "Send to AvidXchange"}
      </button>

      {confirming && preview && (
        <div
          onClick={() => setConfirming(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 100,
            background: "rgba(15,23,42,0.55)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--card)", borderRadius: 12,
              maxWidth: 460, width: "100%", padding: 22,
              boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
              display: "flex", flexDirection: "column", gap: 14,
            }}
          >
            <div className="muted small" style={{ fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Send Commission Invoices
            </div>
            {preview.ok && preview.count > 0 ? (
              <>
                <div style={{ fontSize: 16, fontWeight: 700 }}>
                  {preview.count} invoice{preview.count === 1 ? "" : "s"} · {toMoney(preview.total)}
                </div>
                <div className="muted small">
                  Will email <b>kormancommercial@avidbill.com</b> with one PDF per commission in <b>{quarterLabel}</b>.
                  {preview.alreadySent && (
                    <div style={{ marginTop: 6, color: "#b45309" }}>
                      ⚠ Already sent for this quarter — clicking Send will be ignored unless we force it.
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button className="btn" onClick={() => setConfirming(false)} disabled={busy}>Cancel</button>
                  <button className="btn primary" onClick={sendForReal} disabled={busy || preview.alreadySent}>
                    {busy ? "Sending…" : "Send"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 15 }}>
                  Nothing to send — {preview.reason ?? "no commissions for this quarter"}.
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button className="btn" onClick={() => setConfirming(false)}>Close</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {result && (
        <div
          onClick={() => setResult(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 100,
            background: "rgba(15,23,42,0.55)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--card)", borderRadius: 12,
              maxWidth: 460, width: "100%", padding: 22,
              boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
              display: "flex", flexDirection: "column", gap: 14,
            }}
          >
            <div className="muted small" style={{ fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Result
            </div>
            {result.ok ? (
              <div style={{ fontSize: 16, fontWeight: 700, color: "#15803d" }}>
                ✓ Sent {result.count} invoice{result.count === 1 ? "" : "s"} · {toMoney(result.total)}
              </div>
            ) : (
              <div style={{ fontSize: 16, fontWeight: 700, color: "#b91c1c" }}>
                ✗ {result.reason ?? "Send failed"}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setResult(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

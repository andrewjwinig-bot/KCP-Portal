"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { StatPill } from "@/app/components/Pill";
import { th, thL, td, tdL } from "@/app/components/tableStyles";

const SEC_LABEL: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)" };

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

/** "Send to AvidXchange" button for a single quarter. The morning cron sends
 *  a closed quarter on its own; this sends it NOW — one invoice per email, no
 *  approval step — then the memo + GL import to Marie and the memo to Alison
 *  for her records. Two-step: a `dryRun` preview, then the real POST.
 *
 *  Shared by /commissions (office) and /commissions/retail since
 *  both pages drive the same AvidBill batch. */
export function SendToAvidBillButton({ quarterLabel, kind, onSent }: { quarterLabel: string; kind?: "office" | "retail"; onSent?: () => void }) {
  type Preview = {
    ok: boolean;
    count: number;
    total: number;
    reason?: string;
    alreadySent?: boolean;
    dryRun?: boolean;
    reviewer?: string;
    invoices?: { invoiceNumber: string; tenant: string; building: string; suite: string; commission: number; amount: number }[];
  };
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<Preview | null>(null);

  const ENDPOINT = "/api/commissions/avidbill-quarter";

  const commissionTotal = (preview?.invoices ?? []).reduce((s, i) => s + i.commission, 0);
  const n = preview?.count ?? 0;
  const recipients: [string, string][] = [
    ["AvidXchange", `${n} invoice${n === 1 ? "" : "s"}, each its own email, billed at the commission + 20%`],
    ...(kind === "retail"
      ? [
          ["Marie", "The GL import for each commission; the memo + control sheet when the quarter closes"],
          ["Harry", "Each commission before the 20% markup, for payroll"],
        ] as [string, string][]
      : [["Marie", "The memo + control sheet, and the GL import"]] as [string, string][]),
    ["Alison", "The memo, for her records"],
  ];

  const post = async (dryRun: boolean): Promise<Preview> => {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quarterLabel, dryRun, kind }),
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
        title="Send this quarter's invoices to AvidXchange, one per email"
      >
        {busy && !confirming ? "Preparing…" : "Send to AvidXchange"}
      </button>

      {confirming && preview && typeof document !== "undefined" && createPortal(
        // The same confirm as the Allocated Expenses send (InvoicerOverview):
        // brand-topped card, KPI tiles, the invoices that will go, and who
        // receives what.
        <div onClick={() => !busy && setConfirming(false)} style={{ position: "fixed", inset: 0, zIndex: 130, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "60px 16px", overflowY: "auto" }}>
          <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Send ${quarterLabel} commissions to AvidXchange`}
            style={{ background: "var(--card)", borderRadius: 12, width: "100%", maxWidth: 680, boxShadow: "0 20px 60px rgba(0,0,0,0.35)", borderTop: "3px solid var(--brand)" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
              <div style={SEC_LABEL}>Send to AvidXchange</div>
              <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>
                {kind === "retail" ? "Retail Leasing Commissions" : "Leasing Commissions"} · {quarterLabel}
              </div>
            </div>
            {preview.ok && preview.count > 0 ? (
              <>
                <div className="pills" style={{ padding: "12px 18px 0" }}>
                  <StatPill label="Total to bill" value={toMoney(preview.total)} total />
                  <StatPill label="Invoices" value={String(preview.count)} sub="one email each" />
                  <StatPill label="Commission" value={toMoney(commissionTotal)} sub="before the 20% markup" />
                </div>
                {preview.invoices && preview.invoices.length > 0 && (
                  <div style={{ padding: "12px 0 4px", maxHeight: 300, overflowY: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead><tr><th style={thL}>Invoice #</th><th style={thL}>Tenant</th><th style={th}>Commission</th><th style={th}>Billed</th></tr></thead>
                      <tbody>
                        {preview.invoices.map((i) => (
                          <tr key={i.invoiceNumber + i.tenant}>
                            <td style={tdL}><code style={{ fontSize: 12, fontWeight: 700, color: "var(--brand)" }}>{i.invoiceNumber}</code></td>
                            <td style={tdL}>{i.tenant || "—"}</td>
                            <td style={td}>{toMoney(i.commission)}</td>
                            <td style={{ ...td, fontWeight: 700 }}>{toMoney(i.amount)}</td>
                          </tr>
                        ))}
                        <tr style={{ fontWeight: 800 }}>
                          <td style={{ ...tdL, borderTop: "2px solid var(--border)" }} colSpan={2}>Total</td>
                          <td style={{ ...td, borderTop: "2px solid var(--border)" }}>{toMoney(commissionTotal)}</td>
                          <td style={{ ...td, borderTop: "2px solid var(--border)" }}>{toMoney(preview.total)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
                {/* Who gets what (owner: "just bullet who gets what"). */}
                <div style={{ padding: "10px 18px 0" }}>
                  <div style={SEC_LABEL}>Who gets what</div>
                  <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 4 }}>
                    <tbody>
                      {recipients.map(([who, what]) => (
                        <tr key={who}>
                          <td style={{ ...tdL, fontWeight: 700, width: 120, whiteSpace: "nowrap" }}>{who}</td>
                          <td style={tdL}>{what}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="small" style={{ padding: "8px 18px 0", color: "var(--muted)", lineHeight: 1.5 }}>
                  This also happens on its own the morning after the quarter closes. Nothing already at AvidXchange is sent twice.
                </div>
              </>
            ) : (
              <div className="small" style={{ padding: "16px 18px" }}>
                Nothing to send — {preview.alreadySent ? "this quarter was already sent to AvidXchange" : preview.reason ?? "no commissions for this quarter"}.
              </div>
            )}
            <div style={{ padding: "14px 18px", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="btn sm" disabled={busy} onClick={() => setConfirming(false)}>{preview.ok && preview.count > 0 ? "Cancel" : "Close"}</button>
              {preview.ok && preview.count > 0 && (
                <button type="button" className="btn sm primary" disabled={busy || preview.alreadySent} onClick={sendForReal}>
                  {busy ? "Sending…" : `Send ${preview.count} invoice${preview.count === 1 ? "" : "s"} · ${toMoney(preview.total)}`}
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body,
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
                ✓ Sent {result.count} invoice{result.count === 1 ? "" : "s"} · {toMoney(result.total)} to AvidXchange
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

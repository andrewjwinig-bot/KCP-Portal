"use client";

// Alison's quarter-end commission review, opened from the link she is emailed
// — no sign-in and no portal chrome. She approves the quarter's TOTAL, not
// each invoice (owner): the total leads, the invoices are listed beneath for
// reference with their PDFs, and one button sends them all to AvidXchange. Everything goes through
// `/api/commissions-review/[token]`, which checks the signed link on each call.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Pill, StatPill, TONE_AMBER, TONE_BLUE, TONE_GREEN } from "@/app/components/Pill";
import { td, tdL, th, thL } from "@/app/components/tableStyles";

const BRAND = "#0b4a7d";

type Invoice = {
  id: string; invoiceNumber: string; kind: "office" | "retail";
  building: string; suite: string; tenant: string; amount: number;
  status: "sent" | "approved" | "awaiting";
};
type Review = {
  quarterLabel: string; invoices: Invoice[]; awaiting: number; legacy: boolean;
  approvedAt: string | null; approvedBy: string | null; reviewer?: string;
};

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export default function CommissionReviewPage() {
  const params = useParams<{ token: string }>();
  const token = Array.isArray(params?.token) ? params.token[0] : params?.token ?? "";
  const base = `/api/commissions-review/${encodeURIComponent(token)}`;
  const [review, setReview] = useState<Review | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(base, { cache: "no-store" })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j?.error ?? "Couldn't load"); return j; })
      .then(setReview)
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load"));
  }, [base]);
  useEffect(load, [load]);

  const awaiting = useMemo(() => (review?.invoices ?? []).filter((i) => i.status === "awaiting"), [review]);
  const picked = awaiting;
  const pickedTotal = picked.reduce((s, i) => s + i.amount, 0);
  const total = (review?.invoices ?? []).reduce((s, i) => s + i.amount, 0);

  async function send() {
    setSending(true); setError(null);
    try {
      const r = await fetch(base, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: picked.map((i) => i.id) }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error ?? "Couldn't send");
      if (j.review) setReview(j.review);
      setDone(j.ok
        ? `${picked.length} invoice${picked.length === 1 ? "" : "s"} · ${money(pickedTotal)} sent to AvidXchange.`
        : `Approved — but not every invoice reached AvidXchange yet (${j.reason ?? "send incomplete"}). It finishes on its own tomorrow morning.`);
      setConfirming(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send");
    } finally {
      setSending(false);
    }
  }

  const statusPill = (s: Invoice["status"]) =>
    s === "sent" ? <Pill tone={TONE_GREEN}>SENT</Pill>
      : s === "approved" ? <Pill tone={TONE_BLUE}>SENDING</Pill>
      : <Pill tone={TONE_AMBER}>TO REVIEW</Pill>;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg, #f7f9fc)" }}>
      <header style={{ background: BRAND, color: "#fff", padding: "22px clamp(16px, 4vw, 40px)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ fontFamily: "'Arial Black', Arial, sans-serif", fontWeight: 900, fontSize: 22, letterSpacing: "-0.5px" }}>KORMAN</div>
          <div style={{ fontSize: 9.5, letterSpacing: "0.18em", color: "#bfdbfe" }}>COMMERCIAL PROPERTIES</div>
        </div>
      </header>
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "28px clamp(16px, 4vw, 40px) 72px" }}>
        {!review && !error && <div className="muted">Loading…</div>}
        {error && !review && <div className="card" style={{ padding: 20, color: "#b91c1c" }}>{error}</div>}
        {review && (
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)" }}>
                Leasing Commissions · Review before AvidXchange
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4 }}>{review.quarterLabel}</div>
              <div className="pills" style={{ marginTop: 14 }}>
                <StatPill label={awaiting.length ? "To approve" : "Total billed"} value={money(awaiting.length ? pickedTotal : total)} total />
                <StatPill label="Invoices" value={String(awaiting.length || review.invoices.length)} />
              </div>
            </div>

            {review.legacy ? (
              <div style={{ padding: 20 }}>This quarter was already sent to AvidXchange.</div>
            ) : review.invoices.length === 0 ? (
              <div style={{ padding: 20 }} className="muted">No commissions are logged for this quarter.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={thL}>Invoice</th>
                      <th style={thL}>Tenant</th>
                      <th style={thL}>Building · Suite</th>
                      <th style={th}>Amount</th>
                      <th style={thL}>Status</th>
                      <th style={th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {review.invoices.map((i) => (
                      <tr key={i.id}>
                        <td style={tdL}><code>{i.invoiceNumber}</code></td>
                        <td style={{ ...tdL, fontWeight: 600 }}>{i.tenant || "—"}</td>
                        <td style={tdL}>{i.building || "—"} · {i.suite || "—"}{i.kind === "retail" ? " · Retail" : ""}</td>
                        <td style={td}>{money(i.amount)}</td>
                        <td style={tdL}>{statusPill(i.status)}</td>
                        <td style={td}>
                          <a className="btn sm" href={`${base}/pdf?id=${encodeURIComponent(i.id)}`} target="_blank" rel="noreferrer">View PDF</a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ padding: "16px 20px", borderTop: "1px solid var(--border)", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              {done && <div style={{ color: "#15803d", fontWeight: 700 }}>✓ {done}</div>}
              {error && review && <div style={{ color: "#b91c1c", fontWeight: 600 }}>{error}</div>}
              {awaiting.length === 0 && !done && !review.legacy && review.invoices.length > 0 && (
                <div className="muted">Nothing left to review{review.approvedBy ? ` — approved by ${review.approvedBy}` : ""}.</div>
              )}
              {awaiting.length > 0 && !confirming && (
                <>
                  <span className="muted small">Nothing goes to AvidXchange until you approve.</span>
                  <button className="btn primary large" style={{ marginLeft: "auto" }} onClick={() => setConfirming(true)}>
                    Approve {money(pickedTotal)} &amp; send to AvidXchange
                  </button>
                </>
              )}
              {confirming && (
                <>
                  <span style={{ fontWeight: 600 }}>
                    Send {picked.length} invoice{picked.length === 1 ? "" : "s"} ({money(pickedTotal)}) to kormancommercial@avidbill.com, one per email?
                  </span>
                  <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                    <button className="btn" onClick={() => setConfirming(false)} disabled={sending}>Cancel</button>
                    <button className="btn primary" onClick={send} disabled={sending}>{sending ? "Sending…" : "Yes, send"}</button>
                  </span>
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

"use client";

// THE INVOICER'S FRONT PAGE, now that it runs itself (owner: "right now the
// page as it is doesnt really do anything"). Allocated Expenses go to
// AvidXchange on their own when the 2000 G&A GL is imported on Operating
// Statements, so the page answers three questions instead of offering an
// import:
//
//   1. WAS IT SENT — the latest month, big and green, with when / who / how
//      much underneath; click it for that month's invoices. A month that was
//      prepared but not sent (held, or a failed send) says so in amber.
//   2. WHAT IS STILL OPEN — the carried-forward balances by property: G&A
//      allocated under the $100-per-account threshold, held until it crosses
//      it (December bills everything).
//   3. EVERY PRIOR MONTH — one row each; click for the by-building split and
//      the invoice PDFs exactly as they were sent (view one, or the month as
//      a ZIP — `/api/allocation/invoices`).
//
// Every row answers "did it reach AvidXchange?" with ONE status from the
// history route: sent · sent in a batch (a Jan–Aug send covers August) ·
// finalized with NO send on record (closed by the old manual Finalize — check
// AvidXchange) · NOT SENT, which carries a Send button, because a month that
// hasn't gone must be sendable from right here.

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { StatPill, Pill, TONE_AMBER, TONE_NEUTRAL } from "@/app/components/Pill";
import { th, thL, td, tdL } from "@/app/components/tableStyles";
import { HoverCard } from "@/app/components/HoverCard";
import type { PropertyCarry } from "@/lib/allocated-invoicer/carryover";
import { periodKey } from "@/lib/invoicing/unsent";

type HistoryPeriod = {
  period: string; label: string; sentAt: string | null; sentBy: string | null;
  total: number | null; invoiceCount: number | null;
  byProperty: { code: string; name: string; amount: number }[];
  invoices: { fileName: string; propertyLabel: string }[] | null;
  staged?: boolean;
  status: "sent" | "sent-in-batch" | "finalized" | "not-sent" | "run-only";
  batch?: string | null;
  sendable?: boolean;
};

type SendPreview = {
  period: string;
  byProperty: { code: string; name: string; amount: number }[];
  total: number;
  invoiceCount: number;
  months: { statementMonth: string; label: string; total: number; supplemental?: boolean }[];
  nothingToSend: boolean;
};

const money = (n: number | null | undefined) => n == null ? "—" : "$" + (Math.round(n * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
const GREEN = "#15803d";
const secLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" };

export function InvoicerOverview({ carryover, propName, onLoadGl, loadableMonth, onSent, toolbar }: {
  carryover: Record<string, PropertyCarry>;
  propName: (id: string) => string;
  /** Load the imported 2000 GL into the page (review a held month, or
   *  regenerate a month that predates the archive). */
  onLoadGl: () => void;
  /** The statement month that GL is for (`YYYY-MM`), if one is imported. */
  loadableMonth: string | null;
  /** After a send from here — the page refreshes its carryover. */
  onSent?: () => void;
  toolbar?: React.ReactNode;
}) {
  const [periods, setPeriods] = useState<HistoryPeriod[] | null>(null);
  const [open, setOpen] = useState<HistoryPeriod | null>(null);
  const [openProp, setOpenProp] = useState<string | null>(null);

  const [sending, setSending] = useState<string | null>(null);
  const [sendMsg, setSendMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const loadHistory = () => fetch("/api/allocation/history", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => { const list: HistoryPeriod[] = j?.periods ?? []; setPeriods(list); return list; })
    .catch(() => { setPeriods([]); return [] as HistoryPeriod[]; });
  useEffect(() => { loadHistory(); }, []);

  // The Send button opens a CONFIRM that previews the send — a dry run of the
  // very computation the send makes (`?preview=1`), so the buildings and amounts
  // read before sending are the ones that go. A send is irreversible: Avid
  // starts paying invoices once they land.
  const [confirm, setConfirm] = useState<{ p: HistoryPeriod; preview: SendPreview | null; error: string | null } | null>(null);
  function askSend(p: HistoryPeriod) {
    setConfirm({ p, preview: null, error: null });
    fetch(`/api/allocation/pending-send?period=${encodeURIComponent(p.period)}&preview=1`, { cache: "no-store" })
      .then(async (r) => { const j = await r.json().catch(() => ({})); return r.ok ? { preview: j.preview as SendPreview, error: null } : { preview: null, error: j.error || `Couldn't prepare the send (${r.status}).` }; })
      .catch((e) => ({ preview: null, error: e instanceof Error ? e.message : "Couldn't prepare the send." }))
      .then((res) => {
        setConfirm((c) => (c && c.p.period === p.period ? { ...c, ...res } : c));
        // Nothing left to bill — the server just closed it; refresh the rows.
        if (res.preview?.nothingToSend) loadHistory();
      });
  }
  async function send(p: HistoryPeriod) {
    setSending(p.period); setSendMsg(null);
    try {
      const r = await fetch("/api/allocation/pending-send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ period: p.period }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) setSendMsg({ ok: false, text: j.error || `Send failed (${r.status}).` });
      else setSendMsg({ ok: true, text: `${p.label} sent to AvidXchange.` });
      setConfirm(null);
      const list = await loadHistory();
      setOpen((o) => (o ? list.find((x) => x.period === o.period) ?? null : o));
      onSent?.();
    } catch (e) {
      setSendMsg({ ok: false, text: e instanceof Error ? e.message : "Send failed." });
    } finally { setSending(null); }
  }
  const sendBtn = (p: HistoryPeriod, primary = true) => (
    <button type="button" className={`btn sm${primary ? " primary" : ""}`} disabled={!!sending}
      onClick={(e) => { e.stopPropagation(); askSend(p); }} style={{ whiteSpace: "nowrap" }}>
      {sending === p.period ? "Sending…" : "Send to AvidXchange"}
    </button>
  );
  const statusCell = (p: HistoryPeriod) => {
    switch (p.status) {
      case "sent": return <>{fmtDate(p.sentAt)}{p.sentBy ? <span className="muted"> · {p.sentBy}</span> : null}</>;
      case "sent-in-batch": return <>{fmtDate(p.sentAt)}<span className="muted"> · in the {p.batch} batch</span></>;
      case "finalized": return <HoverCard title="Finalized — no send on record" rows={[]} width={300}
        body={<div style={{ fontSize: 12.5, lineHeight: 1.45 }}>Its carryover was closed (the old manual Finalize, or a later batch), but the portal has no record of the invoices reaching AvidXchange. Check AvidXchange for this month.</div>}>
        <Pill tone={TONE_NEUTRAL}>FINALIZED · NO SEND RECORD</Pill></HoverCard>;
      case "not-sent": return <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}><Pill tone={TONE_AMBER}>NOT SENT</Pill>{sendBtn(p, false)}</span>;
      default: return <span className="muted">Processed — never staged to send</span>;
    }
  };
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !confirm) setOpen(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, confirm]);

  // The hero names a MONTH ("August 2026 has been sent"), not a range row.
  const lastSent = periods?.find((p) => p.sentAt && !p.period.includes("_to_")) ?? periods?.find((p) => p.sentAt) ?? null;
  const staged = periods?.filter((p) => p.status === "not-sent") ?? [];

  // Open balances: each property's held accounts, largest first.
  const balances = useMemo(() => Object.values(carryover)
    .map((pc) => {
      const accounts = Object.values(pc.accounts).filter((a) => a.heldTotal > 0.005).sort((a, b) => b.heldTotal - a.heldTotal);
      return { id: pc.propertyId, accounts, total: accounts.reduce((s, a) => s + a.heldTotal, 0),
        since: accounts.map((a) => a.sinceMonth).sort()[0] ?? null };
    })
    .filter((b) => b.total > 0.005)
    .sort((a, b) => b.total - a.total), [carryover]);
  const heldTotal = balances.reduce((s, b) => s + b.total, 0);

  return (
    <>
      {/* 1 — WAS IT SENT */}
      <div className="card" style={{ padding: "18px 20px", borderColor: lastSent ? "rgba(22,163,74,0.45)" : undefined, background: lastSent ? "rgba(22,163,74,0.06)" : undefined }}>
        {periods === null ? (
          <div className="muted small">Loading…</div>
        ) : lastSent ? (
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" aria-hidden style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="11" fill={GREEN} />
              <path d="M6.8 12.4l3.3 3.3 7-7.2" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 24, fontWeight: 900, color: GREEN, lineHeight: 1.2 }}>{lastSent.label} has been sent to AvidXchange</div>
              <button type="button" onClick={() => setOpen(lastSent)}
                style={{ marginTop: 4, padding: 0, border: "none", background: "none", cursor: "pointer", color: "var(--text)", fontSize: 13.5, textAlign: "left" }}>
                Sent {fmtDate(lastSent.sentAt)}{lastSent.sentBy ? ` by ${lastSent.sentBy}` : ""}{lastSent.batch ? ` in the ${lastSent.batch} batch` : ""}{lastSent.total != null ? <> · <b>{money(lastSent.total)}</b></> : null}
                {lastSent.invoiceCount ? ` · ${lastSent.invoiceCount} invoice${lastSent.invoiceCount === 1 ? "" : "s"}` : ""}
                <span style={{ color: "#0b4a7d", fontWeight: 700, marginLeft: 8 }}>View invoices →</span>
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Nothing sent to AvidXchange yet</div>
            <div className="muted small" style={{ marginTop: 4 }}>The invoices send themselves when the month&rsquo;s 2000 G&amp;A GL is imported on Operating Statements.</div>
          </div>
        )}
        {staged.map((p) => (
          <div key={p.period} style={{ marginTop: 14, padding: "10px 12px", borderRadius: 8, background: "rgba(217,119,6,0.08)", border: "1px solid rgba(217,119,6,0.30)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <Pill tone={TONE_AMBER}>NOT SENT</Pill>
            <span style={{ fontSize: 13.5, flex: 1, minWidth: 220 }}><b>{p.label}</b> was prepared ({money(p.total)}{p.invoiceCount ? `, ${p.invoiceCount} invoice${p.invoiceCount === 1 ? "" : "s"}` : ""}) but hasn&rsquo;t gone to AvidXchange.</span>
            {loadableMonth && periodKey(loadableMonth) === periodKey(p.period) && (
              <button type="button" className="btn sm" onClick={onLoadGl}>Review first</button>
            )}
            {sendBtn(p)}
          </div>
        ))}
        {sendMsg && (
          <div className="small" style={{ marginTop: 10, fontWeight: 700, color: sendMsg.ok ? GREEN : "#b91c1c" }}>{sendMsg.text}</div>
        )}
      </div>

      {/* 2 — WHAT IS STILL OPEN */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: "12px 14px", display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 16, fontWeight: 800 }}>Open Balances by Property</span>
          <span className="muted small">Allocated under $100 per account — held and carried forward until it crosses $100; December bills everything.</span>
        </div>
        {balances.length === 0 ? (
          <div className="muted small" style={{ padding: "0 14px 14px" }}>Nothing carried forward — every allocation has been billed.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={thL}>Property</th><th style={th}>Accounts</th><th style={th}>Held since</th><th style={th}>Open balance</th></tr></thead>
            <tbody>
              {balances.map((b) => [
                <tr key={b.id} onClick={() => setOpenProp((p) => (p === b.id ? null : b.id))} style={{ cursor: "pointer" }}>
                  <td style={tdL}>
                    <span className="muted" style={{ display: "inline-block", width: 14 }}>{openProp === b.id ? "▾" : "▸"}</span>
                    <code style={{ fontSize: 12, fontWeight: 700, color: "var(--brand)", marginRight: 6 }}>{b.id}</code>{propName(b.id)}
                  </td>
                  <td style={td}>{b.accounts.length}</td>
                  <td style={td}>{b.since ?? "—"}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{money(b.total)}</td>
                </tr>,
                ...(openProp === b.id ? b.accounts.map((a) => (
                  <tr key={`${b.id}-${a.accountCode}`} style={{ background: "rgba(15,23,42,0.025)" }}>
                    <td style={{ ...tdL, paddingLeft: 40 }}><code style={{ fontSize: 11.5 }}>{a.accountCode}</code> {a.accountName}</td>
                    <td style={{ ...td, color: "var(--muted)" }}>{a.months.length} mo</td>
                    <td style={{ ...td, color: "var(--muted)" }}>{a.sinceMonth}</td>
                    <td style={td}>{money(a.heldTotal)}</td>
                  </tr>
                )) : []),
              ])}
              <tr style={{ fontWeight: 800 }}>
                <td style={{ ...tdL, borderTop: "2px solid var(--border)" }}>Total</td>
                <td style={{ ...td, borderTop: "2px solid var(--border)" }} /><td style={{ ...td, borderTop: "2px solid var(--border)" }} />
                <td style={{ ...td, borderTop: "2px solid var(--border)" }}>{money(heldTotal)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      {/* 3 — EVERY PRIOR MONTH */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 16, fontWeight: 800 }}>Monthly History</span>
          <span className="muted small" style={{ flex: 1 }}>Click a month for its split by building and the invoices as sent.</span>
          {toolbar}
        </div>
        {periods && periods.length > 0 ? (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={thL}>Month</th><th style={thL}>Sent to AvidXchange</th><th style={th}>Invoices</th><th style={th}>Total</th></tr></thead>
            <tbody>
              {periods.map((p) => (
                <tr key={p.period} onClick={() => setOpen(p)} style={{ cursor: "pointer" }}>
                  <td style={{ ...tdL, fontWeight: 700 }}>{p.label}</td>
                  <td style={tdL}>{statusCell(p)}</td>
                  <td style={td}>{p.invoiceCount ?? p.invoices?.length ?? "—"}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{money(p.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : periods ? (
          <div className="muted small" style={{ padding: "0 14px 14px" }}>No months yet.</div>
        ) : null}
      </div>

      {open && typeof document !== "undefined" && createPortal(
        <div onClick={() => setOpen(null)} style={{ position: "fixed", inset: 0, zIndex: 120, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "60px 16px", overflowY: "auto" }}>
          <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`${open.label} allocated invoices`}
            style={{ background: "var(--card)", borderRadius: 12, width: "100%", maxWidth: 820, boxShadow: "0 20px 60px rgba(0,0,0,0.35)", borderTop: "3px solid var(--brand)" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "flex-start", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={secLabel}>Allocated Expenses</div>
                <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>{open.label}</div>
              </div>
              {open.invoices && open.invoices.length > 0 && (
                <a className="btn sm primary" style={{ textDecoration: "none" }} href={`/api/allocation/invoices?period=${encodeURIComponent(open.period)}`}>Download all (ZIP)</a>
              )}
              <button type="button" className="btn sm" onClick={() => setOpen(null)}>Close</button>
            </div>
            <div className="pills" style={{ padding: "12px 18px 0" }}>
              <StatPill label="Total" value={money(open.total)} total />
              <StatPill label="Invoices" value={String(open.invoiceCount ?? open.invoices?.length ?? "—")} />
              <StatPill label="Sent to AvidXchange" value={open.sentAt ? fmtDate(open.sentAt) : open.status === "finalized" ? "No record" : "Not sent"}
                sub={open.batch ? `in the ${open.batch} batch` : open.sentBy ?? undefined} />
            </div>
            {open.status === "not-sent" && (
              <div style={{ margin: "12px 18px 0", padding: "10px 12px", borderRadius: 8, background: "rgba(217,119,6,0.08)", border: "1px solid rgba(217,119,6,0.30)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <Pill tone={TONE_AMBER}>NOT SENT</Pill>
                <span style={{ fontSize: 13.5, flex: 1 }}>This month hasn&rsquo;t gone to AvidXchange.</span>
                {sendBtn(open)}
              </div>
            )}
            {open.status === "finalized" && (
              <div className="small" style={{ margin: "12px 18px 0", color: "var(--muted)" }}>
                Finalized, but the portal has no record of these invoices reaching AvidXchange — check AvidXchange for this month.
              </div>
            )}
            <div style={{ padding: "12px 0 6px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><th style={thL}>Property</th><th style={th}>Allocated</th><th style={th}>Invoice</th></tr></thead>
                <tbody>
                  {(open.byProperty.length ? open.byProperty : (open.invoices ?? []).map((i) => ({ code: i.propertyLabel.split(" ")[0], name: i.propertyLabel.split(" — ")[1] ?? "", amount: NaN })))
                    .map((b, i) => {
                      const inv = open.invoices?.find((x) => x.propertyLabel.startsWith(`${b.code} `)) ?? null;
                      const url = inv ? `/api/allocation/invoices?period=${encodeURIComponent(open.period)}&file=${encodeURIComponent(inv.fileName)}` : null;
                      return (
                        <tr key={`${b.code}-${i}`}>
                          <td style={tdL}><code style={{ fontSize: 12, fontWeight: 700, color: "var(--brand)", marginRight: 6 }}>{b.code}</code>{b.name || propName(b.code)}</td>
                          <td style={td}>{Number.isFinite(b.amount) ? money(b.amount) : "—"}</td>
                          <td style={{ ...td, whiteSpace: "nowrap" }}>
                            {url ? <>
                              <a href={url} target="_blank" rel="noreferrer" style={{ color: "#0b4a7d", fontWeight: 700 }}>View</a>
                              <span className="muted"> · </span>
                              <a href={`${url}&download=1`} style={{ color: "#0b4a7d", fontWeight: 700 }}>Download</a>
                            </> : <span className="muted">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            {!open.invoices && (
              <div className="small" style={{ padding: "4px 18px 16px", color: "var(--muted)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <Pill tone={TONE_NEUTRAL}>No archived PDFs</Pill>
                <span>This month went out before invoices were archived — every month from now on keeps its PDFs here.</span>
                {loadableMonth && periodKey(loadableMonth) === periodKey(open.period) && (
                  <button type="button" className="btn sm" onClick={() => { setOpen(null); onLoadGl(); }}>Regenerate from the imported GL →</button>
                )}
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
      {confirm && typeof document !== "undefined" && createPortal(
        <div onClick={() => !sending && setConfirm(null)} style={{ position: "fixed", inset: 0, zIndex: 130, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "60px 16px", overflowY: "auto" }}>
          <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Send ${confirm.p.label} to AvidXchange`}
            style={{ background: "var(--card)", borderRadius: 12, width: "100%", maxWidth: 640, boxShadow: "0 20px 60px rgba(0,0,0,0.35)", borderTop: "3px solid var(--brand)" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
              <div style={secLabel}>Send to AvidXchange</div>
              <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>Allocated Expenses · {confirm.p.label}</div>
            </div>
            {confirm.error ? (
              <div className="small" style={{ padding: "16px 18px", color: "#b91c1c", fontWeight: 700 }}>{confirm.error}</div>
            ) : !confirm.preview ? (
              <div className="muted small" style={{ padding: "16px 18px" }}>Working out what will be billed…</div>
            ) : confirm.preview.nothingToSend ? (
              <div className="small" style={{ padding: "16px 18px" }}>Nothing left to bill — every charge in this period was already allocated when its month was finalized, so there is nothing to send. It now reads &ldquo;Finalized · no send record&rdquo; in the history; check AvidXchange for those months&rsquo; invoices.</div>
            ) : (
              <>
                <div className="pills" style={{ padding: "12px 18px 0" }}>
                  <StatPill label="Total to bill" value={money(confirm.preview.total)} total />
                  <StatPill label="Invoices" value={String(confirm.preview.invoiceCount)} sub="one email each" />
                  <StatPill label="Buildings" value={String(confirm.preview.byProperty.length)} />
                </div>
                {confirm.preview.months.length > 1 && (
                  <div className="small muted" style={{ padding: "10px 18px 0" }}>
                    Covers {confirm.preview.months.map((m) => `${m.label} ${money(m.total)}`).join(" · ")}
                  </div>
                )}
                <div style={{ padding: "12px 0 4px" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr><th style={thL}>Property</th><th style={th}>Amount</th></tr></thead>
                    <tbody>
                      {confirm.preview.byProperty.map((b) => (
                        <tr key={b.code}>
                          <td style={tdL}><code style={{ fontSize: 12, fontWeight: 700, color: "var(--brand)", marginRight: 6 }}>{b.code}</code>{b.name || propName(b.code)}</td>
                          <td style={td}>{money(b.amount)}</td>
                        </tr>
                      ))}
                      <tr style={{ fontWeight: 800 }}>
                        <td style={{ ...tdL, borderTop: "2px solid var(--border)" }}>Total</td>
                        <td style={{ ...td, borderTop: "2px solid var(--border)" }}>{money(confirm.preview.total)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="small" style={{ padding: "6px 18px 0", color: "var(--muted)", lineHeight: 1.5 }}>
                  Each invoice PDF goes to <b style={{ color: "var(--text)" }}>kormancommercial@avidbill.com</b> as its own email; Marie, Drew and Harry get one summary.
                  Amounts under $100 per account stay held and carry forward. Sending finalizes the month — it can&rsquo;t be undone.
                </div>
              </>
            )}
            <div style={{ padding: "14px 18px", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="btn sm" disabled={!!sending} onClick={() => setConfirm(null)}>Cancel</button>
              {confirm.preview && !confirm.preview.nothingToSend && (
                <button type="button" className="btn sm primary" disabled={!!sending} onClick={() => send(confirm.p)}>
                  {sending ? "Sending…" : `Send ${confirm.preview.invoiceCount} invoice${confirm.preview.invoiceCount === 1 ? "" : "s"} · ${money(confirm.preview.total)}`}
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

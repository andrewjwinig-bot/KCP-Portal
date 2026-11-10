"use client";

// A tenant's correspondence on the Monthly Statements roster (owner, 11/2026:
// "see on the tenants page if they have open charges what our last
// correspondence to them was … so we can send another email or just keep
// better data on when and what we sent them").
//
//   • LastContactCell — the roster column: when we last emailed the suite and
//     what it was; amber when the tenant owes and we have not been in touch
//     for FOLLOW_UP_DAYS.
//   • CorrespondencePanel — inside the expanded row: every email, newest
//     first, each opening as sent, and "Send balance reminder…".
//   • ReminderModal — the reminder, drafted from the stored statement, typed
//     in place, every recipient named and tickable before it goes.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { HoverCard } from "@/app/components/HoverCard";
import { Pill, StatPill, TONE_AMBER } from "@/app/components/Pill";
import { th, thL, td, tdL } from "@/app/components/tableStyles";
import { SentEmailModal } from "./SentEmailModal";
import { daysSince, FOLLOW_UP_DAYS, KIND_LABEL, type CorrespondenceEntry, type LastContact } from "@/lib/statements/correspondence";

const SECTION: React.CSSProperties = { fontSize: "var(--fs-11)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" };
const money = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" });
const fullStamp = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
export const ago = (iso: string) => { const d = daysSince(iso); return d === 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`; };

export const srcOf = (e: Pick<CorrespondenceEntry, "source" | "id">) =>
  `/api/tenant-statements/correspondence?source=${e.source}&id=${encodeURIComponent(e.id)}`;

/** Does this tenant owe and not heard from us lately? */
export function needsFollowUp(owed: number, c: LastContact | null | undefined): boolean {
  return owed > 0.005 && (!c || daysSince(c.last.sentAt) >= FOLLOW_UP_DAYS);
}

export function LastContactCell({ contact, owed }: { contact: LastContact | null; owed: number }) {
  const stale = needsFollowUp(owed, contact);
  if (!contact) {
    return owed > 0.005
      ? <span style={{ color: "#b45309", fontWeight: 600, fontSize: "var(--fs-12-5)" }}>Never emailed</span>
      : <span className="muted">—</span>;
  }
  const e = contact.last;
  return (
    <HoverCard title={KIND_LABEL[e.kind]} width={300}
      rows={[
        { label: "Sent", value: fullStamp(e.sentAt) },
        ...(e.sentBy ? [{ label: "By", value: e.sentBy }] : []),
        { label: "To", value: e.to.join(", ") || "—" },
        ...(e.summary ? [{ label: "About", value: e.summary }] : []),
      ]}
      footer={{ label: "On file", value: `${contact.count} email${contact.count === 1 ? "" : "s"}` }}>
      <span style={{ display: "inline-grid", lineHeight: 1.25 }}>
        <span style={{ fontWeight: 600, fontSize: "var(--fs-12-5)", color: stale ? "#b45309" : undefined }}>{shortDate(e.sentAt)} · {ago(e.sentAt)}</span>
        <span className="muted" style={{ fontSize: "var(--fs-11-5)" }}>{KIND_LABEL[e.kind]}</span>
      </span>
    </HoverCard>
  );
}

export function CorrespondencePanel({ unitRef, period, tenantName, owed, nonce, onSent }: {
  unitRef: string; period: string; tenantName: string; owed: number; nonce: number; onSent: () => void;
}) {
  const [entries, setEntries] = useState<CorrespondenceEntry[] | null>(null);
  const [viewing, setViewing] = useState<CorrespondenceEntry | null>(null);
  const [reminding, setReminding] = useState(false);
  useEffect(() => {
    let live = true;
    fetch(`/api/tenant-statements/correspondence?unit=${encodeURIComponent(unitRef)}`, { cache: "no-store" })
      .then((r) => r.json()).then((j) => { if (live) setEntries(j.ok ? j.entries : []); })
      .catch(() => live && setEntries([]));
    return () => { live = false; };
  }, [unitRef, nonce]);

  return (
    <div style={{ padding: "12px 10px 4px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
        <div style={SECTION}>Correspondence</div>
        <span className="muted" style={{ fontSize: "var(--fs-12-5)" }}>
          {entries == null ? "Loading…" : entries.length ? `${entries.length} email${entries.length === 1 ? "" : "s"} on file` : "Nothing sent to this suite from the portal yet."}
        </span>
        {owed > 0.005 && (
          <button className="btn" style={{ marginLeft: "auto", fontSize: "var(--fs-12)", padding: "4px 10px" }} onClick={(e) => { e.stopPropagation(); setReminding(true); }}>
            Send balance reminder…
          </button>
        )}
      </div>
      {!!entries?.length && (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            <th style={{ ...thL, width: 150 }}>Sent</th><th style={{ ...thL, width: 190 }}>What</th><th style={thL}>Subject</th><th style={thL}>To</th><th style={th} />
          </tr></thead>
          <tbody>{entries.map((e) => (
            <tr key={`${e.source}:${e.id}`} style={{ borderTop: "1px solid var(--border)" }}>
              <td style={tdL}>{fullStamp(e.sentAt)}{e.sentBy ? <div className="muted" style={{ fontSize: "var(--fs-11-5)" }}>{e.sentBy}</div> : null}</td>
              <td style={{ ...tdL, whiteSpace: "normal" }}>{KIND_LABEL[e.kind]}{e.testMode ? <> <Pill tone={TONE_AMBER}>TEST</Pill></> : null}
                {e.summary ? <div className="muted" style={{ fontSize: "var(--fs-11-5)" }}>{e.summary}</div> : null}</td>
              <td style={{ ...tdL, whiteSpace: "normal" }}>{e.subject}</td>
              <td style={{ ...tdL, whiteSpace: "normal", fontSize: "var(--fs-12-5)" }}>{e.to.join(", ")}</td>
              <td style={{ ...td, whiteSpace: "nowrap" }}><button className="btn sm" onClick={(ev) => { ev.stopPropagation(); setViewing(e); }}>View</button></td>
            </tr>
          ))}</tbody>
        </table>
      )}
      {viewing && <SentEmailModal src={srcOf(viewing)} onClose={() => setViewing(null)} />}
      {reminding && <ReminderModal unitRef={unitRef} period={period} tenantName={tenantName} onClose={() => setReminding(false)} onSent={() => { setReminding(false); onSent(); }} />}
    </div>
  );
}

type Draft = { subject: string; opening: string; closing: string; tableHtml: string };

export function ReminderModal({ unitRef, period, tenantName, onClose, onSent }: {
  unitRef: string; period: string; tenantName: string; onClose: () => void; onSent: () => void;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [balance, setBalance] = useState(0);
  const [attach, setAttach] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/tenant-statements/correspondence?draft=1&period=${period}&unit=${encodeURIComponent(unitRef)}`, { cache: "no-store" })
      .then(async (r) => { const j = await r.json(); if (!live) return; if (!r.ok) setErr(j.error ?? "Could not draft it."); else { setDraft(j.draft); setRecipients(j.recipients); setBalance(j.balance); } })
      .catch(() => live && setErr("Could not draft it."));
    return () => { live = false; };
  }, [unitRef, period]);

  const to = recipients.filter((r) => !excluded.has(r));
  async function send() {
    if (!draft) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/tenant-statements/correspondence", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reminder", period, unitRef, subject: draft.subject, opening: draft.opening, closing: draft.closing, exclude: [...excluded], attachStatement: attach }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "It did not send.");
      onSent();
    } catch (e) { setErr(e instanceof Error ? e.message : "It did not send."); }
    finally { setBusy(false); }
  }

  if (typeof document === "undefined") return null;
  const box: React.CSSProperties = { width: "100%", fontSize: "var(--fs-14)", lineHeight: 1.5 };
  return createPortal(
    <div role="dialog" aria-modal="true" onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", display: "grid", placeItems: "center", zIndex: 1000, padding: 16 }}>
      <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: "min(760px, 100%)", maxHeight: "92vh", overflowY: "auto", display: "grid", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 18, fontWeight: 800, flex: 1 }}>Balance reminder — {tenantName}</div>
          <button className="btn sm" onClick={onClose} title="Close">✕</button>
        </div>
        {!draft ? <div className={err ? "small" : "muted small"} style={err ? { color: "#b91c1c" } : undefined}>{err ?? "Drafting…"}</div> : (
          <>
            <div className="pills" style={{ justifyContent: "flex-start", margin: 0 }}>
              <StatPill label="Open balance" value={money(balance)} />
              <StatPill label="Recipients" value={to.length} />
            </div>
            <div style={{ display: "grid", gap: 4 }}>
              <span style={SECTION}>To</span>
              {recipients.length ? recipients.map((r) => (
                <label key={r} className="small" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input type="checkbox" checked={!excluded.has(r)} onChange={() => setExcluded((s) => { const n = new Set(s); if (n.has(r)) n.delete(r); else n.add(r); return n; })} />{r}
                </label>
              )) : <div className="small" style={{ color: "#b45309", fontWeight: 600 }}>No email on file for this suite — add a contact on the <a href={`/units/${unitRef}`}>unit page</a>.</div>}
            </div>
            <div style={{ display: "grid", gap: 4 }}><span style={SECTION}>Subject</span>
              <input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} style={box} /></div>
            <textarea rows={6} value={draft.opening} onChange={(e) => setDraft({ ...draft, opening: e.target.value })} style={box} />
            {/* Generated on the server from the stored statement — not typeable. */}
            <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, background: "#fff", color: "#111827", overflowX: "auto" }} dangerouslySetInnerHTML={{ __html: draft.tableHtml }} />
            <textarea rows={9} value={draft.closing} onChange={(e) => setDraft({ ...draft, closing: e.target.value })} style={box} />
            <label className="small" style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} />
              Attach the {period} statement (PDF) · <a href={`/api/tenant-statements/receipts?period=${period}&unit=${encodeURIComponent(unitRef)}&pdf=1`} target="_blank" rel="noreferrer">preview</a>
            </label>
            <div className="muted small">From Tami Tomlinson (Accounts Receivable); replies come back to her and she gets a blind copy. The email is saved to this tenant&rsquo;s correspondence as sent.</div>
            {err && <div className="small" style={{ color: "#b91c1c" }}>{err}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
              <button className="btn primary" onClick={send} disabled={busy || !to.length}>{busy ? "Sending…" : `Send to ${to.length} recipient${to.length === 1 ? "" : "s"}`}</button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

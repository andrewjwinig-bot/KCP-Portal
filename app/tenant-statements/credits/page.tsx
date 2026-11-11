"use client";

// Open Credits — Tami's page for getting tenant credits resolved (owner,
// 11/2026: "email tenants with open credits to make them aware and ask them
// how they want to be applied for the next months rent … getting our
// credits/charges cleaned up"). Every tenant on Skyline's Credit Balance report,
// each credit itemized with its description, date and how long it has been
// open, the last time we asked, and a one-click email that asks.

import { pickInto } from "@/app/components/pickFiles";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronRight, Upload, X } from "lucide-react";
import { StatPill } from "@/app/components/Pill";
import { th, td, thL, tdL } from "@/app/components/tableStyles";
import { ImportInstructions } from "@/app/components/ImportInstructions";
import { PageHeader } from "@/app/components/PageHeader";
import { InfoPopover } from "@/app/components/InfoPopover";
import { useCreditBalanceImport } from "../useCreditBalanceImport";
import { SentEmailModal } from "../SentEmailModal";
import { ago } from "../Correspondence";
import { daysSince } from "@/lib/statements/correspondence";
import { useUser } from "@/app/components/UserProvider";
import { canWorkCredits } from "@/lib/users";

type Line = { code: string; description: string; dateISO: string | null; amount: number; bucket: number };
type Row = {
  unitRef: string; tenantName: string; propertyCode: string; propertyName: string; suite: string; asOf: string;
  contact: string | null; phone: string | null; depositsHeld: number; balanceDue: number; tiesOut: boolean;
  lines: Line[]; credit: number; charges: number; net: number; oldestCredit: string | null; oldestDays: number | null;
  lastNotice: { sentAt: string; sentBy: string | null; id: string; source: string } | null;
  lastContact: { sentAt: string; kind: string } | null;
  note: { text: string; by: string | null; at: string } | null;
  /** Read off the laser statement — the report doesn't cover this property; its credits are one undated total. */
  fromLaser?: boolean;
};
type Data = { asOf: string | null; runAt: string | null; properties: number; tenants: Row[]; small?: number; minCredit?: number; laser: { period: string; asOf: string } | null };

const SECTION: React.CSSProperties = { fontSize: "var(--fs-11)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" };
const ICON = { size: 16, strokeWidth: 1.75, "aria-hidden": true, style: { verticalAlign: "-3px", flexShrink: 0 } } as const;
const num = (n: number) => Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signed = (n: number) => (Math.abs(n) < 0.005 ? "—" : n < 0 ? `(${num(n)})` : num(n));
const usd = (n: number) => (n < 0 ? `($${num(n)})` : `$${num(n)}`);
const shortDate = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit", timeZone: "UTC" }) : "—");
const longDate = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const daysBetween = (from: string | null, to: string) => (from ? Math.max(0, Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000)) : null);

/** A credit asked about more than this long ago is due another email. */
const ASK_AGAIN_DAYS = 30;
const OLD_DAYS = 90;
type Filter = "all" | "ask" | "old";

export default function OpenCreditsPage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>("all");
  const [emailing, setEmailing] = useState<Row | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Harry, Alison and Nancy VIEW this page; importing, emailing and notes are
  // Monthly Statements' (the server refuses their writes too).
  const { user } = useUser();
  const canWork = canWorkCredits(user.id);

  const load = useCallback(async () => {
    const r = await fetch("/api/tenant-statements/aging", { cache: "no-store" }).catch(() => null);
    const j = r ? await r.json().catch(() => null) : null;
    if (!j?.ok) { setError(j?.error ?? "Could not load the open credits."); return; }
    setData(j); setError(null);
  }, []);
  useEffect(() => { load(); }, [load]);

  const importFiles = useCreditBalanceImport(load);

  const asOf = data?.asOf ?? null;
  const rows = useMemo(() => {
    const all = data?.tenants ?? [];
    return all.filter((t) => {
      if (filter === "old") return (t.oldestDays ?? 0) >= OLD_DAYS;
      if (filter === "ask") return !t.lastNotice || daysSince(t.lastNotice.sentAt) >= ASK_AGAIN_DAYS;
      return true;
    });
  }, [data, filter]);
  const groups = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const t of rows) (m.get(t.propertyCode) ?? m.set(t.propertyCode, []).get(t.propertyCode)!).push(t);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  const all = data?.tenants ?? [];
  const totalCredit = all.reduce((a, t) => a + t.credit, 0);
  const totalCharges = all.reduce((a, t) => a + t.charges, 0);
  const totalNet = all.reduce((a, t) => a + t.net, 0);
  const usd0 = (n: number) => (n < -0.5 ? `($${Math.round(-n).toLocaleString("en-US")})` : `$${Math.round(n).toLocaleString("en-US")}`);
  const notAsked = all.filter((t) => !t.lastNotice || daysSince(t.lastNotice.sentAt) >= ASK_AGAIN_DAYS).length;
  const old = all.filter((t) => (t.oldestDays ?? 0) >= OLD_DAYS);
  const oldTotal = old.reduce((a, t) => a + t.credit, 0);

  return (
    <main style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <PageHeader title="Open Credits"
        info={<>Every tenant carrying a credit, what each credit is and how long it has been open — and an email asking how they want it applied.</>}
        actions={canWork ? <>
          <input ref={fileRef} type="file" accept=".xls,.xlsx" multiple hidden onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ""; importFiles(f); }} />
          <button className="btn import" onClick={() => pickInto(fileRef.current, "credit-balance")}><Upload {...ICON} /> Import Credit Balance Report</button>
          <InfoPopover><ImportInstructions variant="credit-balance" /></InfoPopover>
        </> : undefined} />

      {error && <div className="card" style={{ color: "var(--c-b91c1c)", fontWeight: 600 }}>{error}</div>}

      {data && (
        <div className="muted small">
          {/* The same account Receipt Reconciliation reads: the Credit Balance
              report where it covers a property, else the laser statement. */}
          {asOf && <>Credit Balance Report as of <b>{longDate(asOf)}</b>, credits itemized with their dates. </>}
          {data.laser && <>{asOf ? "Properties it doesn\u2019t cover" : "Credits"} are from the <b>Laser Statement</b> as of {longDate(data.laser.asOf)}, where they print as one undated total. Import the Credit Balance Report to itemize them.</>}
          {!asOf && !data.laser && <>No Laser Statement or Credit Balance Report imported yet.</>}
          {!!data.small && <> {data.small} credit{data.small === 1 ? "" : "s"} under ${data.minCredit ?? 5} not shown.</>}
        </div>
      )}

      {data && all.length > 0 && (
        <div className="pills">
          <StatPill label="Tenants with credits" value={all.length} />
          {/* Net, not the credits alone: open charges eat into a credit (owner: "TOTAL CREDITS is misleading"). In parens = held for tenants. */}
          <StatPill label="Net" value={usd0(totalNet)} sub={`Credits ${usd0(-totalCredit)} · Charges ${usd0(totalCharges)}`} accent={totalNet < -0.5 ? "var(--c-15803d)" : undefined} />
          <StatPill label={`Open ${OLD_DAYS}+ days`} value={`$${Math.round(oldTotal).toLocaleString("en-US")}`} sub={`${old.length} tenant${old.length === 1 ? "" : "s"}`} accent={old.length ? "var(--c-b45309)" : undefined} />
          <StatPill label="Not asked yet" value={notAsked} sub={`or ${ASK_AGAIN_DAYS}+ days ago`} accent={notAsked ? "var(--c-b45309)" : undefined} />
        </div>
      )}

      {data && all.length > 0 && (
        <section className="card" style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {([["all", `All · ${all.length}`], ["ask", `To ask · ${notAsked}`], ["old", `${OLD_DAYS}+ days · ${old.length}`]] as [Filter, string][]).map(([k, label]) => (
              <button key={k} className={`btn sm${filter === k ? " primary" : ""}`} onClick={() => setFilter(k)}>{label}</button>
            ))}
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
              <thead>
                <tr>
                  <th style={thL}>Tenant</th>
                  <th style={th}>Credits</th>
                  <th style={th}>Charges</th>
                  <th style={th}>Net</th>
                  <th style={thL}>Oldest credit</th>
                  <th style={thL}>Last asked</th>
                  <th style={th} />
                </tr>
              </thead>
              <tbody>
                {groups.map(([code, ts]) => (
                  <Fragment key={code}>
                    <tr style={{ background: "var(--tint-brand-bg)", borderTop: "2px solid var(--border)" }}>
                      <td style={{ ...tdL, fontWeight: 800, whiteSpace: "normal" }}><code>{code}</code> {ts[0].propertyName}</td>
                      <td style={{ ...td, fontWeight: 700, color: "var(--c-15803d)" }}>({num(ts.reduce((a, t) => a + t.credit, 0))})</td>
                      <td style={{ ...td, fontWeight: 700 }}>{signed(ts.reduce((a, t) => a + t.charges, 0))}</td>
                      <td style={{ ...td, fontWeight: 700 }}>{signed(ts.reduce((a, t) => a + t.net, 0))}</td>
                      <td style={td} colSpan={3} />
                    </tr>
                    {ts.map((t) => {
                      const isOpen = open.has(t.unitRef);
                      const stale = !t.lastNotice || daysSince(t.lastNotice.sentAt) >= ASK_AGAIN_DAYS;
                      return (
                        <Fragment key={t.unitRef}>
                          <tr className="task-row" style={{ cursor: "pointer", borderBottom: "1px solid var(--hairline)" }} onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(t.unitRef)) n.delete(t.unitRef); else n.add(t.unitRef); return n; })}>
                            <td style={{ ...tdL, whiteSpace: "normal", maxWidth: 260 }}>
                              <span style={{ display: "inline-flex", gap: 6, alignItems: "flex-start" }}>
                                {isOpen ? <ChevronDown {...ICON} /> : <ChevronRight {...ICON} />}
                                <span style={{ display: "grid", lineHeight: 1.3 }}>
                                  <span style={{ fontWeight: 600 }}>{t.tenantName}</span>
                                  <code style={{ fontSize: "var(--fs-12)", justifySelf: "start" }}>{t.unitRef}</code>
                                </span>
                              </span>
                            </td>
                            <td style={{ ...td, color: "var(--c-15803d)", fontWeight: 600 }}>({num(t.credit)})</td>
                            <td style={td}>{signed(t.charges)}</td>
                            <td style={{ ...td, fontWeight: 700 }}>{signed(t.net)}</td>
                            <td style={tdL}>
                              {t.fromLaser && !t.oldestCredit ? <span className="muted" style={{ fontSize: "var(--fs-12-5)" }}>Not dated · Laser Statement</span> : shortDate(t.oldestCredit)}
                              {t.oldestDays !== null && <span style={{ marginLeft: 6, fontSize: "var(--fs-12-5)", color: t.oldestDays >= OLD_DAYS ? "var(--c-b45309)" : "var(--muted)", fontWeight: t.oldestDays >= OLD_DAYS ? 700 : 400 }}>{t.oldestDays} days</span>}
                            </td>
                            <td style={tdL}>
                              {t.lastNotice
                                ? <span style={{ fontSize: "var(--fs-12-5)", color: stale ? "var(--c-b45309)" : undefined, fontWeight: stale ? 600 : 400 }}>{new Date(t.lastNotice.sentAt).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" })} · {ago(t.lastNotice.sentAt)}</span>
                                : <span style={{ color: "var(--c-b45309)", fontWeight: 600, fontSize: "var(--fs-12-5)" }}>Never asked</span>}
                            </td>
                            <td style={{ ...td, whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                              {canWork && <button className="btn sm" onClick={() => setEmailing(t)}>{t.lastNotice ? "Ask again" : "Email"}</button>}
                            </td>
                          </tr>
                          {isOpen && (
                            <tr>
                              <td colSpan={7} style={{ padding: "6px 12px 16px 34px", maxWidth: 0, borderBottom: "1px solid var(--hairline)" }}>
                                <Detail t={t} onView={setViewing} onNote={load} canWork={canWork} />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </Fragment>
                ))}
                {!rows.length && <tr><td colSpan={7} style={{ ...tdL, color: "var(--muted)" }}>Nothing in this view.</td></tr>}
                {rows.length > 0 && (() => {
                  const cr = rows.reduce((a, t) => a + t.credit, 0), ch = rows.reduce((a, t) => a + t.charges, 0), nt = rows.reduce((a, t) => a + t.net, 0);
                  return (
                    <tr style={{ borderTop: "2px solid var(--border)" }}>
                      <td style={{ ...tdL, fontWeight: 800 }}>Total · {rows.length} tenant{rows.length === 1 ? "" : "s"}</td>
                      <td style={{ ...td, fontWeight: 800, color: "var(--c-15803d)" }}>(${num(cr)})</td>
                      <td style={{ ...td, fontWeight: 800 }}>${num(ch)}</td>
                      <td style={{ ...td, fontWeight: 800 }}>{nt < -0.005 ? `($${num(nt)})` : `$${num(nt)}`}</td>
                      <td style={td} colSpan={3} />
                    </tr>
                  );
                })()}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {data && (asOf || data.laser) && !all.length && <div className="card muted">No tenant carries a credit.</div>}

      {emailing && <CreditNoticeModal row={emailing} onClose={() => setEmailing(null)} onSent={() => { setEmailing(null); load(); }} />}
      {viewing && <SentEmailModal src={viewing} onClose={() => setViewing(null)} />}
    </main>
  );
}

function Detail({ t, onView, onNote, canWork }: { t: Row; onView: (src: string) => void; onNote: () => void; canWork: boolean }) {
  const [note, setNote] = useState(t.note?.text ?? "");
  const [saving, setSaving] = useState(false);
  const lines = [...t.lines].sort((a, b) => (a.amount < 0 ? 0 : 1) - (b.amount < 0 ? 0 : 1) || (a.dateISO ?? "").localeCompare(b.dateISO ?? ""));
  async function saveNote() {
    setSaving(true);
    await fetch("/api/tenant-statements/credit-notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ unitRef: t.unitRef, text: note }) }).catch(() => null);
    setSaving(false); onNote();
  }
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
          <thead><tr><th style={thL}>Code</th><th style={thL}>Date</th><th style={thL}>Description</th><th style={th}>Open</th><th style={th}>Amount</th></tr></thead>
          <tbody>
            {lines.map((l, i) => {
              const days = daysBetween(l.dateISO, t.asOf);
              return (
                <tr key={i} style={{ borderBottom: "1px solid var(--hairline)" }}>
                  <td style={tdL}><code>{l.code}</code></td>
                  <td style={tdL}>{shortDate(l.dateISO)}</td>
                  <td style={tdL}>{l.description || l.code}{l.amount < 0 && <span className="muted small"> · credit</span>}</td>
                  <td style={{ ...td, color: days !== null && days >= OLD_DAYS ? "var(--c-b45309)" : "var(--muted)" }}>{days === null ? "—" : `${days} days`}</td>
                  <td style={{ ...td, color: l.amount < 0 ? "var(--c-15803d)" : undefined, fontWeight: l.amount < 0 ? 600 : 400 }}>{signed(l.amount)}</td>
                </tr>
              );
            })}
            <tr style={{ borderTop: "2px solid var(--border)" }}>
              <td style={tdL} colSpan={4}><b>Balance per Skyline</b>{!t.tiesOut && <span style={{ color: "var(--c-b45309)", marginLeft: 8 }} className="small">the lines do not add to it — check in Skyline</span>}</td>
              <td style={{ ...td, fontWeight: 800 }}>{usd(t.balanceDue)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="small muted">
        {t.contact ? <>Contact {t.contact}{t.phone ? ` · ${t.phone}` : ""} · </> : null}
        Deposit held {usd(t.depositsHeld)}
        {canWork && <> · <a className="text-link" href={`/tenant-statements?unit=${encodeURIComponent(t.unitRef)}`}>Work a payment <ChevronRight {...ICON} /></a></>}
        {t.lastNotice && <> · <a href="#" className="text-link" onClick={(e) => { e.preventDefault(); onView(`/api/tenant-statements/correspondence?source=${t.lastNotice!.source}&id=${encodeURIComponent(t.lastNotice!.id)}`); }}>View the last email <ChevronRight {...ICON} /></a></>}
      </div>
      {!canWork ? (t.note && <div className="small"><span style={SECTION}>Follow-up</span> {t.note.text} <span className="muted">· {t.note.by ? `${t.note.by} · ` : ""}{new Date(t.note.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span></div>) : <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={SECTION}>Follow-up</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Tenant says apply to December rent" style={{ flex: 1, minWidth: 220 }} />
        <button className="btn sm" onClick={saveNote} disabled={saving || note === (t.note?.text ?? "")}>{saving ? "Saving…" : "Save note"}</button>
        {t.note && <span className="muted small">{t.note.by ? `${t.note.by} · ` : ""}{new Date(t.note.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
      </div>}
    </div>
  );
}

type Draft = { subject: string; opening: string; closing: string; tableHtml: string; signatureHtml?: string };

function CreditNoticeModal({ row, onClose, onSent }: { row: Row; onClose: () => void; onSent: () => void }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/tenant-statements/aging?draft=1&unit=${encodeURIComponent(row.unitRef)}`, { cache: "no-store" })
      .then(async (r) => { const j = await r.json(); if (!live) return; if (!r.ok) setErr(j.error ?? "Could not draft it."); else { setDraft(j.draft); setRecipients(j.recipients); } })
      .catch(() => live && setErr("Could not draft it."));
    return () => { live = false; };
  }, [row.unitRef]);
  const to = recipients.filter((r) => !excluded.has(r));
  async function send() {
    if (!draft) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/tenant-statements/aging", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "notice", unitRef: row.unitRef, subject: draft.subject, opening: draft.opening, closing: draft.closing, exclude: [...excluded] }),
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
    <div role="dialog" aria-modal="true" onClick={onClose} style={{ position: "fixed", inset: 0, background: "var(--import-scrim)", display: "grid", placeItems: "center", zIndex: 1000, padding: 16 }}>
      <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: "min(760px, 100%)", maxHeight: "92vh", overflowY: "auto", display: "grid", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 18, fontWeight: 800, flex: 1 }}>Open credit — {row.tenantName}</div>
          <button className="btn sm" onClick={onClose} title="Close"><X {...ICON} /></button>
        </div>
        {!draft ? <div className={err ? "small" : "muted small"} style={err ? { color: "var(--c-b91c1c)" } : undefined}>{err ?? "Drafting…"}</div> : (
          <>
            <div className="pills" style={{ justifyContent: "flex-start", margin: 0 }}>
              <StatPill label="Credit" value={`$${num(row.credit)}`} />
              {row.charges > 0.005 && <StatPill label="Open charges" value={`$${num(row.charges)}`} />}
              <StatPill label="Recipients" value={to.length} />
            </div>
            <div style={{ display: "grid", gap: 4 }}>
              <span style={SECTION}>To</span>
              {recipients.length ? recipients.map((r) => (
                <label key={r} className="small" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input type="checkbox" checked={!excluded.has(r)} onChange={() => setExcluded((s) => { const n = new Set(s); if (n.has(r)) n.delete(r); else n.add(r); return n; })} />{r}
                </label>
              )) : <div className="small" style={{ color: "var(--c-b45309)", fontWeight: 600 }}>No email on file for this suite — add a contact on the <a href={`/units/${row.unitRef}`}>unit page</a>.</div>}
            </div>
            <div style={{ display: "grid", gap: 4 }}><span style={SECTION}>Subject</span>
              <input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} style={box} /></div>
            <textarea rows={6} value={draft.opening} onChange={(e) => setDraft({ ...draft, opening: e.target.value })} style={box} />
            {/* Generated on the server from the stored report — not typeable. */}
            <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, background: "#fff", color: "var(--c-111827)", overflowX: "auto" }} dangerouslySetInnerHTML={{ __html: draft.tableHtml }} />
            <textarea rows={8} value={draft.closing} onChange={(e) => setDraft({ ...draft, closing: e.target.value })} style={box} />
            {/* The signature is added on send — shown here as it goes, not editable. */}
            {draft.signatureHtml && <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, background: "var(--c-ffffff)", color: "var(--c-111827)" }} dangerouslySetInnerHTML={{ __html: draft.signatureHtml }} />}
            <div className="muted small">From Tami Tomlinson (Accounts Receivable); replies come back to her and she gets a blind copy. The email is saved to this tenant&rsquo;s correspondence as sent.</div>
            {err && <div className="small" style={{ color: "var(--c-b91c1c)" }}>{err}</div>}
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

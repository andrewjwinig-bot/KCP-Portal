"use client";

// Tenant Notices — the month's account notices, approved and sent by Greg
// (owner, 11/2026: "set all to SEND as default and allow him to UNSELECT
// tenants to withhold sending but make it easier and give him access to that
// page"). Built by the Credit Balance Report import on or after the 15th;
// every tenant is ticked; untick to hold one back; Send. Below, the credits
// tenants asked us to apply — Tami marks each posted before statements go out
// on the 25th.

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Eye, Send, X } from "lucide-react";
import { PageHeader } from "@/app/components/PageHeader";
import { StatusBanner } from "@/app/components/StatusBanner";
import { StatPill } from "@/app/components/Pill";
import { RoundCheck } from "@/app/components/RoundCheck";
import LoadingState from "@/app/components/LoadingState";
import { th, td, thL, tdL } from "@/app/components/tableStyles";
import type { BatchCounts, BatchItem, CreditRequest, ReminderBatch } from "@/lib/statements/reminderBatch";
import type { ReminderTier } from "@/lib/statements/monthlyReminder";

type Data = {
  month: string; batch: ReminderBatch | null; counts: BatchCounts | null; requests: CreditRequest[];
  summaryDay: string; applyDeadline: string; today: string;
};

const ICON = { size: 16, strokeWidth: 1.75, "aria-hidden": true, style: { verticalAlign: "-3px", flexShrink: 0 } } as const;
const num = (n: number) => Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signed = (n: number) => (Math.abs(n) < 0.005 ? "—" : n < 0 ? `(${num(n)})` : num(n));
const monthName = (ym: string) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const dayName = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const TIERS: { tier: ReminderTier; label: string; blurb: string }[] = [
  { tier: "past-due", label: "Past due", blurb: "oldest charge 3+ months old" },
  { tier: "courtesy", label: "Courtesy reminder", blurb: "open charges under 3 months old" },
  { tier: "credit", label: "Credit to apply", blurb: "a credit, with a button to apply it" },
];

export default function TenantNoticesPage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<BatchItem | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number; remaining: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/tenant-notices", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Could not load the notices.");
      setData(j); setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const post = async (body: object, label: string) => {
    setBusy(label);
    try {
      const r = await fetch("/api/tenant-notices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ month: data?.month, ...body }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "That did not work.");
      return j;
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); return null; }
    finally { setBusy(null); }
  };

  const toggle = async (units: string[], send: boolean) => {
    // Optimistic: the tick moves at once; the save follows.
    setData((d) => d && d.batch ? { ...d, batch: { ...d.batch, items: d.batch.items.map((i) => (units.includes(i.unitRef) ? { ...i, send } : i)) } } : d);
    const j = await post({ action: "toggle", unitRefs: units, send }, "toggle");
    if (j) setData((d) => d ? { ...d, batch: j.batch, counts: j.counts } : d);
  };

  const send = async () => {
    const j = await post({ action: "send" }, "send");
    setConfirm(false);
    if (j) setResult({ sent: j.sent, failed: j.failed, remaining: j.remaining });
    load();
  };

  const b = data?.batch ?? null;
  const c = data?.counts ?? null;
  const sentAll = !!b?.approvedAt;
  const byTier = useMemo(() => TIERS.map((t) => ({ ...t, items: (b?.items ?? []).filter((i) => i.tier === t.tier) })).filter((g) => g.items.length), [b]);

  if (!data && !error) return <main><LoadingState status="Loading the notices" /></main>;

  return (
    <main style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <PageHeader title="Tenant Notices"
        info={<>Each month, once the Credit Balance Report is imported on or after the 15th, every tenant with open charges or a credit gets an account notice — a courtesy reminder, a past-due notice, or a credit to apply. Every tenant is set to send; untick anyone to hold back, then Send. Tenants with a credit can click to have it applied before statements go out on the 25th.</>}
        actions={<>
          {!b && <button className="btn" disabled={!!busy} onClick={async () => { const j = await post({ action: "build" }, "build"); if (j) load(); }}>{busy === "build" ? "Building…" : "Build Notices Now"}</button>}
          {b && !sentAll && c && <button className="btn primary" disabled={!!busy || !c.toSend} onClick={() => setConfirm(true)}><Send {...ICON} /> Send {c.toSend} Notice{c.toSend === 1 ? "" : "s"}</button>}
        </>}
        meta={b ? <span className="muted">{monthName(b.month)} · built {when(b.builtAt)}{b.builtBy ? ` by ${b.builtBy}` : ""}{b.dataAsOf ? ` · data through ${dayName(b.dataAsOf)}` : ""}</span> : undefined} />

      {error && <StatusBanner tone="danger" title="Something went wrong">{error}</StatusBanner>}

      {data && !b && (
        <StatusBanner tone="warning" icon="clock" title={`${monthName(data.month)} notices are not built yet`}>
          They build themselves when the Credit Balance Report is imported on or after the 15th — whoever imports it. Greg is emailed when they are ready.
        </StatusBanner>
      )}
      {b && sentAll && (
        <StatusBanner tone="success" title={`${monthName(b.month)} notices have been sent`}>
          Sent {when(b.approvedAt!)}{b.autoSent ? " automatically — not sent by hand in time" : b.approvedBy ? ` by ${b.approvedBy}` : ""} · {c?.sent ?? 0} tenant{c?.sent === 1 ? "" : "s"}{c?.failed ? ` · ${c.failed} did not send` : ""}{c?.withheld ? ` · ${c.withheld} held back` : ""}
        </StatusBanner>
      )}
      {b && !sentAll && c && (
        <StatusBanner tone="warning" title={`${c.toSend} notice${c.toSend === 1 ? "" : "s"} ready to send`}
          actions={<button className="btn primary" disabled={!!busy || !c.toSend} onClick={() => setConfirm(true)}><Send {...ICON} /> Send {c.toSend}</button>}>
          Every tenant is ticked. Untick anyone you want to hold back this month.{b.autoSendOn ? ` If not sent before ${dayName(b.autoSendOn)} morning, every ticked notice goes on its own.` : ""}
        </StatusBanner>
      )}
      {result && (
        <StatusBanner tone={result.failed ? "danger" : "success"} compact title={`${result.sent} sent${result.failed ? ` · ${result.failed} did not send` : ""}`}>
          {result.remaining ? `${result.remaining} still to go — press Send again to finish.` : result.failed ? "The ones that did not send are marked below; press Send again to retry them." : "Every ticked notice went."}
        </StatusBanner>
      )}

      {c && (
        <div className="pills">
          <StatPill label={sentAll ? "Sent" : "To send"} value={sentAll ? c.sent : c.toSend} />
          <StatPill label="Past due" value={c.byTier["past-due"]} accent={c.byTier["past-due"] ? "var(--c-b45309)" : undefined} />
          <StatPill label="Courtesy" value={c.byTier.courtesy} />
          <StatPill label="Credit" value={c.byTier.credit} />
          {(c.withheld > 0 || c.blocked > 0) && <StatPill label="Not sending" value={c.withheld + c.blocked} sub={`${c.withheld} held back · ${c.blocked} no email`} />}
        </div>
      )}

      {b && (
        <section className="card" style={{ display: "grid", gap: 10 }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
              <thead>
                <tr>
                  <th style={{ ...thL, width: 44 }} />
                  <th style={thL}>Tenant</th>
                  <th style={th}>Open</th>
                  <th style={th}>Credit</th>
                  <th style={th}>Balance</th>
                  <th style={thL}>Sends to</th>
                  <th style={th} />
                </tr>
              </thead>
              <tbody>
                {byTier.map((g) => {
                  const live = g.items.filter((i) => !i.blocked && i.status !== "sent");
                  const allOn = live.length > 0 && live.every((i) => i.send);
                  return (
                    <Fragment key={g.tier}>
                      <tr style={{ background: "var(--tint-brand-bg)", borderTop: "2px solid var(--border)" }}>
                        <td style={tdL}>{!sentAll && live.length > 0 && <RoundCheck done={allOn} label={`${allOn ? "Hold back" : "Send"} every ${g.label.toLowerCase()}`} onToggle={() => toggle(live.map((i) => i.unitRef), !allOn)} />}</td>
                        <td style={{ ...tdL, fontWeight: 800 }} colSpan={6}>{g.label} · {g.items.length} <span className="muted" style={{ fontWeight: 400 }}>— {g.blurb}</span></td>
                      </tr>
                      {g.items.map((i) => {
                        const off = i.status !== "sent" && (!i.send || !!i.blocked);
                        return (
                          <tr key={i.unitRef} className="task-row" style={{ borderBottom: "1px solid var(--hairline)", opacity: off ? 0.55 : 1 }}>
                            <td style={tdL}>
                              {i.status === "sent" || sentAll ? null
                                : <RoundCheck done={i.send && !i.blocked} label={i.send ? `Hold back ${i.tenantName}` : `Send ${i.tenantName}`} onToggle={() => !i.blocked && toggle([i.unitRef], !i.send)} />}
                            </td>
                            <td style={{ ...tdL, whiteSpace: "normal", maxWidth: 280 }}>
                              <span style={{ display: "grid", lineHeight: 1.3 }}>
                                <span style={{ fontWeight: 600 }}>{i.tenantName}</span>
                                <span className="muted" style={{ fontSize: "var(--fs-12-5)" }}><code>{i.unitRef}</code> · {i.propertyName}{i.oldestMonths != null && i.tier !== "credit" ? ` · oldest ${i.oldestMonths} mo` : ""}</span>
                              </span>
                            </td>
                            <td style={td}>{signed(i.acct.gross)}</td>
                            <td style={{ ...td, color: i.acct.credit > 0.005 ? "var(--c-15803d)" : undefined }}>{i.acct.credit > 0.005 ? `(${num(i.acct.credit)})` : "—"}</td>
                            <td style={{ ...td, fontWeight: 700 }}>{signed(i.acct.net)}</td>
                            <td style={{ ...tdL, whiteSpace: "normal", fontSize: "var(--fs-12-5)" }}>
                              {i.status === "sent" ? <span style={{ color: "var(--c-15803d)", fontWeight: 600 }}>Sent {i.sentAt ? when(i.sentAt) : ""}</span>
                                : i.status === "failed" ? <span style={{ color: "var(--c-b91c1c)", fontWeight: 600 }}>Did not send · {i.error}</span>
                                : i.blocked ? <span style={{ color: "var(--c-b45309)", fontWeight: 600 }}>{i.blocked}</span>
                                : !i.send ? <span className="muted">Held back{i.toggledBy ? ` by ${i.toggledBy}` : ""}</span>
                                : <span className="muted">{i.recipients.join(", ")}</span>}
                            </td>
                            <td style={{ ...td, whiteSpace: "nowrap" }}>
                              <button className="btn sm" onClick={() => setPreview(i)}><Eye {...ICON} /> Preview</button>
                            </td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  );
                })}
                {!b.items.length && <tr><td colSpan={7} style={{ ...tdL, color: "var(--muted)" }}>No tenant has open charges or a credit this month.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {data && (b?.approvedAt || data.requests.length > 0) && <CreditRequests data={data} onChange={load} post={post} busy={busy} />}

      {preview && b && <PreviewModal month={b.month} item={preview} onClose={() => setPreview(null)} />}
      {confirm && b && c && <ConfirmSend batch={b} counts={c} busy={busy === "send"} onCancel={() => setConfirm(false)} onSend={send} />}
    </main>
  );
}

function CreditRequests({ data, onChange, post, busy }: { data: Data; onChange: () => void; post: (b: object, l: string) => Promise<unknown>; busy: string | null }) {
  const reqs = data.requests;
  const open = reqs.filter((r) => !r.postedAt).length;
  return (
    <section className="card" style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 17, fontWeight: 800 }}>Credits Tenants Asked Us to Apply</div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span className="muted small">Summary to Drew and Tami {dayName(data.summaryDay)}{data.batch?.summarySentAt ? ` · sent ${when(data.batch.summarySentAt)}` : ""}</span>
          <button className="btn sm" disabled={!!busy} onClick={async () => { if (await post({ action: "summary" }, "summary")) onChange(); }}>{busy === "summary" ? "Sending…" : "Send Summary Now"}</button>
        </div>
      </div>
      <div className="muted small">{reqs.length ? `${open} of ${reqs.length} still to post in Skyline before ${monthName(data.batch?.nextYM ?? data.month)} statements go out on the 25th. Tick each once it is posted.` : `None yet. Tenants can ask through ${dayName(data.applyDeadline)}.`}</div>
      {reqs.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={{ ...thL, width: 44 }} /><th style={thL}>Tenant</th><th style={thL}>Apply to</th><th style={th}>Credit</th><th style={thL}>Asked</th></tr></thead>
          <tbody>
            {reqs.map((r) => (
              <tr key={r.id} className="task-row" style={{ borderBottom: "1px solid var(--hairline)" }}>
                <td style={tdL}><RoundCheck done={!!r.postedAt} label={r.postedAt ? `Mark ${r.tenantName} not posted` : `Mark ${r.tenantName} posted`}
                  onToggle={async () => { if (await post({ action: "posted", unitRef: r.unitRef, posted: !r.postedAt }, "posted")) onChange(); }} /></td>
                <td style={{ ...tdL, whiteSpace: "normal" }}>
                  <span style={{ display: "grid", lineHeight: 1.3 }}>
                    <a className="text-link" style={{ fontWeight: 600 }} href={`/tenant-statements?unit=${encodeURIComponent(r.unitRef)}`}>{r.tenantName}</a>
                    <span className="muted" style={{ fontSize: "var(--fs-12-5)" }}><code>{r.unitRef}</code> · {r.postedAt ? <span style={{ color: "var(--c-15803d)", fontWeight: 600 }}>Posted{r.postedBy ? ` by ${r.postedBy}` : ""}</span> : <span style={{ color: "var(--c-b45309)", fontWeight: 600 }}>Not posted</span>}</span>
                  </span>
                </td>
                <td style={{ ...tdL, whiteSpace: "normal", fontSize: "var(--fs-13)" }}>
                  {r.plan.toOpen.map((l) => <div key={`${l.description}${l.dateISO}`}>{l.description}{l.dateISO ? ` (${dayName(l.dateISO)})` : ""} · ${num(l.applied)}</div>)}
                  {r.plan.toNext > 0.005 && <div>{monthName(r.nextYM)} statement · ${num(r.plan.toNext)}</div>}
                </td>
                <td style={{ ...td, fontWeight: 700, color: "var(--c-15803d)" }}>${num(r.plan.appliedToOpen + r.plan.toNext)}</td>
                <td style={tdL}>{when(r.requestedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function Modal({ title, onClose, children, width = 760 }: { title: string; onClose: () => void; children: React.ReactNode; width?: number }) {
  useEffect(() => {
    const k = (ev: KeyboardEvent) => { if (ev.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="modalOverlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal" onClick={(ev) => ev.stopPropagation()} style={{ width: `min(${width}px, 100%)`, maxHeight: "92vh", overflow: "auto" }}>
        <div className="modalHeader">
          <div className="modalTitle">{title}</div>
          <button className="btn sm" onClick={onClose} aria-label="Close"><X {...ICON} /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function PreviewModal({ month, item, onClose }: { month: string; item: BatchItem; onClose: () => void }) {
  const [p, setP] = useState<{ subject: string; html: string; to: string[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/tenant-notices?month=${month}&preview=${encodeURIComponent(item.unitRef)}`, { cache: "no-store" })
      .then(async (r) => { const j = await r.json(); if (!r.ok) setErr(j.error ?? "Could not draw it."); else setP(j); })
      .catch(() => setErr("Could not draw it."));
  }, [month, item.unitRef]);
  return (
    <Modal title={`Notice — ${item.tenantName}`} onClose={onClose}>
      {err ? <div style={{ color: "var(--c-b91c1c)" }}>{err}</div> : !p ? <div className="muted small">Drawing it…</div> : (
        <div style={{ display: "grid", gap: 10 }}>
          <div className="small"><b>To:</b> {p.to.length ? p.to.join(", ") : <span style={{ color: "var(--c-b45309)" }}>no email on file</span>}<br /><b>Subject:</b> {p.subject}<br /><b>Attached:</b> the tenant&apos;s current statement</div>
          <iframe title="Notice preview" sandbox="" srcDoc={p.html} style={{ width: "100%", height: "70vh", border: "1px solid var(--border)", borderRadius: 8 }} />
        </div>
      )}
    </Modal>
  );
}

function ConfirmSend({ batch, counts, busy, onCancel, onSend }: { batch: ReminderBatch; counts: BatchCounts; busy: boolean; onCancel: () => void; onSend: () => void }) {
  const going = batch.items.filter((i) => i.send && !i.blocked && i.status !== "sent");
  const held = batch.items.filter((i) => !i.send && i.status !== "sent");
  return (
    <Modal title={`Send ${counts.toSend} tenant notice${counts.toSend === 1 ? "" : "s"}?`} onClose={onCancel} width={560}>
      <div style={{ display: "grid", gap: 12 }}>
        <div className="pills">
          <StatPill label="Past due" value={going.filter((i) => i.tier === "past-due").length} />
          <StatPill label="Courtesy" value={going.filter((i) => i.tier === "courtesy").length} />
          <StatPill label="Credit" value={going.filter((i) => i.tier === "credit").length} />
        </div>
        <div className="small">Each tenant gets their own email from Korman Commercial Properties, with their current statement attached. Replies go to Tami.</div>
        {held.length > 0 && <div className="small muted">Held back: {held.map((i) => i.tenantName).join(", ")}</div>}
        {counts.blocked > 0 && <div className="small" style={{ color: "var(--c-b45309)" }}>{counts.blocked} with no email on file will not be sent.</div>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="btn" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className="btn primary" onClick={onSend} disabled={busy}><Send {...ICON} /> {busy ? "Sending…" : `Send ${counts.toSend} Notices`}</button>
        </div>
      </div>
    </Modal>
  );
}

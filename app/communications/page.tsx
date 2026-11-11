"use client";
// Tenant Communications — Greg's page for the Interplex tenant emails (owner,
// 11/2026). Each email is a designed graphic with a live "Submit a request" /
// "Report a problem" button and nothing else; Greg picks one, sets the subject
// (weather alerts get their dates), checks who it goes to, sends a test if he
// likes, and sends — one email per suite, to the contacts on its unit page.
// The seasonal ones carry their timing and prompt on his dashboard when due.

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CircleCheck, Eye, Send, TriangleAlert, X } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import LoadingState from "../components/LoadingState";
import { RoundCheck } from "../components/RoundCheck";
import { renderTenantEmail, scheduleLabel, type TenantTemplate } from "@/lib/communications/templates";
import { useUser } from "../components/UserProvider";

type Recipient = { unitRef: string; propertyCode: string; building: string; suite: string; tenant: string; emails: string[] };
type SendSummary = { id: string; templateId: string; subject: string; sentAt: string; sentBy: string | null; testMode: boolean; suites: number; delivered: number };
type Due = { id: string; name: string; dueISO: string; overdue: boolean };
type Data = {
  templates: TenantTemplate[]; recipients: Recipient[]; lastSent: Record<string, string>; due: Due[];
  from: string; mailReady: boolean; testMode: boolean; sends: SendSummary[];
};

const SECTION: React.CSSProperties = { fontSize: "var(--fs-12)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" };
const fmtDate = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const titleName = (s: string | null) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : "");
const STAFF_EMAIL: Record<string, string> = { greg: "gmasciantonio@kormancommercial.com", drew: "dwinig@kormancommercial.com" };

export default function CommunicationsPage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<TenantTemplate | null>(null);
  const [sending, setSending] = useState<TenantTemplate | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const load = useCallback(() => {
    fetch("/api/communications", { cache: "no-store" })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j?.error ?? "Could not load."); setData(j); })
      .catch((e) => setError(String(e.message ?? e)));
  }, []);
  useEffect(() => { load(); }, [load]);

  const withEmail = data?.recipients.filter((r) => r.emails.length).length ?? 0;

  return (
    <main>
      <PageHeader
        title="Tenant Communications"
        info={<>
          Emails to every tenant at the Neshaminy Interplex. Each one is a designed graphic with a button to the
          service request page — the subject line and the graphic, nothing else. It goes to every contact with an
          email on each occupied suite&apos;s unit page, one email per suite. Seasonal tips have a send-by date and
          remind you on your dashboard; weather alerts are sent when the forecast calls for them.
        </>}
      />
      {error && <div className="card" style={{ color: "var(--c-b42318)" }}>{error}</div>}
      {!data && !error && <LoadingState status="Loading tenant emails" />}
      {data && (
        <>
          {data.due.length > 0 && (
            <div className="card" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {data.due.map((d) => (
                <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <TriangleAlert size={20} strokeWidth={1.75} color="var(--c-b54708)" />
                  <span style={{ fontWeight: 700 }}>{d.name}</span>
                  <span className="muted">{d.overdue ? "was due" : "is due"} {fmtDate(d.dueISO)}</span>
                  <button className="btn primary sm" style={{ marginLeft: "auto" }}
                    onClick={() => setSending(data.templates.find((t) => t.id === d.id) ?? null)}>Send {d.name}</button>
                </div>
              ))}
            </div>
          )}

          {(["seasonal", "weather"] as const).map((kind) => (
            <div className="card" key={kind}>
              <div style={{ ...SECTION, marginBottom: 4 }}>{kind === "seasonal" ? "Seasonal Tips" : "Weather Alerts"}</div>
              <div className="muted" style={{ fontSize: "var(--fs-13)", marginBottom: 8 }}>
                {kind === "seasonal" ? "Sent once a season. Your dashboard reminds you when one is due." : "Keep these ready. Send one when a forecast calls for it, with the dates in the subject."}
              </div>
              {data.templates.filter((t) => t.kind === kind).map((t) => {
                const last = data.lastSent[t.id];
                const sched = scheduleLabel(t);
                return (
                  <div key={t.id} className="task-row" style={{ display: "flex", alignItems: "center", gap: 14, padding: "11px 2px", borderBottom: "1px solid var(--hairline)", flexWrap: "wrap" }}>
                    <div style={{ flex: "1 1 320px", minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: "var(--fs-15)" }}>{t.name}</div>
                      <div className="muted" style={{ fontSize: "var(--fs-13)" }}>{t.blurb}</div>
                    </div>
                    <div className="muted" style={{ fontSize: "var(--fs-13)", textAlign: "right", minWidth: 180 }}>
                      {sched && <div>{sched}</div>}
                      <div>{last ? `Last sent ${fmtDate(last)}` : "Not sent yet"}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn sm" onClick={() => setPreview(t)}><Eye size={16} strokeWidth={1.75} /> Preview</button>
                      <button className="btn primary sm" onClick={() => setSending(t)}><Send size={16} strokeWidth={1.75} /> Send</button>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          <div className="card">
            <div style={{ ...SECTION, marginBottom: 4 }}>Recipients</div>
            <div className="muted" style={{ fontSize: "var(--fs-13)" }}>
              {withEmail} of {data.recipients.length} occupied suites have an email on file. Add a tenant&apos;s contacts on their unit page to include them.
            </div>
          </div>

          <div className="card">
            <div style={{ ...SECTION, marginBottom: 8 }}>Sent</div>
            {data.sends.length === 0 && <div className="muted">Nothing sent from here yet.</div>}
            {data.sends.map((s) => (
              <div key={s.id} className="task-row" style={{ display: "flex", alignItems: "center", gap: 14, padding: "11px 2px", borderBottom: "1px solid var(--hairline)", flexWrap: "wrap" }}>
                {s.delivered === s.suites
                  ? <CircleCheck size={20} strokeWidth={1.75} color="var(--c-067647)" />
                  : <TriangleAlert size={20} strokeWidth={1.75} color="var(--c-b54708)" />}
                <div style={{ flex: "1 1 280px", fontWeight: 600 }}>{s.subject}</div>
                <div className="muted" style={{ fontSize: "var(--fs-13)" }}>
                  {fmtDate(s.sentAt)}{s.sentBy ? ` by ${titleName(s.sentBy)}` : ""} · {s.delivered} of {s.suites} suites{s.testMode ? " · test mode, not delivered" : ""}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {mounted && preview && createPortal(<PreviewModal t={preview} onClose={() => setPreview(null)} />, document.body)}
      {mounted && sending && data && createPortal(
        <SendModal t={sending} data={data} onClose={() => setSending(null)} onSent={load} />, document.body)}
    </main>
  );
}

function EmailFrame({ t }: { t: TenantTemplate }) {
  // The send's own HTML, with the images from wherever the portal is served.
  const html = useMemo(() => renderTenantEmail(t, `${window.location.origin}/site/email/tenant`).html, [t]);
  return <iframe title={`${t.name} preview`} srcDoc={html} sandbox="allow-popups"
    style={{ width: "100%", height: 560, border: "1px solid var(--border)", borderRadius: 12, background: "#fff" }} />;
}

function PreviewModal({ t, onClose }: { t: TenantTemplate; onClose: () => void }) {
  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modal" style={{ width: "min(700px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <div>
            <div className="modalTitle">{t.name}</div>
            <div className="muted">Subject: {t.subject}</div>
          </div>
          <button className="btn sm" aria-label="Close" onClick={onClose}><X size={16} strokeWidth={1.75} /></button>
        </div>
        <EmailFrame t={t} />
      </div>
    </div>
  );
}

function SendModal({ t, data, onClose, onSent }: { t: TenantTemplate; data: Data; onClose: () => void; onSent: () => void }) {
  const { user } = useUser();
  const [subject, setSubject] = useState(t.subject);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [testTo, setTestTo] = useState(STAFF_EMAIL[user.id] ?? "");
  const [busy, setBusy] = useState<"test" | "send" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [result, setResult] = useState<{ delivered: number; failed: number; testMode: boolean; failures: { unitRef: string; tenant: string; error?: string }[] } | null>(null);

  const reachable = data.recipients.filter((r) => r.emails.length);
  const missing = data.recipients.filter((r) => !r.emails.length);
  const picked = reachable.filter((r) => !excluded.has(r.unitRef));
  const byBuilding = useMemo(() => {
    const m = new Map<string, Recipient[]>();
    for (const r of reachable) m.set(r.building, [...(m.get(r.building) ?? []), r]);
    return [...m.entries()];
  }, [reachable]);
  const toggle = (u: string) => setExcluded((s) => { const n = new Set(s); n.has(u) ? n.delete(u) : n.add(u); return n; });
  const toggleBuilding = (rs: Recipient[]) => setExcluded((s) => {
    const n = new Set(s); const allOn = rs.every((r) => !n.has(r.unitRef));
    rs.forEach((r) => (allOn ? n.add(r.unitRef) : n.delete(r.unitRef))); return n;
  });

  const post = async (action: "test" | "send") => {
    setBusy(action); setNote(null);
    try {
      const r = await fetch("/api/communications", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, templateId: t.id, subject, to: testTo, excluded: [...excluded] }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "That did not send.");
      if (action === "test") setNote(j.testMode ? `Accepted in test mode — nothing was delivered.` : `Test sent to ${testTo}.`);
      else { setResult(j); onSent(); }
    } catch (e) { setNote(String((e as Error).message ?? e)); }
    finally { setBusy(null); }
  };

  if (result) {
    return (
      <div className="modalOverlay">
        <div className="modal" style={{ width: "min(620px, 100%)" }}>
          <div className="modalHeader"><div className="modalTitle">{result.failed ? "Sent, with problems" : "Sent"}</div></div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <CircleCheck size={20} strokeWidth={1.75} color="var(--c-067647)" />
            <span><b>{subject}</b> went to {result.delivered} suite{result.delivered === 1 ? "" : "s"}.{result.testMode ? " Test mode: nothing was delivered." : ""}</span>
          </div>
          {result.failures.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <TriangleAlert size={20} strokeWidth={1.75} color="var(--c-b42318)" />
                <span>{result.failed} did not send:</span>
              </div>
              {result.failures.map((f) => <div key={f.unitRef} className="muted" style={{ fontSize: "var(--fs-13)", paddingLeft: 30 }}>{f.tenant} ({f.unitRef}) — {f.error}</div>)}
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end" }}><button className="btn primary" onClick={onClose}>Done</button></div>
        </div>
      </div>
    );
  }

  return (
    <div className="modalOverlay" onClick={busy ? undefined : onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <div>
            <div className="modalTitle">Send {t.name}</div>
            <div className="muted">From {data.from}</div>
          </div>
          <button className="btn sm" aria-label="Close" onClick={onClose} disabled={!!busy}><X size={16} strokeWidth={1.75} /></button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 18 }} className="queue-grid">
          <div style={{ minWidth: 0 }}>
            <label style={{ ...SECTION, display: "block", marginBottom: 4 }}>Subject</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} style={{ width: "100%" }} />
            {t.kind === "weather" && <div className="muted" style={{ fontSize: "var(--fs-13)", marginTop: 4 }}>Add the dates, e.g. &ldquo;{t.subject}: Tuesday through Thursday&rdquo;.</div>}
            <div style={{ marginTop: 12 }}><EmailFrame t={t} /></div>
          </div>

          <div style={{ minWidth: 0 }}>
            <div style={{ ...SECTION, marginBottom: 4 }}>Recipients · {picked.length} of {reachable.length} suites</div>
            <div style={{ maxHeight: 420, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 12, padding: "4px 12px" }}>
              {byBuilding.map(([b, rs]) => (
                <div key={b}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0 4px" }}>
                    <RoundCheck size={20} done={rs.every((r) => !excluded.has(r.unitRef))} onToggle={() => toggleBuilding(rs)} label={`Include all of ${b}`} />
                    <span style={{ fontWeight: 700 }}>{b}</span>
                  </div>
                  {rs.map((r) => (
                    <div key={r.unitRef} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "6px 0 6px 18px", borderBottom: "1px solid var(--hairline)" }}>
                      <RoundCheck size={20} done={!excluded.has(r.unitRef)} onToggle={() => toggle(r.unitRef)} label={`Include ${r.tenant}`} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: "var(--fs-14)" }}>{r.tenant} <span className="muted" style={{ fontWeight: 400 }}>· Suite {r.suite}</span></div>
                        <div className="muted" style={{ fontSize: "var(--fs-13)", overflowWrap: "anywhere" }}>{r.emails.join(", ")}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            {missing.length > 0 && (
              <div className="muted" style={{ fontSize: "var(--fs-13)", marginTop: 6 }}>
                {missing.length} suite{missing.length === 1 ? " has" : "s have"} no email on file and won&apos;t get it: {missing.slice(0, 6).map((m) => m.tenant).join(", ")}{missing.length > 6 ? `, and ${missing.length - 6} more` : ""}.
              </div>
            )}

            <div style={{ ...SECTION, margin: "14px 0 4px" }}>Send a test first</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@kormancommercial.com" style={{ flex: 1, minWidth: 0 }} />
              <button className="btn" disabled={!!busy || !testTo.trim()} onClick={() => post("test")}>{busy === "test" ? "Sending…" : "Send test"}</button>
            </div>
          </div>
        </div>

        {note && <div style={{ marginTop: 10 }}>{note}</div>}
        {!data.mailReady && <div style={{ marginTop: 10, color: "var(--c-b42318)" }}>Email is not set up on this server.</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
          <button className="btn" onClick={onClose} disabled={!!busy}>Cancel</button>
          <button className="btn primary" disabled={!!busy || !picked.length || !subject.trim() || !data.mailReady} onClick={() => post("send")}>
            {busy === "send" ? `Sending to ${picked.length} suites…` : `Send to ${picked.length} suite${picked.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}

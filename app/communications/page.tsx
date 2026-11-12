"use client";
// Tenant Communications — Greg's page for the Interplex tenant emails (owner,
// 11/2026). Each email is a designed graphic with a live "Submit a request" /
// "Report a problem" button and nothing else; Greg picks one, sets the subject
// (weather alerts get their dates; a building notice gets its buildings and
// dates, laid into the email as a table) and opens it as a DRAFT IN OUTLOOK
// (`draftEml.ts`) — the portal never sends it (owner: "make it a draft email
// in his outlook to add his custom distribution lists to send from there").
// He sends from Outlook, then marks it sent here. The seasonal ones carry
// their timing and prompt on his dashboard when due.

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CircleCheck, Eye, Mail, Plus, Trash2, TriangleAlert, X } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import LoadingState from "../components/LoadingState";
import { renderTenantEmail, scheduleLabel, type TenantTemplate } from "@/lib/communications/templates";
import { draftEml, draftFileName } from "@/lib/communications/draftEml";
import { Calendar } from "../components/Calendar";
import { ALL_BUILDINGS, BUILDINGS, TIME_OPTIONS, scheduleSubject, type ScheduleRow, type ScheduleSpec } from "@/lib/communications/schedule";

type Work = { rows: ScheduleRow[]; building?: string };
const startRows = (spec: ScheduleSpec): ScheduleRow[] =>
  (spec.defaultBuildings?.length ? spec.defaultBuildings : [BUILDINGS[0].code]).map((building) => ({
    building, cells: spec.columns.map((c) => (c.kind === "time" ? TIME_OPTIONS[0] : "")),
  }));

type SendSummary = { id: string; templateId: string; subject: string; sentAt: string; sentBy: string | null; testMode: boolean; viaOutlook: boolean; suites: number; delivered: number };
type Due = { id: string; name: string; dueISO: string; overdue: boolean };
type Data = {
  templates: TenantTemplate[]; lastSent: Record<string, string>; due: Due[]; sends: SendSummary[];
};

const SECTION: React.CSSProperties = { fontSize: "var(--fs-12)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" };
const fmtDate = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const titleName = (s: string | null) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : "");

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

  return (
    <main>
      <PageHeader
        title="Tenant Communications"
        info={<>
          Emails to the tenants at the Neshaminy Interplex. Each one is a designed graphic with a button to the
          service request page — the subject line and the graphic, nothing else. Draft in Outlook opens it as a new
          email in Outlook: add your distribution lists in To (or Bcc) and send it from there, then mark it sent
          here. Seasonal tips have a send-by date and remind you on your dashboard; weather alerts are sent when
          the forecast calls for them.
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
                    onClick={() => setSending(data.templates.find((t) => t.id === d.id) ?? null)}>Draft {d.name}</button>
                </div>
              ))}
            </div>
          )}

          {(["seasonal", "weather", "notice"] as const).map((kind) => (
            <div className="card" key={kind}>
              <div style={{ ...SECTION, marginBottom: 4 }}>{kind === "seasonal" ? "Seasonal Tips" : kind === "weather" ? "Weather Alerts" : "Building Notices"}</div>
              <div className="muted" style={{ fontSize: "var(--fs-13)", marginBottom: 8 }}>
                {kind === "seasonal" ? "Sent once a season. Your dashboard reminds you when one is due." : kind === "weather" ? "Keep these ready. Send one when a forecast calls for it, with the dates in the subject." : "Scheduled work, and alerts for a building. Pick the buildings and dates; they go into the email as a table."}
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
                      <button className="btn primary sm" onClick={() => setSending(t)}><Mail size={16} strokeWidth={1.75} /> Draft in Outlook</button>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          <div className="card">
            <div style={{ ...SECTION, marginBottom: 8 }}>Sent</div>
            {data.sends.length === 0 && <div className="muted">Nothing marked sent yet.</div>}
            {data.sends.map((s) => (
              <div key={s.id} className="task-row" style={{ display: "flex", alignItems: "center", gap: 14, padding: "11px 2px", borderBottom: "1px solid var(--hairline)", flexWrap: "wrap" }}>
                {s.viaOutlook || s.delivered === s.suites
                  ? <CircleCheck size={20} strokeWidth={1.75} color="var(--c-067647)" />
                  : <TriangleAlert size={20} strokeWidth={1.75} color="var(--c-b54708)" />}
                <div style={{ flex: "1 1 280px", fontWeight: 600 }}>{s.subject}</div>
                <div className="muted" style={{ fontSize: "var(--fs-13)" }}>
                  {fmtDate(s.sentAt)}{s.sentBy ? ` by ${titleName(s.sentBy)}` : ""} · {s.viaOutlook ? "from Outlook" : `${s.delivered} of ${s.suites} suites${s.testMode ? " · test mode, not delivered" : ""}`}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {mounted && preview && createPortal(<PreviewModal t={preview} onClose={() => setPreview(null)} />, document.body)}
      {mounted && sending && data && createPortal(
        <DraftModal t={sending} onClose={() => setSending(null)} onSent={load} />, document.body)}
    </main>
  );
}

// The preview fills the window (owner: "make the winter tips window longer") —
// `room` is what the modal's header and controls take above and below it.
function EmailFrame({ t, room = 180, work }: { t: TenantTemplate; room?: number; work?: Work }) {
  // The draft's own HTML, with the images from wherever the portal is served.
  const html = useMemo(() => renderTenantEmail(t, `${window.location.origin}/site/email/tenant`, work ?? (t.work ? { rows: startRows(t.work) } : undefined)).html, [t, work]);
  return <iframe title={`${t.name} preview`} srcDoc={html} sandbox="allow-popups"
    style={{ width: "100%", height: `max(420px, calc(100vh - ${room}px))`, border: "1px solid var(--border)", borderRadius: 12, background: "#fff" }} />;
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

function DraftModal({ t, onClose, onSent }: { t: TenantTemplate; onClose: () => void; onSent: () => void }) {
  const [subject, setSubject] = useState(t.subject);
  // A building notice: the rows Greg enters, and an optional building to
  // highlight (for a draft going to one building's distribution list).
  const [rows, setRows] = useState<ScheduleRow[]>(() => (t.work ? startRows(t.work) : []));
  const [highlight, setHighlight] = useState("");
  const [subjectTyped, setSubjectTyped] = useState(false);
  const work: Work | undefined = t.work ? { rows: rows.filter((r) => r.cells.some((c, i) => c && t.work!.columns[i].kind !== "time")), building: highlight || undefined } : undefined;
  useEffect(() => { if (t.work && !subjectTyped) setSubject(scheduleSubject(t.work, work!.rows)); }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const [drafted, setDrafted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [marked, setMarked] = useState(false);

  // The draft is built here from the preview's own HTML and handed to the
  // browser as an .eml — Outlook opens it as a new, unsent email.
  const openDraft = () => {
    const blob = new Blob([draftEml(t, subject.trim() || t.subject, work)], { type: "message/rfc822" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = draftFileName(subject.trim() || t.subject);
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    setDrafted(true);
  };

  const markSent = async () => {
    setBusy(true); setNote(null);
    try {
      const r = await fetch("/api/communications", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sent", templateId: t.id, subject }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Could not mark it sent.");
      setMarked(true); onSent();
    } catch (e) { setNote(String((e as Error).message ?? e)); }
    finally { setBusy(false); }
  };

  if (marked) {
    return (
      <div className="modalOverlay" onClick={onClose}>
        <div className="modal" style={{ width: "min(560px, 100%)" }} onClick={(e) => e.stopPropagation()}>
          <div className="modalHeader"><div className="modalTitle">Marked sent</div></div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <CircleCheck size={20} strokeWidth={1.75} color="var(--c-067647)" />
            <span><b>{subject}</b> is recorded as sent today.</span>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}><button className="btn primary" onClick={onClose}>Done</button></div>
        </div>
      </div>
    );
  }

  return (
    <div className="modalOverlay" onClick={busy ? undefined : onClose}>
      <div className="modal" style={{ width: "min(720px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <div>
            <div className="modalTitle">Draft {t.name} in Outlook</div>
            <div className="muted">Opens as a new email from your Outlook. Add your distribution lists, then send it there.</div>
          </div>
          <button className="btn sm" aria-label="Close" onClick={onClose} disabled={busy}><X size={16} strokeWidth={1.75} /></button>
        </div>

        <label style={{ ...SECTION, display: "block", marginBottom: 4 }}>Subject</label>
        <input value={subject} onChange={(e) => { setSubject(e.target.value); setSubjectTyped(true); }} style={{ width: "100%" }} />
        {t.kind === "weather" && <div className="muted" style={{ fontSize: "var(--fs-13)", marginTop: 4 }}>Add the dates, e.g. &ldquo;{t.subject}: Tuesday through Thursday&rdquo;.</div>}
        {t.work && <ScheduleEditor spec={t.work} rows={rows} setRows={setRows} highlight={highlight} setHighlight={setHighlight} />}
        <div style={{ marginTop: 12 }}><EmailFrame t={t} room={370} work={work} /></div>

        {drafted && (
          <div className="muted" style={{ fontSize: "var(--fs-14)", marginTop: 10 }}>
            The draft downloaded — open it and Outlook shows it as a new email. Put your distribution lists in To or Bcc
            and send. Once it has gone, mark it sent so your dashboard stops reminding you.
          </div>
        )}
        {note && <div style={{ marginTop: 10, color: "var(--c-b42318)" }}>{note}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          <button className="btn" onClick={onClose} disabled={busy}>Close</button>
          {drafted && <button className="btn" disabled={busy || !subject.trim()} onClick={markSent}>{busy ? "Saving…" : "I sent it — mark sent"}</button>}
          <button className={drafted ? "btn" : "btn primary"} disabled={!subject.trim()} onClick={openDraft}>
            <Mail size={16} strokeWidth={1.75} /> {drafted ? "Download the draft again" : "Open draft in Outlook"}
          </button>
        </div>
      </div>
    </div>
  );
}

// The notice's rows: a building, then its dates / time / details. The subject
// follows the rows until Greg types his own.
function ScheduleEditor({ spec, rows, setRows, highlight, setHighlight }: {
  spec: ScheduleSpec; rows: ScheduleRow[]; setRows: (r: ScheduleRow[]) => void; highlight: string; setHighlight: (b: string) => void;
}) {
  const set = (i: number, patch: Partial<ScheduleRow>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const setCell = (i: number, c: number, v: string) => set(i, { cells: rows[i].cells.map((x, k) => (k === c ? v : x)) });
  const blank = (): ScheduleRow => ({ building: BUILDINGS[0].code, cells: spec.columns.map((c) => (c.kind === "time" ? TIME_OPTIONS[0] : "")) });
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ ...SECTION, marginBottom: 6 }}>{spec.title === "Building" ? "Buildings" : spec.title}</div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            <th style={{ textAlign: "left", padding: "0 8px 6px 0" }}>Building</th>
            {spec.columns.map((c) => <th key={c.label} style={{ textAlign: "left", padding: "0 8px 6px 0" }}>{c.label}{c.kind === "week" ? " (week of)" : ""}</th>)}
            <th />
          </tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderBottom: "1px solid var(--hairline)" }}>
                <td style={{ padding: "6px 8px 6px 0" }}>
                  <select value={r.building} onChange={(e) => set(i, { building: e.target.value })}>
                    {BUILDINGS.map((b) => <option key={b.code} value={b.code}>{b.label}</option>)}
                    <option value={ALL_BUILDINGS}>All buildings</option>
                  </select>
                </td>
                {spec.columns.map((c, k) => (
                  <td key={c.label} style={{ padding: "6px 8px 6px 0", minWidth: c.kind === "time" ? 120 : 150 }}>
                    {c.kind === "time"
                      ? <select value={r.cells[k]} onChange={(e) => setCell(i, k, e.target.value)}>{TIME_OPTIONS.map((o) => <option key={o}>{o}</option>)}</select>
                      : c.kind === "text"
                        ? <input value={r.cells[k]} placeholder={c.label === "Elevator" ? "e.g. Main lobby" : "e.g. Today, 2 PM"} onChange={(e) => setCell(i, k, e.target.value)} style={{ width: "100%" }} />
                        : <Calendar variant="card" value={r.cells[k]} disableWeekends={c.kind === "week"} placeholder={c.kind === "week" ? "Pick the Monday" : "Pick a date"} onChange={(v) => setCell(i, k, v)} />}
                  </td>
                ))}
                <td style={{ padding: "6px 0", width: 40 }}>
                  <button className="btn sm" aria-label="Remove row" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 size={16} strokeWidth={1.75} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
        <button className="btn sm" onClick={() => setRows([...rows, blank()])}><Plus size={16} strokeWidth={1.75} /> Add a row</button>
        <span className="muted" style={{ fontSize: "var(--fs-13)", marginLeft: "auto" }}>Highlight a building</span>
        <select value={highlight} onChange={(e) => setHighlight(e.target.value)}>
          <option value="">None, the whole park</option>
          {BUILDINGS.filter((b) => rows.some((r) => r.building === b.code)).map((b) => <option key={b.code} value={b.code}>{b.label}</option>)}
        </select>
      </div>
      <div className="muted" style={{ fontSize: "var(--fs-13)", marginTop: 4 }}>
        Rows left blank are left out. Highlighting a building opens the email with its own dates. Use it when this draft goes to one building&rsquo;s list.
      </div>
    </div>
  );
}

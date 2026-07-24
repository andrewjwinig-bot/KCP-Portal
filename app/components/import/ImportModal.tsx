"use client";

// The shared import modal — two states of one surface:
//   A) uploading ("thinking"): progress ring, shimmer status, live file list.
//   B) report: stat strip, imported-file list, conditional unlocks, opt-in AI.
// Plus a collapsed progress pill when minimized. Colors: utility blue = import,
// green = success, violet (--ai) = the opt-in auto-explain follow-up only.

import { useEffect, useRef } from "react";
import { MONO, SparkleMark } from "@/app/components/ai/AiKit";
import type { ImportFile, ImportRun } from "./types";

const RING_R = 38;
const RING_C = 2 * Math.PI * RING_R; // ≈ 238.76

type Handlers = {
  onClose: () => void;
  onCancel: () => void;
  onMinimize: () => void;
  onRestore: () => void;
  onAcceptAutoExplain: () => void;
  onDismissAutoExplain: () => void;
};

const num = (n: number) => n.toLocaleString("en-US");

export function ImportModal({ run, ...h }: { run: ImportRun } & Handlers) {
  const total = run.files.length;
  const done = run.files.filter((f) => f.status === "done").length;
  const failed = run.files.filter((f) => f.status === "failed").length;
  const settled = done + failed;
  const pct = total ? settled / total : 0;

  if (run.minimized) return <ImportPill run={run} done={settled} total={total} onRestore={h.onRestore} />;

  const uploading = run.state === "uploading";
  return (
    <div
      onClick={uploading ? undefined : h.onClose}
      style={{ position: "fixed", inset: 0, zIndex: 60, background: "var(--import-scrim)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "6vh 16px", overflow: "auto" }}
    >
      <div
        className="imp-anim"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{ width: 600, maxWidth: "100%", background: "var(--card)", borderRadius: 16, boxShadow: "var(--ai-modal-shadow)", overflow: "hidden", display: "flex", flexDirection: "column", maxHeight: "88vh" }}
      >
        {uploading ? <UploadingState run={run} pct={pct} done={settled} total={total} {...h} /> : <ReportState run={run} done={done} failed={failed} total={total} {...h} />}
      </div>
    </div>
  );
}

// ── State A — uploading ──────────────────────────────────────────────────────
function UploadingState({ run, pct, done, total, onMinimize, onCancel }: { run: ImportRun; pct: number; done: number; total: number } & Handlers) {
  const active = run.files.find((f) => f.status === "reading");
  const parsedCount = run.files.reduce((a, f) => a + (f.status === "done" ? f.count ?? 0 : 0), 0);
  return (
    <>
      {/* chrome activity bar */}
      <div style={{ height: 3, background: "var(--import-strip-div)", overflow: "hidden", position: "relative" }}>
        <div style={{ position: "absolute", top: 0, bottom: 0, width: "25%", background: "linear-gradient(90deg, transparent, var(--import-blue), transparent)", animation: "impBar 2.6s linear infinite" }} />
      </div>

      <Header
        icon={<span style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2, width: 16, height: 16 }}>
          {[0, 1, 2, 3].map((i) => <span key={i} style={{ borderRadius: 2, background: i % 3 === 0 ? "var(--import-blue)" : "var(--import-blue-light)" }} />)}
        </span>}
        iconBg="var(--import-blue-soft)" iconBorder="var(--import-blue-border)"
        title={run.title} subtitle={run.subtitle}
        right={<button aria-label="Minimize" onClick={onMinimize} title="Keep working — this continues in the background" style={ghostIcon}>–</button>}
      />

      {/* focal: ring + status */}
      <div style={{ display: "flex", gap: 20, alignItems: "center", padding: "6px 18px 14px" }}>
        <Ring pct={pct} done={done} total={total} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15.5, fontWeight: 700, ...shimmer }}>Reading {run.kind === "ap" ? "AP selection reports" : "detailed general ledgers"}…</div>
          <div className="muted" style={{ fontSize: 13, marginTop: 3, lineHeight: 1.45 }}>Parsing accounts, periods &amp; balances. Validating each file against its property before it posts.</div>
          <div style={{ marginTop: 7, fontFamily: MONO, fontSize: 12, color: "var(--muted)" }}>
            {active ? `Reading ${active.entity ?? active.filename}…` : `${done} of ${total} done`}
            {parsedCount > 0 && <> · {num(parsedCount)} accounts parsed</>}
          </div>
        </div>
      </div>

      <FileList files={run.files} />

      {/* footer */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 18px", borderTop: "1px solid var(--border)" }}>
        <Dots />
        <span className="muted" style={{ fontFamily: MONO, fontSize: 12, flex: 1 }}>Import continues in the background</span>
        <button onClick={onCancel} className="btn" style={{ fontSize: 12.5, padding: "6px 12px", fontWeight: 700 }}>Cancel import</button>
      </div>
    </>
  );
}

function Ring({ pct, done, total }: { pct: number; done: number; total: number }) {
  const dash = Math.max(0, Math.min(1, pct)) * RING_C;
  return (
    <div style={{ position: "relative", width: 96, height: 96, flexShrink: 0 }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "2px dashed var(--import-blue-border)", animation: "impHalo 9s linear infinite" }} />
      <svg width="96" height="96" viewBox="0 0 96 96" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="48" cy="48" r={RING_R} fill="none" stroke="var(--import-strip-div)" strokeWidth="8" />
        <circle cx="48" cy="48" r={RING_R} fill="none" stroke="var(--import-blue)" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${dash} ${RING_C - dash}`} style={{ transition: "stroke-dasharray .4s ease" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, color: "var(--text)" }}>{done}<span style={{ color: "var(--muted)" }}>/{total}</span></div>
        <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)" }}>files</div>
      </div>
    </div>
  );
}

function FileList({ files }: { files: ImportFile[] }) {
  // Show every file in a tall scroll region (so a big multi-file import isn't
  // hidden behind "+N more"), and keep the file currently parsing in view.
  const activeIdx = files.findIndex((f) => f.status === "reading");
  const activeRef = useRef<HTMLDivElement>(null);
  useEffect(() => { activeRef.current?.scrollIntoView({ block: "nearest" }); }, [activeIdx]);
  return (
    <div style={{ overflowY: "auto", maxHeight: "min(48vh, 520px)", borderTop: "1px solid var(--border)" }}>
      {files.map((f, i) => <Row key={i} f={f} innerRef={i === activeIdx ? activeRef : undefined} />)}
    </div>
  );
}

function Row({ f, innerRef }: { f: ImportFile; innerRef?: React.Ref<HTMLDivElement> }) {
  const reading = f.status === "reading";
  return (
    <div ref={innerRef} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 18px", borderBottom: "1px solid var(--import-strip-div)", opacity: f.status === "queued" ? 0.6 : 1, position: "relative", overflow: "hidden", background: reading ? "var(--import-blue-soft)" : undefined }}>
      {reading && <span className="imp-anim" style={{ position: "absolute", inset: 0, animation: "impPulse 1.8s ease-in-out infinite", background: "var(--import-blue-soft)", pointerEvents: "none" }} />}
      <StatusDot status={f.status} />
      <div style={{ minWidth: 0, flex: 1, position: "relative" }}>
        <div style={{ fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          <span style={{ fontFamily: MONO, color: f.status === "failed" ? "#b91c1c" : "var(--import-blue)" }}>{f.filename}</span>
          {f.entity && <span className="muted" style={{ marginLeft: 8 }}>{f.entity}{f.detail ? ` · ${f.detail}` : ""}</span>}
        </div>
        {f.note && <div style={{ fontSize: 11.5, marginTop: 1, color: f.noteTone === "warn" ? "#b45309" : "var(--ok)" }}>{f.note}</div>}
        {f.status === "failed" && f.error && <div style={{ fontSize: 11.5, marginTop: 1, color: "#b91c1c" }}>{f.error}</div>}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 12, color: statusColor(f.status), position: "relative", whiteSpace: "nowrap" }}>
        {f.status === "done" && f.count != null ? `${num(f.count)} ${f.countLabel ?? ""}`.trim()
          : f.status === "reading" ? "reading…"
          : f.status === "failed" ? "failed"
          : "queued"}
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: ImportFile["status"] }) {
  if (status === "done") return <span style={{ ...dotBase, background: "var(--ok)", color: "#fff" }}>✓</span>;
  if (status === "failed") return <span style={{ ...dotBase, background: "#b91c1c", color: "#fff" }}>✕</span>;
  if (status === "reading") return <span className="imp-anim" style={{ width: 18, height: 18, borderRadius: "50%", border: "2px solid var(--import-blue-border)", borderTopColor: "var(--import-blue)", animation: "spin .8s linear infinite", flexShrink: 0 }} />;
  return <span style={{ width: 18, height: 18, borderRadius: "50%", border: "2px solid var(--border)", flexShrink: 0 }} />;
}

// ── State B — report ─────────────────────────────────────────────────────────
function ReportState({ run, done, failed, total, onClose, onAcceptAutoExplain, onDismissAutoExplain }: { run: ImportRun; done: number; failed: number; total: number } & Handlers) {
  const allOk = failed === 0;
  const heading = allOk ? `All ${total} file${total === 1 ? "" : "s"} imported` : `${done} of ${total} imported · ${failed} failed`;
  const rep = run.report;
  return (
    <>
      <div style={{ height: 4, background: allOk ? "linear-gradient(90deg, var(--ok), var(--ok-accent))" : "linear-gradient(90deg, #b45309, #d97706)" }} />
      <Header
        icon={<span className="imp-anim" style={{ animation: "impPop .5s ease both", fontSize: 20, color: "var(--ok)", fontWeight: 800 }}>{allOk ? "✓" : "!"}</span>}
        iconBg="var(--ok-circle)" iconBorder="var(--ok-border)" iconSize={44}
        title={<span style={{ color: allOk ? "var(--ok-head)" : "#b45309", fontSize: 18, fontWeight: 800 }}>{heading}</span>}
        subtitle={`Just now${run.by ? ` · by ${run.by}` : ""}`}
        right={<button aria-label="Close" onClick={onClose} style={ghostIcon}>×</button>}
      />

      {rep?.stats && rep.stats.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${rep.stats.length}, 1fr)`, borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", background: "var(--import-strip)" }}>
          {rep.stats.map((s, i) => (
            <div key={i} style={{ padding: "11px 14px", borderLeft: i ? "1px solid var(--import-strip-div)" : undefined }}>
              <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 700, color: "var(--text)" }}>{s.value}</div>
              <div className="muted" style={{ fontSize: 11 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ padding: "12px 18px 4px", fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)", fontWeight: 700 }}>Imported files</div>
      <div style={{ overflowY: "auto", maxHeight: 196, padding: "0 18px" }}>
        {run.files.map((f, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid var(--import-strip-div)" }}>
            <span style={{ color: f.status === "failed" ? "#b91c1c" : "var(--ok)", fontSize: 13 }}>{f.status === "failed" ? "✕" : "✓"}</span>
            <span style={{ fontFamily: MONO, fontSize: 12.5, color: f.status === "failed" ? "#b91c1c" : "var(--import-blue)", width: 150, flexShrink: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.filename}</span>
            <span style={{ fontSize: 13, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.entity ?? (f.status === "failed" ? f.error : "")}</span>
            <span className="muted" style={{ fontFamily: MONO, fontSize: 12 }}>{f.count != null ? num(f.count) : ""}</span>
          </div>
        ))}
      </div>

      <div style={{ padding: "12px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
        {rep?.unlocks?.map((u) => (
          <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 12, border: "1px solid var(--ok-border)", background: "var(--ok-bg)", borderRadius: 12, padding: "12px 15px" }}>
            <span style={{ width: 28, height: 28, borderRadius: 8, background: "var(--ok)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, flexShrink: 0 }}>✓</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ok-head)" }}>{u.title}</div>
              <div className="muted" style={{ fontSize: 12.5 }}>{u.subtitle}</div>
            </div>
            <a href={u.href} className="btn primary" style={{ fontSize: 12.5, padding: "7px 13px", fontWeight: 700, textDecoration: "none", flexShrink: 0 }}>{u.cta ?? "Open →"}</a>
          </div>
        ))}

        {rep?.autoExplain && run.autoExplain !== "dismissed" && run.autoExplain !== "none" && (
          <AutoExplainCard state={run.autoExplain} spec={rep.autoExplain} onAccept={onAcceptAutoExplain} onDismiss={onDismissAutoExplain} />
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, padding: "11px 18px", borderTop: "1px solid var(--border)" }}>
        <button onClick={onClose} className="btn primary" style={{ fontSize: 13, padding: "7px 16px", fontWeight: 700 }}>Done</button>
      </div>
    </>
  );
}

function AutoExplainCard({ state, spec, onAccept, onDismiss }: { state: ImportRun["autoExplain"]; spec: NonNullable<ImportRun["report"]>["autoExplain"]; onAccept: () => void; onDismiss: () => void }) {
  const running = state === "running";
  const doneState = state === "done";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, border: "1px solid var(--ai-border)", background: "var(--ai-tint-panel-2)", borderRadius: 12, padding: "12px 15px" }}>
      <span className="imp-anim" style={{ animation: "impFloat 3.5s ease-in-out infinite", flexShrink: 0 }}><SparkleMark size={30} twinkle={running} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ai-text)" }}>{spec?.title ?? "Auto-explain flagged lines?"}</div>
        <div className="muted" style={{ fontSize: 12.5 }}>{running ? "Auditing the imported GLs…" : doneState ? "Done — the Flags to Investigate report is annotated." : (spec?.subtitle ?? "Audit the imported GLs for the Flags to Investigate report.")}</div>
      </div>
      {!running && !doneState && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <button onClick={onDismiss} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ai-hero-sub)", fontSize: 12.5, fontWeight: 700 }}>Not now</button>
          <button onClick={onAccept} className="btn ai" style={{ fontSize: 12.5, padding: "7px 13px", fontWeight: 700 }}>✦ Auto-explain</button>
        </div>
      )}
      {running && <span className="imp-anim" style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid var(--ai-border)", borderTopColor: "var(--ai)", animation: "spin .8s linear infinite", flexShrink: 0 }} />}
      {doneState && <span style={{ color: "var(--ai-text)", fontWeight: 800, flexShrink: 0 }}>✓</span>}
    </div>
  );
}

// ── Minimized pill ───────────────────────────────────────────────────────────
function ImportPill({ run, done, total, onRestore }: { run: ImportRun; done: number; total: number; onRestore: () => void }) {
  const uploading = run.state === "uploading";
  const pct = total ? done / total : 0;
  return (
    <button
      className="imp-anim"
      onClick={onRestore}
      style={{ position: "fixed", bottom: 18, right: 18, zIndex: 60, display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", boxShadow: "var(--shadow)", cursor: "pointer", font: "inherit" }}
    >
      <span style={{ position: "relative", width: 22, height: 22 }}>
        <svg width="22" height="22" viewBox="0 0 22 22" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="11" cy="11" r="9" fill="none" stroke="var(--import-strip-div)" strokeWidth="3" />
          <circle cx="11" cy="11" r="9" fill="none" stroke={uploading ? "var(--import-blue)" : "var(--ok)"} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${pct * 2 * Math.PI * 9} ${2 * Math.PI * 9}`} />
        </svg>
      </span>
      <span style={{ fontSize: 13, fontWeight: 700 }}>{uploading ? "Importing" : "Import done"}</span>
      <span style={{ fontFamily: MONO, fontSize: 12, color: "var(--muted)" }}>{done}/{total}</span>
    </button>
  );
}

// ── shared bits ──────────────────────────────────────────────────────────────
function Header({ icon, iconBg, iconBorder, iconSize = 34, title, subtitle, right }: { icon: React.ReactNode; iconBg: string; iconBorder: string; iconSize?: number; title: React.ReactNode; subtitle: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px 8px" }}>
      <span style={{ width: iconSize, height: iconSize, borderRadius: 9, background: iconBg, border: `1px solid ${iconBorder}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>{title}</div>
        <div className="muted" style={{ fontSize: 12.5, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{subtitle}</div>
      </div>
      {right}
    </div>
  );
}

function Dots() {
  return (
    <span className="imp-anim" style={{ display: "inline-flex", gap: 4 }}>
      {[0, 1, 2].map((i) => <span key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--import-blue)", animation: `kcpDot 1.2s ${i * 0.15}s ease-in-out infinite` }} />)}
    </span>
  );
}

const ghostIcon: React.CSSProperties = { background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 20, lineHeight: 1, fontWeight: 700, padding: "0 4px" };
const dotBase: React.CSSProperties = { width: 18, height: 18, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, flexShrink: 0 };
const shimmer: React.CSSProperties = { background: "linear-gradient(90deg, var(--text) 30%, var(--import-blue) 50%, var(--text) 70%)", backgroundSize: "200% auto", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", animation: "kcpShimmer 2.2s linear infinite" };

function statusColor(s: ImportFile["status"]): string {
  return s === "done" ? "var(--ok)" : s === "reading" ? "var(--import-blue)" : s === "failed" ? "#b91c1c" : "var(--muted)";
}

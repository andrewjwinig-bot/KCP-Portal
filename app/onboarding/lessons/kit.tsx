"use client";
// The orientation's lesson kit (owner: "an interactive click through module
// where the goal is to actually get him to understand … visual and graphical
// and engaging"). Every lesson is a list of SCENES — a short explanation beside
// a stage he plays with — run by ONE shell (progress segments, Back / Next),
// so the fourteen lessons read and move the same. A lesson ends in a Recap
// whose button marks the module done.

import { useState } from "react";
import { ArrowLeft, ArrowRight, CircleCheck } from "lucide-react";

export type LessonProps = { onFinish: () => void; done?: boolean };
export type Scene = { kicker: string; title: string; body: React.ReactNode; doThis?: string; stage: React.ReactNode };

export const soft = (pct: number, tone = "var(--brand)") => `color-mix(in srgb, ${tone} ${pct}%, transparent)`;
export const SECTION: React.CSSProperties = { fontSize: "var(--fs-13)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)" };
export const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
export const GREEN = "var(--c-067647)";
export const RED = "var(--c-b42318)";
export const AMBER = "var(--c-b54708)";
export const ICON = { size: 20, strokeWidth: 1.75 } as const;
export const BIG_ICON = { size: 24, strokeWidth: 1.75 } as const;

/** A box on a diagram — lit when it's the one in play. */
export function Node({ icon, title, sub, lit, big, tone, onClick }: {
  icon?: React.ReactNode; title: React.ReactNode; sub?: React.ReactNode; lit?: boolean; big?: boolean; tone?: string; onClick?: () => void;
}) {
  const c = tone ?? "var(--brand)";
  const El = onClick ? "button" : "div";
  return (
    <El type={onClick ? "button" : undefined} onClick={onClick}
      style={{ border: `1px solid ${lit ? c : "var(--border)"}`, background: lit ? soft(7, c) : "var(--card)", borderRadius: 12, color: "var(--text)",
        padding: big ? "16px 18px" : "10px 12px", display: "flex", gap: 10, alignItems: "center", transition: "all .35s", minWidth: 0,
        textAlign: "left", cursor: onClick ? "pointer" : "default", font: "inherit", width: "100%" }}>
      {icon && <span style={{ color: lit ? c : "var(--muted)", display: "inline-flex", flex: "none" }}>{icon}</span>}
      <span style={{ minWidth: 0, display: "grid" }}>
        <span style={{ fontWeight: 800, fontSize: big ? 18 : 15, lineHeight: 1.25 }}>{title}</span>
        {sub && <span style={{ color: "var(--muted)", fontSize: "var(--fs-13)", lineHeight: 1.4 }}>{sub}</span>}
      </span>
    </El>
  );
}

/** A row of choices; the chosen one is navy. */
export function Toggle<T extends string>({ value, options, onChange }: { value: T | null; options: { id: NoInfer<T>; label: React.ReactNode }[]; onChange: (v: NoInfer<T>) => void }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {options.map((o) => (
        <button key={o.id} type="button" className={value === o.id ? "btn primary lesson-toggle" : "btn lesson-toggle"} onClick={() => onChange(o.id)}>{o.label}</button>
      ))}
    </div>
  );
}

/** A clickable list row (pick one, see it on the right). */
export function Pick({ on, onClick, children, tone }: { on: boolean; onClick: () => void; children: React.ReactNode; tone?: string }) {
  const c = tone ?? "var(--brand)";
  return (
    <button type="button" onClick={onClick}
      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 8, cursor: "pointer",
        textAlign: "left", font: "inherit", border: `1px solid ${on ? c : "var(--hairline)"}`, background: on ? soft(7, c) : "transparent", color: "var(--text)", width: "100%" }}>
      {children}
    </button>
  );
}

/** Label / value pairs, two columns. */
export function Facts({ rows }: { rows: [React.ReactNode, React.ReactNode][] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto minmax(0,1fr)", gap: "7px 16px", fontSize: "var(--fs-14)" }}>
      {rows.map(([k, v], n) => (<FactRow key={n} k={k} v={v} />))}
    </div>
  );
}
function FactRow({ k, v }: { k: React.ReactNode; v: React.ReactNode }) {
  return <><span style={{ color: "var(--muted)" }}>{k}</span><span>{v}</span></>;
}

/** A panel inside a stage (an invoice, a statement, a card). */
export function Panel({ children, title, right }: { children: React.ReactNode; title?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 16, display: "grid", gap: 12, background: "var(--card)", minWidth: 0 }}>
      {(title || right) && <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}><span style={SECTION}>{title}</span>{right}</div>}
      {children}
    </div>
  );
}

/** A horizontal bar with its value. */
export function Bar({ label, value, max, tone, note }: { label: React.ReactNode; value: number; max: number; tone?: string; note?: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(110px, 170px) minmax(0,1fr) auto", gap: 10, alignItems: "center", fontSize: "var(--fs-14)" }}>
      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      <div style={{ height: 14, borderRadius: 4, background: "var(--hairline)" }}>
        <div style={{ width: `${Math.max(0, Math.min(1, value / (max || 1))) * 100}%`, height: "100%", borderRadius: 4, transition: "width .35s", background: tone ?? "var(--brand)" }} />
      </div>
      <span style={{ textAlign: "right", fontWeight: 700, minWidth: 80, color: tone && tone !== "var(--brand)" ? tone : "var(--text)" }}>{note ?? value}</span>
    </div>
  );
}

/** A plain-words result line under a stage. */
export function Note({ tone, children }: { tone?: string; children: React.ReactNode }) {
  return <div style={{ color: tone ?? "var(--muted)", fontWeight: tone ? 700 : 400, lineHeight: 1.55 }}>{children}</div>;
}

/** The arrow between diagram boxes. */
export function Arrow({ on = true, down }: { on?: boolean; down?: boolean }) {
  return <ArrowRight size={22} strokeWidth={1.75} style={{ color: on ? "var(--brand)" : "var(--c-98a2b3)", transform: down ? "rotate(90deg)" : undefined, justifySelf: "center", flex: "none" }} />;
}

/** The closing scene: three things to carry, then Finish. */
export function Recap({ items, onFinish, done }: { items: [string, string][]; onFinish: () => void; done?: boolean }) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {items.map(([t, d], k) => (
        <div key={t} className="task-row" style={{ display: "grid", gridTemplateColumns: "36px minmax(0,1fr)", gap: 12, padding: "12px 2px", borderBottom: "1px solid var(--hairline)" }}>
          <span style={{ width: 32, height: 32, borderRadius: 999, border: "1px solid var(--brand)", color: "var(--brand)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>{k + 1}</span>
          <div><div style={{ fontWeight: 800, fontSize: 16 }}>{t}</div><div style={{ color: "var(--muted)", lineHeight: 1.5 }}>{d}</div></div>
        </div>
      ))}
      <button type="button" className="btn primary" style={{ justifySelf: "start", marginTop: 6 }} onClick={onFinish}>
        {done ? <><CircleCheck size={16} strokeWidth={1.75} /> Done — next module</> : "Finish module"}
      </button>
    </div>
  );
}

/** The shell every lesson runs in. */
export function LessonShell({ scenes }: { scenes: Scene[] }) {
  const [i, setI] = useState(0);
  const sc = scenes[i];
  return (
    <div className="lesson-host" style={{ display: "grid", gap: 18 }}>
      <div style={{ display: "flex", gap: 6 }}>
        {scenes.map((x, k) => (
          <button key={k} type="button" aria-label={`Step ${k + 1}: ${x.title}`} onClick={() => setI(k)}
            style={{ flex: 1, height: 6, borderRadius: 999, border: 0, padding: 0, cursor: "pointer", background: k <= i ? "var(--brand)" : "var(--hairline)", transition: "background .3s" }} />
        ))}
      </div>
      <div className="lesson-scene">
        <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
          <div style={SECTION}>{sc.kicker} · {i + 1} of {scenes.length}</div>
          <h3 style={{ margin: 0, fontSize: 26, lineHeight: 1.15 }}>{sc.title}</h3>
          <div style={{ lineHeight: 1.65, fontSize: 16 }}>{sc.body}</div>
          {sc.doThis && <div style={{ color: "var(--muted)", fontSize: "var(--fs-14)" }}>{sc.doThis}</div>}
        </div>
        <div key={i} className="lesson-stage">{sc.stage}</div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--hairline)", paddingTop: 14 }}>
        <button type="button" className="btn" disabled={i === 0} onClick={() => setI(i - 1)}><ArrowLeft size={16} strokeWidth={1.75} /> Back</button>
        {i < scenes.length - 1 && <button type="button" className="btn primary" onClick={() => setI(i + 1)}>Next <ArrowRight size={16} strokeWidth={1.75} /></button>}
      </div>
    </div>
  );
}

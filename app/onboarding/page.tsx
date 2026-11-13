"use client";
// ORIENTATION — Randy's onboarding (owner, 11/2026: "take this handbook and
// make like an onboarding orientation thing that has different modules for
// him to click through and learn to get acclimated"). Short modules
// built from the New Accountant Handbook (lib/onboarding/modules.ts), each a
// lesson, the portal pages to open, and a three-question check; the 90-day
// checklist he works through with Drew; the glossary; and the handbook itself.
// Progress is kept on the server (/api/onboarding) so Drew can follow along by
// viewing as Randy.

import { Fragment, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BookOpen, ChevronLeft, ChevronRight, Circle, CircleCheck, Clock, Download, Search, CircleX } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { StatPill } from "../components/Pill";
import { TabButton } from "../components/TabButton";
import { RoundCheck } from "../components/RoundCheck";
import AllowedLink from "../components/AllowedLink";
import LoadingState from "../components/LoadingState";
import { th, thL, td, tdL } from "../components/tableStyles";
import { CHECKLIST, GLOSSARY, MODULES, PARTS, totalMinutes, type Block, type Module } from "@/lib/onboarding/modules";

type Progress = {
  modules: Record<string, { doneAt: string; score: number; of: number }>;
  checklist: Record<string, { doneAt: string; by: string }>;
  startedAt?: string;
};

const SECTION: React.CSSProperties = { fontSize: "var(--fs-13)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)" };
const fmtDate = (iso?: string) => iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";

/** Text with `code` spans — account numbers and property codes read as code. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/g);
  return <>{parts.map((p, i) => p.startsWith("`") && p.endsWith("`") ? <code key={i}>{p.slice(1, -1)}</code> : <Fragment key={i}>{p}</Fragment>)}</>;
}

function BlockView({ b }: { b: Block }) {
  if (b.t === "p") return <p style={{ margin: 0, lineHeight: 1.6 }}><Rich text={b.text} /></p>;
  if (b.t === "points") return (
    <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6, lineHeight: 1.55 }}>
      {b.items.map((x, i) => <li key={i}><Rich text={x} /></li>)}
    </ul>
  );
  if (b.t === "key") return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" }}>
      <BookOpen size={20} strokeWidth={1.75} style={{ color: "var(--brand)", flexShrink: 0, marginTop: 2 }} />
      <div style={{ lineHeight: 1.55, fontWeight: 600 }}><Rich text={b.text} /></div>
    </div>
  );
  if (b.t === "table") return (
    <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 12 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
        <thead><tr>{b.head.map((h, i) => <th key={i} style={{ ...thL, whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
        <tbody>{b.rows.map((r, i) => (
          <tr key={i}>{r.map((c, j) => <td key={j} style={{ ...tdL, whiteSpace: "normal", verticalAlign: "top", fontWeight: j === 0 ? 600 : 400, lineHeight: 1.45 }}><Rich text={c} /></td>)}</tr>
        ))}</tbody>
      </table>
    </div>
  );
  return (
    <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 0 }}>
      {b.items.map((s, i) => (
        <li key={i} style={{ display: "grid", gridTemplateColumns: "32px minmax(0, 1fr)", gap: 12, padding: "10px 0", borderBottom: i < b.items.length - 1 ? "1px solid var(--hairline)" : undefined }}>
          <span style={{ width: 28, height: 28, borderRadius: 999, border: "1px solid var(--brand)", color: "var(--brand)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "var(--fs-13)" }}>{i + 1}</span>
          <div><div style={{ fontWeight: 700 }}><Rich text={s.title} /></div><div style={{ color: "var(--muted)", lineHeight: 1.5 }}><Rich text={s.text} /></div></div>
        </li>
      ))}
    </ol>
  );
}

/** The three-question check at the end of a module. */
function Check({ mod, onFinished, done }: { mod: Module; onFinished: (score: number) => void; done?: { score: number; of: number } }) {
  const [picked, setPicked] = useState<(number | null)[]>(() => mod.quiz.map(() => null));
  useEffect(() => setPicked(mod.quiz.map(() => null)), [mod.id]);
  const answered = picked.every((p) => p !== null);
  const score = picked.filter((p, i) => p === mod.quiz[i].answer).length;
  return (
    <section style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, fontSize: "var(--fs-17, 17px)" }}>Check Yourself</h3>
        {done && <span style={{ color: "var(--c-067647)", fontWeight: 700, display: "inline-flex", gap: 6, alignItems: "center" }}><CircleCheck size={16} strokeWidth={1.75} /> Completed · {done.score} of {done.of}</span>}
      </div>
      {mod.quiz.map((q, qi) => {
        const p = picked[qi];
        return (
          <div key={qi} style={{ display: "grid", gap: 8 }}>
            <div style={{ fontWeight: 700, lineHeight: 1.45 }}>{qi + 1}. <Rich text={q.q} /></div>
            <div style={{ display: "grid", gap: 6 }}>
              {q.options.map((o, oi) => {
                const chosen = p === oi, right = oi === q.answer, reveal = p !== null;
                const tone = reveal && right ? "var(--c-067647)" : reveal && chosen ? "var(--c-b42318)" : undefined;
                return (
                  <button key={oi} type="button" disabled={reveal} onClick={() => setPicked((x) => x.map((v, i) => i === qi ? oi : v))}
                    style={{ display: "flex", alignItems: "center", gap: 10, textAlign: "left", padding: "10px 12px", borderRadius: 8, cursor: reveal ? "default" : "pointer",
                      border: `1px solid ${tone ?? "var(--border)"}`, background: "var(--card)", color: "var(--text)", fontSize: "var(--fs-14)", fontWeight: chosen ? 700 : 500 }}>
                    {reveal && right ? <CircleCheck size={18} strokeWidth={1.75} style={{ color: tone, flexShrink: 0 }} />
                      : reveal && chosen ? <CircleX size={18} strokeWidth={1.75} style={{ color: tone, flexShrink: 0 }} />
                      : <Circle size={18} strokeWidth={1.75} style={{ color: "var(--muted)", flexShrink: 0 }} />}
                    <span><Rich text={o} /></span>
                  </button>
                );
              })}
            </div>
            {p !== null && (
              <div style={{ color: "var(--muted)", lineHeight: 1.5 }}>
                <strong style={{ color: p === q.answer ? "var(--c-067647)" : "var(--c-b42318)" }}>{p === q.answer ? "Right." : "Not quite."}</strong> <Rich text={q.why} />
              </div>
            )}
          </div>
        );
      })}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button type="button" className="btn primary" disabled={!answered} onClick={() => onFinished(score)}>
          {done ? "Save New Score" : "Complete Module"}
        </button>
        <span style={{ color: "var(--muted)" }}>{answered ? `${score} of ${mod.quiz.length} right` : "Answer all three to finish the module"}</span>
      </div>
    </section>
  );
}

export default function OnboardingPage() {
  return <Suspense fallback={<LoadingState status="Loading your orientation" />}><Orientation /></Suspense>;
}

function Orientation() {
  const router = useRouter();
  const params = useSearchParams();
  const [tab, setTab] = useState<"modules" | "plan" | "glossary">((params.get("tab") as any) || "modules");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [learner, setLearner] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const activeId = params.get("m") ?? MODULES.find((m) => !progress?.modules[m.id])?.id ?? MODULES[0].id;
  const active = MODULES.find((m) => m.id === activeId) ?? MODULES[0];
  const idx = MODULES.indexOf(active);

  useEffect(() => {
    fetch("/api/onboarding", { cache: "no-store" }).then(async (r) => {
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Couldn't load your progress.");
      setProgress(j.progress); setLearner(j.name ?? "");
    }).catch((e) => setError(e.message));
  }, []);

  const save = useCallback(async (body: object) => {
    const r = await fetch("/api/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setError(j.error || "Couldn't save."); return; }
    setError(null); setProgress(j.progress);
  }, []);

  const open = (id: string) => { router.replace(`/onboarding?m=${id}`, { scroll: false }); setTab("modules"); window.scrollTo({ top: 0, behavior: "smooth" }); };

  const doneCount = progress ? MODULES.filter((m) => progress.modules[m.id]).length : 0;
  const checkItems = CHECKLIST.flatMap((g) => g.items);
  const checksDone = progress ? checkItems.filter((i) => progress.checklist[i.id]).length : 0;
  const scored = progress ? Object.values(progress.modules) : [];
  const right = scored.reduce((s, m) => s + m.score, 0), asked = scored.reduce((s, m) => s + m.of, 0);
  const minutesLeft = MODULES.filter((m) => !progress?.modules[m.id]).reduce((s, m) => s + m.minutes, 0);

  const glossary = useMemo(() => {
    const n = q.trim().toLowerCase();
    return GLOSSARY.map((g) => ({ ...g, terms: g.terms.filter(([t, d]) => !n || t.toLowerCase().includes(n) || d.toLowerCase().includes(n)) })).filter((g) => g.terms.length);
  }, [q]);

  const firstName = learner ? learner.charAt(0) + learner.slice(1).toLowerCase() : "";

  return (
    <main style={{ display: "grid", gap: 20 }}>
      <PageHeader
        title="Orientation"
        info={<>Your guided path through the New Accountant Handbook: {MODULES.length} short modules, each with the portal pages to open and a three-question check, plus the 90-day plan you work through with Drew. The handbook is the full reference — download it any time.</>}
        actions={<a className="btn" href="/api/onboarding/handbook" style={{ textDecoration: "none" }}><Download size={16} strokeWidth={1.75} /> Download Handbook</a>}
        meta={<div style={{ color: "var(--muted)", fontSize: "var(--fs-14)", marginTop: 8 }}>
          {firstName ? `${firstName}'s progress` : "Progress"} · {MODULES.length} modules · about {totalMinutes()} minutes in all{progress?.startedAt ? ` · started ${fmtDate(progress.startedAt)}` : ""}
        </div>}
      />

      {error && <div style={{ color: "var(--c-b42318)", fontWeight: 600 }}>{error}</div>}
      {!progress && !error && <LoadingState status="Loading your orientation" />}

      {progress && <>
        <div className="pills">
          <StatPill label="Modules done" value={`${doneCount} of ${MODULES.length}`} sub={doneCount === MODULES.length ? "All done" : `Next: ${MODULES.find((m) => !progress.modules[m.id])?.title}`} />
          <StatPill label="Checks" value={asked ? `${Math.round((right / asked) * 100)}%` : "—"} sub={asked ? `${right} of ${asked} questions right` : "No checks taken yet"} />
          <StatPill label="Time left" value={`${minutesLeft} min`} sub="Reading and checks" />
          <StatPill label="90-day plan" value={`${checksDone} of ${checkItems.length}`} sub="Ticked off with Drew" onClick={() => setTab("plan")} />
        </div>

        <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border)" }}>
          <TabButton active={tab === "modules"} onClick={() => setTab("modules")}>Modules</TabButton>
          <TabButton active={tab === "plan"} onClick={() => setTab("plan")}>90-Day Plan</TabButton>
          <TabButton active={tab === "glossary"} onClick={() => setTab("glossary")}>Glossary</TabButton>
        </div>

        {tab === "modules" && (
          <div className="onboarding-grid">
            <nav className="card" aria-label="Modules" style={{ padding: "8px 18px 14px" }}>
              {PARTS.map((part, pi) => (
                <div key={part.id} style={{ marginTop: 12 }}>
                  <div style={SECTION}>Part {pi + 1} · {part.title}</div>
                  {MODULES.filter((m) => m.part === part.id).map((m) => {
                    const rec = progress.modules[m.id], on = m.id === active.id;
                    return (
                      <button key={m.id} type="button" className="task-row" onClick={() => open(m.id)}
                        style={{ display: "grid", gridTemplateColumns: "22px minmax(0, 1fr) auto", gap: 10, alignItems: "center", width: "100%", textAlign: "left",
                          padding: "11px 2px", border: 0, borderBottom: "1px solid var(--hairline)", background: "transparent", cursor: "pointer", color: "var(--text)" }}>
                        {rec ? <CircleCheck size={20} strokeWidth={1.75} style={{ color: "var(--c-067647)" }} /> : <Circle size={20} strokeWidth={1.75} style={{ color: on ? "var(--brand)" : "var(--c-98a2b3)" }} />}
                        <span style={{ fontWeight: on ? 800 : 600, color: on ? "var(--brand)" : undefined }}>{m.title}</span>
                        <span style={{ color: "var(--muted)", fontSize: "var(--fs-13)" }}>{rec ? `${rec.score}/${rec.of}` : `${m.minutes} min`}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </nav>

            <article className="card" style={{ padding: "26px 30px", display: "grid", gap: 20, minWidth: 0 }}>
              <header style={{ display: "grid", gap: 6 }}>
                <div style={SECTION}>Module {idx + 1} of {MODULES.length} · {PARTS.find((p) => p.id === active.part)?.title}</div>
                <h2 style={{ margin: 0, fontSize: 30, lineHeight: 1.15 }}>{active.title}</h2>
                <div style={{ color: "var(--muted)", display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
                  <span>{active.summary}</span>
                  <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><Clock size={16} strokeWidth={1.75} /> {active.minutes} min</span>
                  <span>Handbook {active.handbook}</span>
                </div>
              </header>

              {active.blocks.map((b, i) => <BlockView key={`${active.id}-${i}`} b={b} />)}

              {active.portal.length > 0 && (
                <div style={{ display: "grid", gap: 8, borderTop: "1px solid var(--hairline)", paddingTop: 16 }}>
                  <div style={SECTION}>Open It in the Portal</div>
                  <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
                    {active.portal.map((l) => (
                      <AllowedLink key={l.href} href={l.href} className="text-link" target="_blank">{l.label}<ChevronRight size={16} strokeWidth={1.75} /></AllowedLink>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ borderTop: "1px solid var(--hairline)", paddingTop: 18 }}>
                <Check mod={active} done={progress.modules[active.id]} onFinished={async (score) => {
                  await save({ module: active.id, score, of: active.quiz.length });
                  if (idx < MODULES.length - 1) open(MODULES[idx + 1].id);
                }} />
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, borderTop: "1px solid var(--hairline)", paddingTop: 16 }}>
                {idx > 0 ? <button type="button" className="btn" onClick={() => open(MODULES[idx - 1].id)}><ChevronLeft size={16} strokeWidth={1.75} /> {MODULES[idx - 1].title}</button> : <span />}
                {idx < MODULES.length - 1 && <button type="button" className="btn" onClick={() => open(MODULES[idx + 1].id)}>{MODULES[idx + 1].title} <ChevronRight size={16} strokeWidth={1.75} /></button>}
              </div>
            </article>
          </div>
        )}

        {tab === "plan" && (
          <section className="card" style={{ padding: "18px 22px", display: "grid", gap: 6 }}>
            <p style={{ margin: "0 0 6px", color: "var(--muted)", lineHeight: 1.5 }}>
              Over 90 days the recurring accounting moves in-house from EisnerAmper. Tick items off with Drew; each phase ends in a sit-down check before the next.
            </p>
            {CHECKLIST.map((g) => (
              <div key={g.phase} style={{ marginTop: 10 }}>
                <div style={SECTION}>{g.phase}</div>
                {g.items.map((it) => {
                  const rec = progress.checklist[it.id];
                  return (
                    <div key={it.id} className="task-row" style={{ display: "grid", gridTemplateColumns: "28px minmax(0, 1fr) auto", gap: 10, alignItems: "center", padding: "11px 2px", borderBottom: "1px solid var(--hairline)" }}>
                      <RoundCheck done={!!rec} onToggle={() => save({ item: it.id, done: !rec })} label={`${rec ? "Untick" : "Tick"} ${it.label}`} />
                      <span style={{ fontWeight: it.review ? 800 : 600 }}>{it.label}</span>
                      <span style={{ color: rec ? "var(--c-067647)" : "var(--muted)", fontSize: "var(--fs-13)" }}>{rec ? `Done ${fmtDate(rec.doneAt)} · ${rec.by.charAt(0) + rec.by.slice(1).toLowerCase()}` : it.review ? "Review with Drew" : "Open"}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </section>
        )}

        {tab === "glossary" && (
          <section className="card" style={{ padding: "18px 22px", display: "grid", gap: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, maxWidth: 420 }}>
              <Search size={16} strokeWidth={1.75} style={{ color: "var(--muted)" }} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a term — PRS, 4510, base year…" style={{ flex: 1 }} />
            </label>
            {glossary.length === 0 && <div style={{ color: "var(--muted)" }}>Nothing matches “{q}”.</div>}
            {glossary.map((g) => (
              <div key={g.group} style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr><th style={{ ...thL, width: "28%" }}>{g.group}</th><th style={{ ...th, textAlign: "left" }}>Meaning</th></tr></thead>
                  <tbody>{g.terms.map(([t, d]) => (
                    <tr key={t}><td style={{ ...tdL, whiteSpace: "normal", fontWeight: 700, verticalAlign: "top" }}>{t}</td><td style={{ ...td, whiteSpace: "normal", textAlign: "left", fontVariantNumeric: "normal", lineHeight: 1.45 }}>{d}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            ))}
          </section>
        )}
      </>}
    </main>
  );
}

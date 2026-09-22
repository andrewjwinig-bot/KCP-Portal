"use client";

// The guided run-through for a task's instructions.
//
// ONE STEP AT A TIME, NOT A SCROLL. These are procedures you work THROUGH while
// looking at another screen — Post PM & AP is seven Skyline screens run in
// order, several of them twice for different portfolios. A wall of seven steps
// is a reference document: fine for reading beforehand, useless for keeping
// your place at 4pm when the question is "did I run PFUNDS or only PALL?", and
// re-running a post is not free.
//
// So the wizard is the default for a multi-step task and shows exactly the step
// you are on, with the Skyline path and its bullets large enough to read from
// across the desk. "View all steps" is still there, because reading the whole
// procedure before starting is a different and legitimate job.
//
// PROGRESS IS THE PERSISTED THING; POSITION IS NOT. Ticks live in the tracker's
// existing per-month localStorage blob under `stepKey`, so a new month starts
// clean with nothing to expire. Where you are is then DERIVED — the first step
// not yet ticked — which is why closing the modal and coming back tomorrow
// lands you where you stopped without storing a cursor that could disagree with
// the ticks.
//
// FINISHING THE STEPS DOES NOT COMPLETE THE TASK. For the month-end chain the
// evidence is the GL import: you can only export a Detailed GL from Skyline
// after the period is posted and closed, so the imported GLs are what prove the
// work took. The last step says so rather than dangling a button that looks
// like the finish line.

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { InstructionStep, TaskInstructions } from "@/lib/tracker/taskDefs";

export type WizardTask = { id?: string; label: string; instructions?: TaskInstructions };

const BRAND = "var(--brand)";
const GREEN = "#16a34a";
const GREEN_TEXT = "#15803d";

export default function InstructionWizard({
  task,
  onClose,
  checked,
  stepKey,
  onSetSteps,
  /** What actually crosses the task off, when it is not the steps themselves. */
  completedBy,
}: {
  task: WizardTask;
  onClose: () => void;
  checked: Record<string, boolean>;
  stepKey: (taskId: string, stepIndex: number) => string;
  /** Commit a whole next map — the caller owns persistence. */
  onSetSteps: (next: Record<string, boolean>) => void;
  completedBy?: string;
}) {
  const instr = task.instructions;
  const steps = instr?.steps ?? [];
  const trackable = !!task.id && steps.length > 1;
  const keyAt = (i: number) => (task.id ? stepKey(task.id, i) : "");
  // A pass is a key under its step, so it clears with the month like everything
  // else and can never collide with another step's identically-named pass.
  const runKey = (i: number, run: string) => `${keyAt(i)}:run:${run}`;
  const runStateFor = (i: number): Record<string, boolean> | undefined => {
    const runs = steps[i]?.runs;
    if (!runs || !trackable) return undefined;
    return Object.fromEntries(runs.map((r) => [r, !!checked[runKey(i, r)]]));
  };
  /** Ticking the LAST pass finishes the step — the passes ARE the step, so
   *  making you tick the heading as well would be asking twice. Un-ticking one
   *  reopens it, for the same reason. */
  function toggleRun(i: number, run: string) {
    if (!trackable) return;
    const next = { ...checked };
    const k = runKey(i, run);
    if (next[k]) delete next[k]; else next[k] = true;
    const runs = steps[i].runs ?? [];
    if (runs.every((r) => next[runKey(i, r)])) next[keyAt(i)] = true;
    else delete next[keyAt(i)];
    onSetSteps(next);
  }
  const isDone = (i: number) => trackable && !!checked[keyAt(i)];
  const doneCount = steps.filter((_, i) => isDone(i)).length;
  const allDone = trackable && doneCount === steps.length;

  // Where to resume: the first step not yet ticked. Derived rather than stored,
  // so it can never disagree with the ticks.
  const firstOpen = useMemo(() => {
    const i = steps.findIndex((_, k) => !isDone(k));
    return i === -1 ? steps.length - 1 : i;
  }, [task.id, steps.length, checked]); // eslint-disable-line react-hooks/exhaustive-deps

  const [mode, setMode] = useState<"guide" | "all">(trackable ? "guide" : "all");
  const [at, setAt] = useState(Math.max(0, firstOpen));
  // Re-seat when the task changes, not on every tick — advancing a step must
  // not be undone by this.
  useEffect(() => { setAt(Math.max(0, firstOpen)); /* eslint-disable-next-line */ }, [task.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!instr) return null;

  function setStep(i: number, done: boolean) {
    if (!trackable) return;
    const next = { ...checked };
    // The heading and its passes must agree: marking the step done ticks every
    // pass, and clearing it clears them. A step reading done over three of
    // seven unticked portfolios is the exact confusion this was built to end.
    const runs = steps[i]?.runs ?? [];
    if (done) { next[keyAt(i)] = true; runs.forEach((r) => { next[runKey(i, r)] = true; }); }
    else { delete next[keyAt(i)]; runs.forEach((r) => { delete next[runKey(i, r)]; }); }
    onSetSteps(next);
  }
  function resetAll() {
    const next = { ...checked };
    steps.forEach((st, i) => {
      delete next[keyAt(i)];
      (st.runs ?? []).forEach((r) => { delete next[runKey(i, r)]; });
    });
    onSetSteps(next);
    setAt(0);
  }
  /** Passes still outstanding on the step being viewed. */
  const openRuns = (i: number): string[] => {
    const runs = steps[i]?.runs;
    if (!runs || !trackable) return [];
    return runs.filter((r) => !checked[runKey(i, r)]);
  };

  function doneAndNext() {
    // A step with passes is finished BY its passes. Pressing Next with three of
    // seven ticked must not silently claim the other four — the chips are the
    // record of what you actually ran, and inventing entries in it is worse
    // than an unticked step. So this only advances; the chips do the marking.
    if (openRuns(at).length === 0) setStep(at, true);
    if (at < steps.length - 1) setAt(at + 1);
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--card)", borderRadius: 14,
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
          width: "100%", maxWidth: 720, maxHeight: "85vh",
          display: "flex", flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "20px 24px 16px", borderBottom: "1px solid var(--border)",
          background: "var(--card)", borderRadius: "14px 14px 0 0",
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 900, fontSize: 17, letterSpacing: "-0.02em" }}>{task.label}</div>
              {instr.intro && (
                <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4, fontWeight: 500 }}>{instr.intro}</div>
              )}
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              style={{
                background: "none", border: "none", cursor: "pointer", color: "var(--muted)",
                fontSize: 22, lineHeight: 1, padding: "0 0 0 16px", flexShrink: 0, fontWeight: 300,
              }}
            >×</button>
          </div>

          {trackable && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
              <div style={{ flex: "0 0 150px", height: 6, borderRadius: 999, background: "rgba(15,23,42,0.10)", overflow: "hidden" }}>
                <div style={{
                  width: `${(doneCount / steps.length) * 100}%`, height: "100%", borderRadius: 999,
                  background: allDone ? GREEN : BRAND, transition: "width 160ms ease",
                }} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", color: allDone ? GREEN_TEXT : "var(--muted)" }}>
                {doneCount} of {steps.length} steps
              </span>
              <div style={{ marginLeft: "auto", display: "flex", gap: 14 }}>
                <button type="button" onClick={() => setMode(mode === "guide" ? "all" : "guide")} style={linkBtn}>
                  {mode === "guide" ? "View all steps" : "Guide me through"}
                </button>
                {doneCount > 0 && <button type="button" onClick={resetAll} style={linkBtn}>Reset</button>}
              </div>
            </div>
          )}
        </div>

        {/* Body */}
        <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>
          {mode === "all" || !trackable ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
              {steps.map((step, si) => (
                <div key={si}>
                  <StepHeader
                    index={si}
                    title={step.title}
                    done={isDone(si)}
                    onToggle={trackable ? () => setStep(si, !isDone(si)) : undefined}
                  />
                  <StepBody step={step} runState={runStateFor(si)} onToggleRun={trackable ? (r) => toggleRun(si, r) : undefined} />
                </div>
              ))}
            </div>
          ) : (
            <div>
              <div style={{
                fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
                textTransform: "uppercase", color: "var(--muted)", marginBottom: 10,
              }}>
                Step {at + 1} of {steps.length}
              </div>
              <StepHeader index={at} title={steps[at].title} done={isDone(at)} onToggle={trackable ? () => setStep(at, !isDone(at)) : undefined} />
              <StepBody step={steps[at]} runState={runStateFor(at)} onToggleRun={trackable ? (r) => toggleRun(at, r) : undefined} />

              {/* The dots are navigation AND a map: a filled dot is a step you
                  finished, so you can jump back to the one you are unsure of. */}
              <div style={{ display: "flex", gap: 6, marginTop: 24, flexWrap: "wrap" }}>
                {steps.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setAt(i)}
                    title={`${i + 1}. ${s.title}`}
                    style={{
                      width: 26, height: 26, borderRadius: 999, cursor: "pointer",
                      fontSize: 11, fontWeight: 800,
                      border: i === at ? `2px solid ${BRAND}` : "1px solid var(--border)",
                      background: isDone(i) ? GREEN : i === at ? "rgba(11,74,125,0.10)" : "transparent",
                      color: isDone(i) ? "#fff" : i === at ? BRAND : "var(--muted)",
                    }}
                  >{isDone(i) ? "✓" : i + 1}</button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "14px 24px", borderTop: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 12, background: "var(--card)", borderRadius: "0 0 14px 14px", flexWrap: "wrap",
        }}>
          {mode === "guide" && trackable ? (
            <>
              <button type="button" className="btn" onClick={() => setAt(Math.max(0, at - 1))}
                disabled={at === 0}
                style={{ padding: "8px 16px", fontWeight: 700, opacity: at === 0 ? 0.4 : 1 }}>
                ← Back
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginLeft: "auto" }}>
                {allDone && completedBy && (
                  // Say what still has to happen. A wizard that ends on a
                  // triumphant button implies the task is finished, and for the
                  // month-end chain it is the GL import that finishes it.
                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", maxWidth: 300, textAlign: "right" }}>
                    {completedBy}
                  </span>
                )}
                {(() => {
                  const open = openRuns(at);
                  if (open.length) {
                    // Name what is left rather than greying a button and making
                    // you work out why.
                    return (
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#b45309" }}>
                          {open.length} left: {open.join(", ")}
                        </span>
                        {at < steps.length - 1 && (
                          <button type="button" className="btn" onClick={() => setAt(at + 1)}
                            style={{ padding: "8px 16px", fontWeight: 700 }}>Skip ahead →</button>
                        )}
                      </div>
                    );
                  }
                  return at === steps.length - 1 ? (
                    <button type="button" className="btn" onClick={() => { setStep(at, true); onClose(); }}
                      style={{ padding: "8px 20px", fontWeight: 700, background: GREEN, color: "#fff", borderColor: GREEN }}>
                      ✓ Finish
                    </button>
                  ) : (
                    <button type="button" className="btn" onClick={doneAndNext}
                      style={{ padding: "8px 20px", fontWeight: 700 }}>
                      {isDone(at) ? "Next →" : "Done — next →"}
                    </button>
                  );
                })()}
              </div>
            </>
          ) : (
            <button className="btn" onClick={onClose} style={{ padding: "8px 20px", fontWeight: 700, marginLeft: "auto" }}>
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const linkBtn: React.CSSProperties = {
  background: "none", border: "none", cursor: "pointer", padding: 0,
  fontSize: 11, fontWeight: 700, color: "var(--muted)", textDecoration: "underline",
};

/** The numbered badge + title. The NUMBER IS THE TICK where one applies — a
 *  separate checkbox beside it puts two controls on one row and leaves the
 *  number saying nothing. */
function StepHeader({ index, title, done, onToggle }: {
  index: number; title: string; done: boolean; onToggle?: () => void;
}) {
  return (
    <div
      onClick={onToggle}
      title={onToggle ? (done ? "Mark this step not done" : "Mark this step done") : undefined}
      style={{
        display: "flex", alignItems: "center", gap: 10, marginBottom: 10,
        cursor: onToggle ? "pointer" : "default", userSelect: "none",
      }}
    >
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
        background: done ? GREEN : BRAND, color: "#fff",
        fontSize: done ? 13 : 12, fontWeight: 800, transition: "background 140ms ease",
      }}>{done ? "✓" : index + 1}</span>
      <span style={{
        fontWeight: 800, fontSize: 15,
        color: done ? "var(--muted)" : "var(--text)",
        textDecoration: done ? "line-through" : "none",
      }}>{title}</span>
    </div>
  );
}

<<<<<<< HEAD
/** The screen as it should look, with click-to-enlarge.
 *
 *  A 975px-wide Skyline form inside a 720px modal makes every dropdown value
 *  a squint, and the values ARE the instruction — so the inline render is the
 *  orientation ("this is the screen, this is roughly where things sit") and
 *  the full-size overlay is where you actually read it. The settings table
 *  above carries the same values in text for the times you do not want to
 *  open anything at all.
 */
function StepImage({ image }: { image: NonNullable<InstructionStep["image"]> }) {
  const [zoom, setZoom] = useState(false);
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setZoom(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom]);
  return (
    <div style={{ marginTop: 12, marginLeft: 8 }}>
      <button
        type="button"
        onClick={() => setZoom(true)}
        title="Click to enlarge"
        style={{
          display: "block", padding: 0, cursor: "zoom-in", width: "100%",
          border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden",
          background: "var(--card)", position: "relative",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image.src} alt={image.alt} style={{ display: "block", width: "100%", height: "auto" }} />
        <span style={{
          position: "absolute", right: 8, bottom: 8,
          fontSize: 10, fontWeight: 800, letterSpacing: "0.04em",
          padding: "3px 8px", borderRadius: 999,
          background: "rgba(15,23,42,0.75)", color: "#fff",
        }}>CLICK TO ENLARGE</span>
      </button>
      {image.caption && (
        <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 6, fontStyle: "italic" }}>{image.caption}</div>
      )}

      {zoom && typeof document !== "undefined" && createPortal(
        <div
          onClick={() => setZoom(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.80)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 24, cursor: "zoom-out",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.src} alt={image.alt}
            style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 8, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }} />
        </div>,
        document.body,
      )}
    </div>
  );
}

=======
>>>>>>> origin/main
/** A navigation path — the Skyline screen to open, or the folder to file the
 *  output in. Copies on click, because the save path is typed into Explorer
 *  and "Year End 20## → Skyline → Posting Reports" is not a thing anyone should
 *  retype. */
function PathChip({ text, kind }: { text: string; kind: "screen" | "save" }) {
  const [copied, setCopied] = useState(false);
  const isSave = kind === "save";
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(
          () => { setCopied(true); setTimeout(() => setCopied(false), 1400); },
          () => {},
        );
      }}
      title="Copy"
      style={{
        display: "inline-flex", alignItems: "center", textAlign: "left",
        fontSize: 12, fontWeight: 700, cursor: "pointer",
        color: isSave ? "#b45309" : BRAND,
        background: isSave ? "rgba(180,83,9,0.06)" : "rgba(11,74,125,0.07)",
        border: `1px solid ${isSave ? "rgba(180,83,9,0.25)" : "rgba(11,74,125,0.18)"}`,
        borderRadius: 6, padding: "5px 10px", gap: 6, fontFamily: "monospace",
        maxWidth: "100%",
      }}
    >
      {isSave ? (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        </svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      )}
      {isSave && <span style={{ fontFamily: "inherit", opacity: 0.75, fontWeight: 800 }}>Save to</span>}
      <span style={{ overflowWrap: "anywhere" }}>{text}</span>
      <span style={{ fontSize: 10, opacity: copied ? 1 : 0.45, flexShrink: 0, fontFamily: "system-ui" }}>
        {copied ? "copied" : "copy"}
      </span>
    </button>
  );
}

/** Path chip, run ticks, bullets, save-to, troubleshooting, links and the note.
 *  Extracted so the guide and the full list cannot drift. */
function StepBody({ step, runState, onToggleRun }: {
  step: InstructionStep;
  /** Which of this step's passes are done. Absent when the step is untracked. */
  runState?: Record<string, boolean>;
  onToggleRun?: (run: string) => void;
}) {
  const [showFix, setShowFix] = useState(false);
  return (
    <>
      {step.path && <PathChip text={step.path} kind="screen" />}

      {/* THE PASSES. Each portfolio is a trip out to Skyline and back, so each
          one gets its own tick — this is the line you actually lose your place
          in, and a chip you have already pressed is the only reliable answer to
          "did I run PFUNDS?". */}
      {step.runs && step.runs.length > 0 && (
        <div style={{ margin: "12px 0 12px", paddingLeft: 8 }}>
          <div style={{
            fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em",
            textTransform: "uppercase", color: "var(--muted)", marginBottom: 7,
          }}>
            Run once for each — {step.runs.filter((r) => runState?.[r]).length} of {step.runs.length} done
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {step.runs.map((r) => {
              const on = !!runState?.[r];
              return (
                <button
                  key={r}
                  type="button"
                  disabled={!onToggleRun}
                  onClick={() => onToggleRun?.(r)}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    fontSize: 12, fontWeight: 800, fontFamily: "monospace",
                    padding: "5px 11px", borderRadius: 999,
                    cursor: onToggleRun ? "pointer" : "default",
                    border: `1px solid ${on ? GREEN : "rgba(11,74,125,0.28)"}`,
                    background: on ? "rgba(22,163,74,0.10)" : "rgba(11,74,125,0.05)",
                    color: on ? GREEN_TEXT : BRAND,
                    transition: "background 140ms ease, border-color 140ms ease",
                  }}
                >
                  <span style={{ fontSize: 11 }}>{on ? "✓" : "○"}</span>{r}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* THE ACTIONS. Full-strength text with a square marker — the things you
          came to this screen to do. */}
      {step.items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 7, paddingLeft: 8 }}>
          {step.items.map((item, ii) => (
            <div key={ii} style={{ display: "flex", gap: 10, fontSize: 13.5 }}>
              <span style={{ color: BRAND, fontSize: 9, flexShrink: 0, marginTop: 5 }}>■</span>
              <span style={{ color: "var(--text)", lineHeight: 1.5, fontWeight: 500 }}>{item}</span>
            </div>
          ))}
        </div>
      )}

      {/* THE BACKGROUND. Deliberately NOT a bullet and deliberately quieter:
          why the step exists, what it produces, where to read more. It sat in
          the same list as the actions, so "Catches out-of-balance entries…"
          looked exactly like something to go and do, and the one real
          instruction had to be found among the explanation. Prose in a rail
          reads as prose. */}
      {step.context && step.context.length > 0 && (
        <div style={{
          marginTop: step.items.length ? 11 : 0, marginLeft: 8,
          paddingLeft: 11, borderLeft: "2px solid rgba(15,23,42,0.13)",
          display: "flex", flexDirection: "column", gap: 4,
        }}>
          {step.context.map((c, ci) => (
            <div key={ci} style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--muted)" }}>{c}</div>
          ))}
        </div>
      )}

<<<<<<< HEAD
      {/* THE FIELD VALUES, as a table — which is what they are. Transcribed as
          well as pictured: an image cannot be searched, read out over the
          phone or copied, and a screenshot that fails to load must not take
          the instruction with it. */}
      {step.settings && step.settings.length > 0 && (
        <div style={{
          marginTop: 12, marginLeft: 8, borderRadius: 8, overflow: "hidden",
          border: "1px solid rgba(11,74,125,0.20)",
        }}>
          {step.settings.map((row, i) => (
            <div key={row.field} style={{
              display: "flex", gap: 12, alignItems: "baseline",
              padding: "6px 11px", fontSize: 12.5,
              background: i % 2 ? "transparent" : "rgba(11,74,125,0.04)",
              borderTop: i ? "1px solid rgba(11,74,125,0.10)" : undefined,
            }}>
              <span style={{ flex: 1, minWidth: 0, color: "var(--muted)", fontWeight: 600 }}>{row.field}</span>
              <span style={{ fontWeight: 800, fontFamily: "monospace", color: BRAND, textAlign: "right" }}>{row.value}</span>
            </div>
          ))}
        </div>
      )}

      {step.image && <StepImage image={step.image} />}

=======
>>>>>>> origin/main
      {step.saveTo && (
        // Its own chip, not a bullet: you navigate here in Explorer rather than
        // read it, which is also why it copies.
        <div style={{ marginTop: 11 }}>
          <PathChip text={step.saveTo} kind="save" />
        </div>
      )}

      {step.troubleshooting && step.troubleshooting.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            onClick={() => setShowFix((v) => !v)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: "none", border: "none", padding: 0, cursor: "pointer",
              fontSize: 12, fontWeight: 700, color: "#b45309",
            }}
          >
            <span style={{ fontSize: 10, transform: showFix ? "rotate(90deg)" : "none", transition: "transform 140ms ease", display: "inline-block" }}>▶</span>
            If it reports errors
          </button>
          {showFix && (
            <div style={{
              marginTop: 8, padding: "10px 12px", borderRadius: 8,
              background: "rgba(180,83,9,0.05)", border: "1px solid rgba(180,83,9,0.22)",
              display: "flex", flexDirection: "column", gap: 6,
            }}>
              {step.troubleshooting.map((t, i) => (
                <div key={i} style={{ display: "flex", gap: 9, fontSize: 12.5, lineHeight: 1.5 }}>
                  <span style={{ color: "#b45309", fontWeight: 900, flexShrink: 0 }}>·</span>
                  <span>{t}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {step.links && step.links.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10, paddingLeft: 8 }}>
          {step.links.map((lk) => (
            <a
              key={lk.url + lk.label}
              href={lk.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700,
                color: BRAND, background: "rgba(11,74,125,0.07)",
                border: "1px solid rgba(11,74,125,0.25)", borderRadius: 6, padding: "5px 10px",
                textDecoration: "none",
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <line x1="3" y1="21" x2="21" y2="21" /><line x1="5" y1="21" x2="5" y2="10" /><line x1="19" y1="21" x2="19" y2="10" /><line x1="9" y1="21" x2="9" y2="14" /><line x1="15" y1="21" x2="15" y2="14" /><polygon points="12 2 21 9 3 9" />
              </svg>
              {lk.label} →
            </a>
          ))}
        </div>
      )}

      {step.note && (step.warn ? (
        // A warning is not a footnote. This is the one place in the month-end
        // run where a wrong click costs real work to undo, so it gets weight:
        // its own tinted band, upright type, and the ⚠ that says stop reading
        // for a second.
        <div style={{
          marginTop: 12, padding: "9px 12px", borderRadius: 8,
          background: "rgba(220,38,38,0.07)", border: "1px solid rgba(220,38,38,0.30)",
          fontSize: 12.5, fontWeight: 700, color: "#b91c1c",
          display: "flex", gap: 8, alignItems: "flex-start", lineHeight: 1.45,
        }}>
          <span style={{ flexShrink: 0 }}>⚠</span>
          {step.note}
        </div>
      ) : (
        <div style={{
          marginTop: 10, paddingLeft: 8, fontSize: 12, fontStyle: "italic",
          color: "var(--muted)", display: "flex", gap: 6,
        }}>
          <span style={{ fontWeight: 700, fontStyle: "normal" }}>*</span>
          {step.note}
        </div>
      ))}
    </>
  );
}

"use client";

// ── Reusable AI visual language ───────────────────────────────────────────
// The shared primitives for "there is AI here" — the violet accent ramp, the
// gradient sparkle mark, the Siri-like glow frame, and the AI-output cards
// (answer / hero / draft letter / chart / memory). Built once here so every
// AI surface in the program reads the same. All colors come from the --ai*
// / --amber* / --search-* tokens in globals.css (light + dark), and all motion
// respects prefers-reduced-motion via the .kcp-* animation classes.
//
// Primary consumer today is the ⌘K command palette (GlobalSearch), but these
// are deliberately app-agnostic: drop <AnswerCard/> anywhere the assistant
// returns an answer.

import { useState } from "react";

// Data / codes / figures use the portal's established monospace (system mono);
// the design mocks used JetBrains Mono, which we intentionally do not load as a
// network font. Swap this one constant if a bundled mono is added later.
export const MONO =
  'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

// Structured AI output the assistant endpoint returns (see /api/search/agent).
export type AiChartSpec = {
  type: "bar" | "line";
  title: string;
  unit: "dollars" | "percent" | "sqft" | "count";
  series: { label: string; value: number }[];
};
export type AiLetterSpec = { kind: string; to: string; subject: string; body: string };

// ── Sparkle mark ───────────────────────────────────────────────────────────
// The AI signature glyph ✦ (U+2726) in a rounded gradient square. Use as a
// solid mark on any AI affordance (buttons, empty states, headers).
export function SparkleMark({
  size = 32,
  twinkle = false,
  fast = false,
  style,
}: {
  size?: number;
  twinkle?: boolean;
  fast?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <span
      aria-hidden
      className={twinkle ? "kcp-twinkle" : undefined}
      style={{
        flex: "0 0 auto",
        width: size,
        height: size,
        borderRadius: size >= 30 ? 9 : 8,
        background: "var(--ai-sparkle)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontSize: Math.round(size * 0.5),
        boxShadow: "0 4px 12px rgba(108,76,224,.4)",
        animation: twinkle ? `kcpTwinkle ${fast ? "1.4s" : "3s"} ease-in-out infinite` : undefined,
      }}
    >
      ✦
    </span>
  );
}

// Inline sparkle accent (solid violet), for labels like "✦ ASSISTANT".
export function InlineSparkle({ twinkle = false, style }: { twinkle?: boolean; style?: React.CSSProperties }) {
  return (
    <span
      aria-hidden
      className={twinkle ? "kcp-twinkle" : undefined}
      style={{ color: "var(--ai)", fontSize: 14, animation: twinkle ? "kcpTwinkle 1.4s ease-in-out infinite" : undefined, ...style }}
    >
      ✦
    </span>
  );
}

// Sparkle rendered as gradient-clipped text (for the "✦ Or ask…" band mark).
export function GradientSparkle({ style }: { style?: React.CSSProperties }) {
  return (
    <span
      aria-hidden
      style={{
        background: "var(--ai-sparkle)",
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        color: "transparent",
        fontSize: 14,
        ...style,
      }}
    >
      ✦
    </span>
  );
}

// ── Glow frame ───────────────────────────────────────────────────────────
// Wraps content in three nested layers: a blurred breathing aura, a slowly
// spinning conic rim (a thin luminous gradient border), and the modal surface.
// Motion stays subtle by design; the thinking state must NOT make this more
// active. The caller's container must be overflow:hidden so the aura is clipped
// to the modal backdrop and never bleeds across the app.
export function GlowFrame({ width, children }: { width: number; children: React.ReactNode }) {
  return (
    <div style={{ position: "relative" }}>
      {/* Aura — breathes, no rotation */}
      <div
        className="kcp-aura"
        aria-hidden
        style={{
          position: "absolute",
          inset: "var(--ai-aura-inset)",
          borderRadius: "var(--ai-aura-radius)",
          background: "var(--ai-aura)",
          filter: "blur(var(--ai-aura-blur))",
          opacity: "var(--ai-aura-opacity)",
          animation: "kcpBreathe 7s ease-in-out infinite",
          pointerEvents: "none",
        }}
      />
      {/* Rim — 2px conic border, slow spin */}
      <div
        style={{
          position: "relative",
          borderRadius: 16,
          padding: 2,
          overflow: "hidden",
          boxShadow: "var(--ai-glow-shadow)",
        }}
      >
        <div
          className="kcp-rim"
          aria-hidden
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: "150%",
            aspectRatio: "1",
            transform: "translate(-50%, -50%)",
            background: "var(--ai-rim)",
            animation: "kcpSpin 16s linear infinite",
            pointerEvents: "none",
          }}
        />
        {/* Modal surface */}
        <div
          style={{
            position: "relative",
            width,
            maxWidth: "calc(100vw - 32px)",
            background: "var(--ai-modal)",
            borderRadius: 14,
            overflow: "hidden",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

// Minimal markdown for the assistant's answer: **bold** (rendered in AI violet)
// + preserved newlines. Good enough for the one-sentence answers we render.
export function renderAiMarkdown(text: string): React.ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((seg, i) =>
    seg.startsWith("**") && seg.endsWith("**") ? (
      <b key={i} style={{ color: "var(--ai-text)" }}>
        {seg.slice(2, -2)}
      </b>
    ) : (
      <span key={i}>{seg}</span>
    ),
  );
}

// ── AI chart ───────────────────────────────────────────────────────────────
// Bar for rankings/comparisons (leader = full violet gradient, rest translucent
// violet, right-aligned mono values); line for trends (violet stroke, faint
// violet area fill, dots, mono axis labels). Numbers already come computed from
// the endpoint's tools.
function fmtChartValue(v: number, unit: AiChartSpec["unit"]): string {
  if (unit === "percent") return `${Math.round(v * 10) / 10}%`;
  if (unit === "dollars") {
    const a = Math.abs(v);
    // Keep 2 decimals in the low-$M range so a close ranking stays distinct
    // (2.41 vs 2.05), 1 decimal for larger figures.
    return a >= 1_000_000 ? `$${(v / 1_000_000).toFixed(a < 10_000_000 ? 2 : 1)}M` : a >= 1_000 ? `$${Math.round(v / 1000)}K` : `$${Math.round(v)}`;
  }
  return v >= 1000 ? v.toLocaleString() : String(Math.round(v));
}

export function AiChart({ spec, compact = false }: { spec: AiChartSpec; compact?: boolean }) {
  const vals = spec.series.map((p) => p.value);
  const maxV = Math.max(...vals, 0);
  const minV = Math.min(...vals, 0);
  const span = maxV - minV || 1;
  const labelW = compact ? 96 : 118;
  const barH = compact ? 16 : 20;
  const valW = compact ? 40 : 48;

  if (spec.type === "bar") {
    const leaderIdx = vals.indexOf(Math.max(...vals));
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: compact ? 6 : 7 }}>
        {spec.series.map((p, i) => {
          const frac = (p.value - Math.min(minV, 0)) / span;
          const isLeader = i === leaderIdx;
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: compact ? 9 : 10 }}>
              <div
                title={p.label}
                style={{ width: labelW, flexShrink: 0, fontSize: compact ? 11.5 : 12, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
              >
                {p.label}
              </div>
              <div style={{ flex: 1, height: barH, borderRadius: compact ? 4 : 5, background: "var(--ai-chart-track)", position: "relative", overflow: "hidden" }}>
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: `${Math.max(2, frac * 100)}%`,
                    background: isLeader ? "var(--ai-chart-leader)" : "var(--ai-chart-rest)",
                    borderRadius: compact ? 4 : 5,
                  }}
                />
              </div>
              <div style={{ width: valW, flexShrink: 0, textAlign: "right", fontFamily: MONO, fontSize: compact ? 11.5 : 12, color: "var(--text)" }}>
                {fmtChartValue(p.value, spec.unit)}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Line trend — area fill + stroke + dots, mono axis labels.
  const W = 320, H = 92, padX = 8, padTop = 12, padBot = 26;
  const n = spec.series.length;
  const x = (i: number) => padX + (i * (W - 2 * padX)) / Math.max(1, n - 1);
  const y = (v: number) => padTop + (1 - (v - minV) / span) * (H - padTop - padBot);
  const linePts = spec.series.map((p, i) => `${x(i)},${y(p.value)}`).join(" ");
  const areaPts = `${linePts} ${x(n - 1)},${H - padBot} ${x(0)},${H - padBot}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H, display: "block" }}>
      <polygon points={areaPts} fill="var(--ai-line-fill)" />
      <polyline points={linePts} fill="none" stroke="var(--ai)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      {spec.series.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.value)} r={3.5} fill="var(--ai)" />
      ))}
      {spec.series.map((p, i) => (
        <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontFamily={MONO} fontSize={9} fill="var(--muted)">
          {p.label}
        </text>
      ))}
    </svg>
  );
}

// ── Action row (Teach it / Export PDF / Copy) ────────────────────────────────
export function AnswerActions({
  onTeach,
  onExport,
  copyText,
  compact = false,
}: {
  onTeach: () => void;
  onExport: () => void;
  copyText: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const outline: React.CSSProperties = {
    all: "unset",
    cursor: "pointer",
    fontSize: 12.5,
    color: "var(--muted)",
    border: "1px solid var(--kbd-border)",
    borderRadius: 7,
    padding: "5px 11px",
  };
  return (
    <>
      <button type="button" onClick={onTeach} title="Teach the assistant a standing preference from this answer"
        style={{ all: "unset", cursor: "pointer", fontSize: 12.5, color: "var(--ai-text)", background: "var(--ai-soft)", border: "1px solid var(--ai-border)", borderRadius: 7, padding: "5px 11px", display: "inline-flex", alignItems: "center", gap: 6 }}>
        <InlineSparkle style={{ fontSize: 12.5 }} /> Teach it
      </button>
      <button type="button" onClick={onExport} style={outline}>{compact ? "Export" : "Export PDF"}</button>
      <button type="button"
        onClick={() => { navigator.clipboard?.writeText(copyText).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {}); }}
        style={outline}>{copied ? "Copied" : "Copy"}</button>
    </>
  );
}

// ── Answer card ─────────────────────────────────────────────────────────────
// The atomic AI output: ASSISTANT header (+ optional context tag), a
// one-sentence answer with the key figure bolded violet, an optional chart,
// page links, and the action row. Left violet accent bar distinguishes AI
// output from everything else.
export function AnswerCard({
  answer,
  contextTag,
  chart,
  links,
  onTeach,
  onExport,
  copyText,
  onLinkClick,
}: {
  answer: string;
  contextTag?: string | null;
  chart?: AiChartSpec | null;
  links: { label: string; href: string }[];
  onTeach: () => void;
  onExport: () => void;
  copyText: string;
  onLinkClick?: () => void;
}) {
  return (
    <div style={{ border: "1px solid var(--ai-border-card)", borderLeft: "3px solid var(--ai)", borderRadius: 11, background: "linear-gradient(180deg, var(--ai-tint-panel), var(--ai-modal))", padding: "15px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
        <InlineSparkle />
        <span style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ai-text)", fontWeight: 600 }}>Assistant</span>
        {contextTag && <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 11, color: "var(--muted)" }}>{contextTag}</span>}
      </div>
      <div style={{ fontSize: 16, lineHeight: 1.5, color: "var(--text)", fontWeight: 500, marginBottom: chart || links.length ? 14 : 0 }}>
        {renderAiMarkdown(answer)}
      </div>
      {chart && chart.series.length >= 2 && <div style={{ marginBottom: 14 }}><AiChart spec={chart} /></div>}
      {links.length > 0 && <PageLinks links={links} onLinkClick={onLinkClick} />}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", borderTop: "1px solid var(--ai-border-soft)", paddingTop: 11, marginTop: links.length || chart ? 0 : 13 }}>
        <AnswerActions onTeach={onTeach} onExport={onExport} copyText={copyText} />
      </div>
    </div>
  );
}

// ── Hero answer card (direction 1b) ──────────────────────────────────────────
// A display variant for single-metric answers: the headline number is pulled
// out large (mono, 32px) on the left, beside the sentence + chart. Same data,
// same tokens — a display choice, not a different component family.
export function HeroAnswerCard({
  metric,
  metricLabel,
  metricSub,
  answer,
  chart,
  links,
  onTeach,
  onExport,
  copyText,
  onLinkClick,
}: {
  metric: string;
  metricLabel: string;
  metricSub?: string;
  answer: string;
  chart?: AiChartSpec | null;
  links: { label: string; href: string }[];
  onTeach: () => void;
  onExport: () => void;
  copyText: string;
  onLinkClick?: () => void;
}) {
  return (
    <div style={{ border: "1px solid var(--ai-border-card)", borderRadius: 12, background: "linear-gradient(180deg, var(--ai-tint-panel), var(--ai-modal))", overflow: "hidden" }}>
      <div style={{ display: "flex", gap: 16, padding: "16px 17px" }}>
        <div style={{ flex: "0 0 auto", borderRight: "1px solid var(--ai-border-soft)", paddingRight: 16 }}>
          <div style={{ fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ai-text)", fontWeight: 600, display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
            <InlineSparkle style={{ fontSize: 12 }} /> {metricLabel}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 32, fontWeight: 500, color: "var(--ai-hero-metric)", lineHeight: 1 }}>{metric}</div>
          {metricSub && <div style={{ fontSize: 12, color: "var(--ai-hero-sub)", marginTop: 6, whiteSpace: "pre-line" }}>{metricSub}</div>}
        </div>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 15, lineHeight: 1.5, color: "var(--text)", fontWeight: 500 }}>{renderAiMarkdown(answer)}</div>
          {chart && chart.series.length >= 2 && <AiChart spec={chart} compact />}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "11px 17px", borderTop: "1px solid var(--ai-border-soft)", background: "var(--ai-tint-panel-2)" }}>
        {links.map((l, i) => (
          <a key={i} href={l.href} onClick={onLinkClick} style={{ fontSize: 12.5, color: "var(--search-blue)", background: "var(--search-blue-tint)", borderRadius: 7, padding: "5px 10px", textDecoration: "none" }}>
            {l.label} ↗
          </a>
        ))}
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <AnswerActions onTeach={onTeach} onExport={onExport} copyText={copyText} compact />
        </span>
      </div>
    </div>
  );
}

// Blue pill page links (grounded deep-links into the portal).
export function PageLinks({ links, onLinkClick }: { links: { label: string; href: string }[]; onLinkClick?: () => void }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 13 }}>
      {links.map((l, i) => (
        <a key={i} href={l.href} onClick={onLinkClick}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--search-blue)", background: "var(--search-blue-tint)", borderRadius: 7, padding: "5px 10px", textDecoration: "none" }}>
          {l.label} <span style={{ opacity: 0.5 }}>↗</span>
        </a>
      ))}
    </div>
  );
}

// ── Draft letter card (amber) ────────────────────────────────────────────────
// A generated document is a review-and-send DRAFT — amber signals a human
// approval gate. Never auto-sends: Email opens the composer prefilled, the
// human sends. Preview is clipped with a bottom fade.
export function DraftLetterCard({ letter }: { letter: AiLetterSpec }) {
  const [copied, setCopied] = useState(false);
  const fullText = [letter.to ? `To: ${letter.to}` : "", letter.subject ? `Re: ${letter.subject}` : "", "", letter.body]
    .filter((l, i) => i > 1 || l)
    .join("\n");
  const copy = () => {
    navigator.clipboard?.writeText(fullText).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  };
  const download = () => {
    const blob = new Blob([fullText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${letter.kind.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "letter"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const mailto = `mailto:${encodeURIComponent(letter.to || "")}?subject=${encodeURIComponent(letter.subject || letter.kind)}&body=${encodeURIComponent(letter.body)}`;
  const outline: React.CSSProperties = { all: "unset", cursor: "pointer", fontSize: 12.5, color: "var(--muted)", border: "1px solid var(--kbd-border)", borderRadius: 7, padding: "6px 12px" };
  return (
    <div style={{ border: "1px solid var(--amber-border)", borderRadius: 11, background: "var(--amber-letter-bg)", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "11px 15px", background: "var(--amber-soft)", borderBottom: "1px solid var(--amber-border)" }}>
        <span style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--amber-text)", fontWeight: 700, display: "inline-flex", gap: 6, alignItems: "center" }}>
          ⚠ Draft · review before sending
        </span>
        <span style={{ fontSize: 12.5, color: "var(--muted)", marginLeft: "auto" }}>{letter.kind}{letter.to ? ` · ${letter.to}` : ""}</span>
      </div>
      <div style={{ padding: "14px 15px" }}>
        <div style={{ position: "relative", fontSize: 12.5, lineHeight: 1.65, color: "var(--text)", background: "var(--amber-preview-bg)", border: "1px solid var(--amber-preview-border)", borderRadius: 8, padding: "12px 13px", maxHeight: 96, overflow: "hidden", whiteSpace: "pre-wrap" }}>
          {(letter.to || letter.subject) && (
            <div style={{ color: "var(--muted)", marginBottom: 6 }}>
              {letter.to && <div><b>To:</b> {letter.to}</div>}
              {letter.subject && <div><b>Re:</b> {letter.subject}</div>}
            </div>
          )}
          {letter.body}
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 30, background: "linear-gradient(180deg, rgba(0,0,0,0), var(--amber-preview-bg))" }} />
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <a href={mailto} style={{ all: "unset", cursor: "pointer", fontSize: 12.5, color: "var(--amber-on-solid)", background: "var(--amber-primary)", borderRadius: 7, padding: "6px 13px", fontWeight: 600 }}>Email tenant</a>
          <button type="button" onClick={download} style={outline}>Download</button>
          <button type="button" onClick={copy} style={outline}>{copied ? "Copied" : "Copy"}</button>
        </div>
        <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 8, fontStyle: "italic" }}>
          Draft — review and send yourself. Bracketed [placeholders] need your input; nothing is sent automatically.
        </div>
      </div>
    </div>
  );
}

// ── Memory strip ("✦ Remembers") ─────────────────────────────────────────────
// Standing preferences that shape answers, surfaced in the assistant footer.
// Each chip carries a subtle forget (×) so memory stays manageable.
export function MemoryStrip({ prefs, onForget }: { prefs: string[]; onForget?: (p: string) => void }) {
  if (!prefs.length) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", padding: "11px 18px", borderTop: "1px solid var(--kbd-border)", background: "var(--footer-bg, var(--card))" }}>
      <span style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--ai-text)", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 5 }}>
        <InlineSparkle style={{ fontSize: 12 }} /> Remembers
      </span>
      {prefs.map((p) => (
        <span key={p} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted)", background: "var(--card)", border: "1px solid var(--kbd-border)", borderRadius: 20, padding: "3px 6px 3px 10px" }}>
          {p}
          {onForget && (
            <button type="button" onClick={() => onForget(p)} aria-label="Forget" title="Forget this"
              style={{ all: "unset", cursor: "pointer", color: "var(--muted)", fontSize: 13, lineHeight: 1, opacity: 0.55 }}>×</button>
          )}
        </span>
      ))}
    </div>
  );
}

// ── Thinking card ────────────────────────────────────────────────────────────
// Feedback while the assistant queries live data. The glow frame stays at the
// SAME subtlety as the resting assistant state (the caller keeps it); activity
// is all foreground: a faster-twinkling sparkle, three pulsing dots, a shimmer
// status line, and scanning skeleton bars where the chart will render.
export function ThinkingCard({ status, rows }: { status: string; rows?: (string | null)[] }) {
  const bars: (string | null)[] = rows && rows.length ? rows : [null, null, null, null];
  return (
    <div style={{ border: "1px solid var(--ai-border-card)", borderLeft: "3px solid var(--ai)", borderRadius: 11, background: "linear-gradient(180deg, var(--ai-tint-panel), var(--ai-modal))", padding: "15px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <InlineSparkle twinkle />
        <span style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ai-text)", fontWeight: 600 }}>Assistant</span>
        <span style={{ marginLeft: "auto", display: "inline-flex", gap: 4, alignItems: "center" }}>
          {[0, 0.18, 0.36].map((d) => (
            <span key={d} className="kcp-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--ai)", animation: "kcpDot 1.2s ease-in-out infinite", animationDelay: `${d}s` }} />
          ))}
        </span>
      </div>
      <div
        className="kcp-shimmer"
        style={{
          fontSize: 15,
          fontWeight: 500,
          marginBottom: 16,
          background: "var(--ai-shimmer)",
          backgroundSize: "200% 100%",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
          animation: "kcpShimmer 1.9s linear infinite",
          display: "inline-block",
        }}
      >
        {status}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {bars.map((label, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {label != null && <div style={{ width: 118, fontSize: 12, color: "var(--muted)" }}>{label}</div>}
            <div style={{ flex: 1, height: 20, borderRadius: 5, background: "var(--ai-chart-track-think)", position: "relative", overflow: "hidden" }}>
              <div className="kcp-scan" style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: "38%", background: "linear-gradient(90deg, transparent, var(--ai-chart-scan), transparent)", animation: "kcpScan 1.3s linear infinite", animationDelay: `${i * 0.15}s` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Export an assistant answer to a clean, board-ready PDF ────────────────────
export async function exportAnswerPdf(opts: {
  question: string;
  answer: string;
  chart: AiChartSpec | null;
  links: { label: string; href: string }[];
}) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const margin = 48;
  let y = margin;
  const line = (h: number) => { y += h; if (y > H - margin) { doc.addPage(); y = margin; } };

  doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.setTextColor(11, 74, 125);
  doc.text("Korman Commercial Properties", margin, y);
  doc.setFontSize(10); doc.setTextColor(120);
  doc.text(new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }), W - margin, y, { align: "right" });
  line(22);
  doc.setTextColor(90); doc.setFont("helvetica", "normal"); doc.setFontSize(11);
  doc.text("Assistant answer", margin, y); line(20);

  if (opts.question) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(20);
    for (const l of doc.splitTextToSize(`Q: ${opts.question}`, W - margin * 2)) { doc.text(l, margin, y); line(15); }
    line(6);
  }
  doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(30);
  for (const l of doc.splitTextToSize(opts.answer.replace(/\*\*/g, ""), W - margin * 2)) { doc.text(l, margin, y); line(15); }

  if (opts.chart && opts.chart.series.length) {
    line(12);
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(91, 52, 199);
    doc.text(opts.chart.title || "Data", margin, y); line(16);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(40);
    const fmt = (v: number) => opts.chart!.unit === "percent" ? `${v}%` : opts.chart!.unit === "dollars" ? `$${Math.round(v).toLocaleString()}` : v.toLocaleString();
    for (const p of opts.chart.series) {
      doc.text(String(p.label), margin, y);
      doc.text(fmt(p.value), W - margin, y, { align: "right" });
      line(14);
    }
  }
  if (opts.links.length) {
    line(10); doc.setFontSize(9); doc.setTextColor(120);
    for (const lk of opts.links) { doc.text(`• ${lk.label}  ${lk.href}`, margin, y); line(12); }
  }
  line(14); doc.setFontSize(8); doc.setTextColor(150);
  doc.text("Generated by the KCP portal assistant — grounded in live portal data. Verify anything critical.", margin, y);
  doc.save(`kcp-assistant-answer-${Date.now()}.pdf`);
}

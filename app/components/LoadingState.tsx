// ── Non-AI loading state ("building skyline" loader) ──────────────────────
// The branded loader for ordinary, non-AI data fetches (operating statements,
// rent roll, budgets, …). A small commercial skyline whose windows light up
// floor-by-floor in a rising wave, above a shimmering skeleton of the table
// that's about to appear, with an indeterminate progress bar at the top edge.
//
// Deliberately the app's blue/grey — NO violet / sparkle / glow. That language
// is reserved for the AI assistant so the two waits never get confused. All
// colors come from the --load-* tokens (light + dark) in globals.css; motion is
// disabled under prefers-reduced-motion.
//
// Parameterize the skeleton (row count + number-column count / template) to
// match the real table you're fronting, so the layout doesn't jump on load.

// Per-window animation delays that drive the rising, slightly diagonal wave.
// Each inner array is one building, floors listed bottom → top (matches the
// column-reverse render order). Both windows on a floor share the delay.
const BUILDINGS: number[][] = [
  [0, 0.3, 0.6], // A — short
  [0.18, 0.48, 0.78, 1.08], // B — tall (center)
  [0.36, 0.66, 0.96], // C — short
];

function Building({ delays }: { delays: number[] }) {
  return (
    <div
      style={{
        display: "inline-flex",
        flexDirection: "column-reverse",
        gap: 5,
        padding: "6px 6px 0",
        border: "1.5px solid var(--load-building-border)",
        borderBottom: "none",
        borderRadius: "4px 4px 0 0",
        background: "var(--load-building-fill)",
      }}
    >
      {delays.map((d, i) => (
        <div key={i} style={{ display: "flex", gap: 4 }}>
          {[0, 1].map((w) => (
            <span
              key={w}
              className="kcp-lit"
              style={{
                width: 7,
                height: 7,
                borderRadius: 1.5,
                background: "var(--load-accent)",
                animation: "kcpLit 2.8s ease-in-out infinite",
                animationDelay: `${d}s`,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// One shimmering skeleton block. `sub` uses the heavier subtotal palette.
function SkBlock({ width, height = 13, sub = false, delay = 0, alignEnd = false }: { width: number | string; height?: number; sub?: boolean; delay?: number; alignEnd?: boolean }) {
  const base = sub ? "var(--load-sk-sub-base)" : "var(--load-sk-base)";
  const high = sub ? "var(--load-sk-sub-high)" : "var(--load-sk-high)";
  return (
    <div
      className="kcp-sk"
      style={{
        height,
        width,
        borderRadius: 5,
        justifySelf: alignEnd ? "end" : undefined,
        background: `linear-gradient(90deg, ${base} 20%, ${high} 40%, ${base} 60%)`,
        backgroundSize: "220% 100%",
        animation: "kcpSk 2.8s ease infinite",
        animationDelay: `${delay}s`,
      }}
    />
  );
}

export type LoadingStateProps = {
  /** Bold status line, e.g. "Loading Operating Statement…". */
  status: string;
  /** Muted context line, e.g. "Reading the general ledger for 1100 — Parkwood · FY2026". */
  context?: string;
  /** Number of skeleton data rows to preview (default 3). */
  rows?: number;
  /** Number of right-aligned number columns (default 3). */
  columns?: number;
  /** Whether to render the heavier subtotal row (default true). */
  subtotal?: boolean;
  /** Render the card chrome (border + shadow). Set false when embedding inside
   *  an existing card so the loader doesn't nest a card in a card. */
  card?: boolean;
};

export default function LoadingState({ status, context, rows = 3, columns = 3, subtotal = true, card = true }: LoadingStateProps) {
  const gridTemplate = `1fr ${Array(columns).fill("120px").join(" ")}`;
  const rowStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: gridTemplate, gap: 16, alignItems: "center" };
  // Varying label widths so the rows don't look mechanically identical.
  const labelWidths = ["62%", "48%", "70%", "56%", "44%", "66%"];

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      style={{
        background: card ? "var(--load-card)" : "transparent",
        border: card ? "1px solid var(--load-card-border)" : "none",
        borderRadius: 12,
        boxShadow: card ? "var(--load-card-shadow)" : "none",
        overflow: "hidden",
      }}
    >
      {/* Indeterminate top progress bar */}
      <div style={{ position: "relative", height: 3, background: "var(--load-track)", overflow: "hidden" }}>
        <div className="kcp-prog" style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: "40%", background: "var(--load-prog)", animation: "kcpProg 3.2s ease-in-out infinite" }} />
      </div>

      <div style={{ padding: "30px 32px 34px" }}>
        {/* Focal skyline loader */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "22px 0 30px" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7 }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 6 }}>
              {BUILDINGS.map((delays, i) => (
                <Building key={i} delays={delays} />
              ))}
            </div>
            <div style={{ width: 120, height: 3, borderRadius: 2, background: "var(--load-building-border)" }} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--load-status)" }}>{status}</div>
          {context && <div style={{ fontSize: 13, color: "var(--load-context)" }}>{context}</div>}
        </div>

        {/* Skeleton table — previews the shape so the layout doesn't jump */}
        <div style={{ borderTop: "1px solid var(--load-divider)", paddingTop: 20 }}>
          {/* Header row */}
          <div style={{ ...rowStyle, paddingBottom: 14, borderBottom: "1px solid var(--load-divider)", marginBottom: 8 }}>
            <div style={{ height: 11, width: 90, borderRadius: 4, background: "var(--load-header-block)" }} />
            {Array.from({ length: columns }, (_, c) => (
              <div key={c} style={{ height: 11, width: 64, borderRadius: 4, justifySelf: "end", background: "var(--load-header-block)" }} />
            ))}
          </div>
          {/* Data rows */}
          {Array.from({ length: Math.max(1, rows) }, (_, r) => (
            <div key={r} style={{ ...rowStyle, padding: "11px 0" }}>
              <SkBlock width={labelWidths[r % labelWidths.length]} delay={(r % 3) * 0.05} />
              {Array.from({ length: columns }, (_, c) => (
                <SkBlock key={c} width={70} alignEnd delay={0.1 + c * 0.1 + (r % 2) * 0.05} />
              ))}
            </div>
          ))}
          {/* Subtotal row (heavier) */}
          {subtotal && (
            <div style={{ ...rowStyle, padding: "13px 0", borderTop: "1px solid var(--load-divider)", marginTop: 6 }}>
              <SkBlock width="38%" height={14} sub />
              {Array.from({ length: columns }, (_, c) => (
                <SkBlock key={c} width={78} height={14} sub alignEnd delay={0.15 + c * 0.1} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

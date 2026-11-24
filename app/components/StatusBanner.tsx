"use client";
// THE STATUS BANNER — one look for every "what happened / what needs doing"
// callout (owner, 11/2026, holding up the Allocated invoicer's "October 2026
// has been sent to AvidXchange": "i love … the big checkmark its clear what
// happened … the warning card should be the same format … consistent for all
// warning prompts like its time to import the GLs"). A big filled disc with the
// glyph, the headline in the tone's colour, one meta line under it, actions on
// the right.
//
//   success  done (sent, signed off, published, ties)         — check
//   warning  needs attention (stale data, not sent, held)     — triangle, or clock for "it's time to …"
//   danger   wrong (doesn't tie, not posted, failed, error)   — alert
//   info     neutral fact worth a banner                      — info
//
// `compact` is the same structure at in-card size (32px disc, 16px title) for
// notices inside a card or modal. Colours live in globals (.status-banner).

import { Check, CircleAlert, Clock, Info, TriangleAlert, X } from "lucide-react";

export type BannerTone = "success" | "warning" | "danger" | "info";
export type BannerIcon = "check" | "alert" | "clock" | "x" | "info";

const DEFAULT_ICON: Record<BannerTone, BannerIcon> = { success: "check", warning: "alert", danger: "alert", info: "info" };

function Glyph({ icon, tone, size }: { icon: BannerIcon; tone: BannerTone; size: number }) {
  const p = { size, strokeWidth: 2.5, color: "var(--card, #fff)", "aria-hidden": true } as const;
  if (icon === "check") return <Check {...p} />;
  if (icon === "clock") return <Clock {...p} />;
  if (icon === "x") return <X {...p} />;
  if (icon === "info") return <Info {...p} />;
  return tone === "danger" ? <CircleAlert {...p} /> : <TriangleAlert {...p} style={{ marginTop: -2 }} />;
}

export function StatusBanner({ tone, icon, title, children, actions, compact, className, style, onTitleClick }: {
  tone: BannerTone;
  icon?: BannerIcon;
  title: React.ReactNode;
  /** The meta line(s) under the headline: who / when / how much, or what to do. */
  children?: React.ReactNode;
  actions?: React.ReactNode;
  compact?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onTitleClick?: () => void;
}) {
  const ic = icon ?? DEFAULT_ICON[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`status-banner ${tone}${compact ? " compact" : ""}${className ? ` ${className}` : ""}`} style={style}>
      <span className="stb-icon"><Glyph icon={ic} tone={tone} size={compact ? 18 : 24} /></span>
      <div className="stb-body">
        {onTitleClick
          ? <button type="button" className="stb-title stb-title-btn" onClick={onTitleClick}>{title}</button>
          : <div className="stb-title">{title}</div>}
        {children != null && children !== false && <div className="stb-meta">{children}</div>}
      </div>
      {actions && <div className="stb-actions">{actions}</div>}
    </div>
  );
}

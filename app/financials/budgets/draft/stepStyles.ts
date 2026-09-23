import type { CSSProperties } from "react";

/**
 * The "Step N · …" header on every card of the master budget page. Larger and
 * darker than the 11px section label, because these are the page's chapter
 * headings — they have to be findable while scrolling a long page. ONE style,
 * so the five steps (and the cards between them) read as one set.
 */
export const STEP_LABEL: CSSProperties = {
  fontSize: 14,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--text)",
};

// Design system — bright, modern, friendly (think colorful planner / Apple Fitness).
// Single source of truth for colors so pages don't reinvent chip/accent styling.

export const COLORS = {
  primary: '#2F6BFF', // blue
  secondary: '#16C098', // green
  accent: '#FF6B5C', // coral pop — Log / Share
  ink: '#1E2430',
  page: '#EFF5FF',
  card: '#FFFFFF',
  muted: '#7C8398',
  hairline: '#E4EAF6',
} as const;

/** Rotating per-category accent themes. Categories map to these by index. */
export interface CategoryTheme {
  /** Soft pill / tint background. */
  bg: string;
  /** Strong accent for the pill text, counters, progress. */
  accent: string;
}

export const CATEGORY_THEMES: CategoryTheme[] = [
  { bg: '#E4ECFF', accent: '#2F6BFF' }, // blue
  { bg: '#DFF6EF', accent: '#16C098' }, // green
  { bg: '#FFE7E4', accent: '#FF6B5C' }, // coral
  { bg: '#EAE6FC', accent: '#7C6BE6' }, // violet
  { bg: '#FFF1D9', accent: '#E59A2B' }, // amber
  { bg: '#E0F2FE', accent: '#2BA8E0' }, // sky
];

/** Stable theme for a category — same category always gets the same color. */
export function themeForCategory(categories: string[], category: string): CategoryTheme {
  const i = Math.max(0, categories.indexOf(category));
  return CATEGORY_THEMES[i % CATEGORY_THEMES.length];
}

/**
 * Decorative per-group coloring for a notation string. Splits on whitespace and
 * cycles accent colors by group position. This is POSITIONAL/decorative only —
 * it is not suit-accurate and carries no game meaning.
 */
export function colorNotation(notation: string): { text: string; color: string }[] {
  const groups = notation.trim().split(/\s+/);
  return groups.map((text, i) => ({
    text,
    color: CATEGORY_THEMES[i % CATEGORY_THEMES.length].accent,
  }));
}

"use client";

// The program's dropdown look, in one place.
//
// The look itself is NOT here — it is on the `select` element in
// `globals.css`, because styling a native control page-by-page never holds:
// sixty-eight `<select>`s across thirty-four files had shipped as raw OS
// dropdowns next to brand-styled buttons, and the next bare one was always a
// single edit away. The baseline applies to the element, so nothing has to
// opt in and nothing can drift.
//
// What is left here is the choice between the two tiers and the year helper:
//
//   - the quiet neutral pill is the DEFAULT for a plain `<select>` — a row of
//     eight filters should read as one calm strip, not eight blue claims;
//   - `Select` renders the BRAND pill, for the one control a page is actually
//     driven by (the year, the property). Reaching for the component is how
//     you say "this one matters"; pass `tone="neutral"` if it doesn't.

import type { CSSProperties, ReactNode } from "react";

/**
 * Escape hatches for markup that must build its own `<select>`.
 * They carry only what differs from the CSS baseline — never `background`,
 * which would paint over the chevron the baseline draws.
 */
export const SELECT_STYLE: CSSProperties = { fontWeight: 600, color: "var(--brand)" };
export const SELECT_STYLE_SM: CSSProperties = { ...SELECT_STYLE, fontSize: 12 };

/** Class names for the same two things, which is usually the better hook. */
export const SELECT_BRAND = "select-brand";
export const SELECT_SM = "select-sm";

export function Select({ value, onChange, children, tone = "brand", small, className, style, ...rest }: {
  value: string | number;
  onChange: (value: string) => void;
  children: ReactNode;
  /** "brand" is the emphasised pill; "neutral" is the plain baseline. */
  tone?: "brand" | "neutral";
  small?: boolean;
  className?: string;
  style?: CSSProperties;
  "aria-label"?: string;
  disabled?: boolean;
  title?: string;
}) {
  const classes = [
    tone === "brand" ? SELECT_BRAND : null,
    small ? SELECT_SM : null,
    className,
  ].filter(Boolean).join(" ");
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={classes || undefined}
      style={style}
      {...rest}
    >
      {children}
    </select>
  );
}

/** A year picker — the most common case by far. */
export function YearSelect({ value, years, onChange, suffix = "tax year", tone, small, ...rest }: {
  value: number;
  years: number[];
  onChange: (year: number) => void;
  /** Trailing word(s) on each option, e.g. "tax year". Pass "" for a bare year. */
  suffix?: string;
  tone?: "brand" | "neutral";
  small?: boolean;
  "aria-label"?: string;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <Select value={value} onChange={(v) => onChange(Number(v))} tone={tone} small={small} {...rest}>
      {years.map((y) => <option key={y} value={y}>{suffix ? `${y} ${suffix}` : y}</option>)}
    </Select>
  );
}

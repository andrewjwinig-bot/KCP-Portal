"use client";

// The program's dropdown look, in one place.
//
// The brand-outlined pill (Operating Statements, Management Fees, the 1099
// Register, the interim recon) had been re-typed inline on every page that
// wanted it, so anything new either copied a style block or — as the K-1 year
// picker did — shipped a bare browser `<select>` that didn't match anything.

import type { CSSProperties, ReactNode } from "react";

/** The shared look. Exported for the odd `<select>` that needs its own options. */
export const SELECT_STYLE: CSSProperties = {
  borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 600,
  border: "1px solid rgba(11,74,125,0.3)", background: "var(--card)",
  color: "#0b4a7d", cursor: "pointer",
};

/** A compact variant for a dropdown sitting inside a card header or a row. */
export const SELECT_STYLE_SM: CSSProperties = {
  ...SELECT_STYLE, padding: "5px 10px", fontSize: 12.5,
};

export function Select({ value, onChange, children, small, style, ...rest }: {
  value: string | number;
  onChange: (value: string) => void;
  children: ReactNode;
  small?: boolean;
  style?: CSSProperties;
  "aria-label"?: string;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ ...(small ? SELECT_STYLE_SM : SELECT_STYLE), ...style }}
      {...rest}
    >
      {children}
    </select>
  );
}

/** A year picker — the most common case by far. */
export function YearSelect({ value, years, onChange, suffix = "tax year", small, ...rest }: {
  value: number;
  years: number[];
  onChange: (year: number) => void;
  /** Trailing word(s) on each option, e.g. "tax year". Pass "" for a bare year. */
  suffix?: string;
  small?: boolean;
  "aria-label"?: string;
  disabled?: boolean;
}) {
  return (
    <Select value={value} onChange={(v) => onChange(Number(v))} small={small} {...rest}>
      {years.map((y) => <option key={y} value={y}>{suffix ? `${y} ${suffix}` : y}</option>)}
    </Select>
  );
}

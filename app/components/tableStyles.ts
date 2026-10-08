import type { CSSProperties } from "react";

/**
 * One footprint for the program's roster tables.
 *
 * Ten pages had each re-typed their own `th`/`td` constants, at four different
 * paddings, on top of a `globals.css` base that styles every table a fifth
 * way — so two rosters side by side never quite matched. These are the shape
 * the Monthly Statements roster settled on, which is the one most pages had
 * independently arrived at.
 *
 * Right-aligned is the DEFAULT because most columns in this program are money;
 * `thL`/`tdL` are the left variants for the identifying columns that lead a row.
 */
export const th: CSSProperties = {
  textAlign: "right",
  padding: "7px 12px",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "var(--muted)",
  borderBottom: "1px solid var(--border)",
  whiteSpace: "nowrap",
};

export const td: CSSProperties = {
  textAlign: "right",
  padding: "9px 12px",
  fontSize: 14,
  whiteSpace: "nowrap",
  fontVariantNumeric: "tabular-nums",
};

export const thL: CSSProperties = { ...th, textAlign: "left" };

/** Text, not a figure — so no tabular numerals and no forced single line. */
export const tdL: CSSProperties = { ...td, textAlign: "left", fontVariantNumeric: "normal" };

/**
 * The roomier footprint for a table nested INSIDE an expanded row, where the
 * extra air distinguishes the detail from the roster it opened out of.
 */
export const thDetail: CSSProperties = { ...th, padding: "10px 16px" };
export const tdDetail: CSSProperties = { ...td, padding: "12px 16px" };
export const thDetailL: CSSProperties = { ...thDetail, textAlign: "left" };
export const tdDetailL: CSSProperties = { ...tdDetail, textAlign: "left", fontVariantNumeric: "normal" };

// Monthly figures TYPED straight into the budget grid.
//
// The draft computes every month (leases, recoveries, the Budget Inputs, or
// this year's forecast grown); a typed month REPLACES that one month and leaves
// the other eleven computed. Stored per month, with `null` meaning "not typed",
// so clearing a cell hands it back to the computed figure rather than to zero
// — zero is a figure someone can mean.
//
// Keyed by section + line label, the same key the Expenses step uses, so a
// line keeps its typed months across a re-import that reorders the statement.
//
// Pure — no storage — so it is tested directly.

export type LineOverride = {
  /** Twelve entries; null = not typed (the computed month stands). */
  months: (number | null)[];
  by?: string;
  at?: string;
};
export type LineOverrides = Record<string, LineOverride>;

export const lineKey = (section: string, label: string) => `${section}::${label}`;

const r0 = (n: number) => Math.round(n);

/** The computed months with any typed ones laid over them. */
export function mergeMonths(computed: number[], ov?: LineOverride | null): { months: number[]; typed: boolean[] } {
  const typed = computed.map((_, i) => ov?.months?.[i] != null);
  const months = computed.map((v, i) => (typed[i] ? r0(ov!.months[i] as number) : v));
  return { months, typed };
}

/** An annual figure spread evenly, in whole dollars that add back exactly. */
export function spreadEvenly(annual: number): number[] {
  const total = r0(annual);
  const base = Math.trunc(total / 12);
  let left = total - base * 12;
  const step = left >= 0 ? 1 : -1;
  return Array.from({ length: 12 }, () => {
    if (left === 0) return base;
    left -= step;
    return base + step;
  });
}

/** Scale a line's months to a new annual TOTAL, keeping its shape — a tax bill
 *  that lands in May and November stays in May and November. Whole dollars
 *  that add back exactly; a line with no shape to keep is spread evenly. */
export function scaleToTotal(months: number[], total: number): number[] {
  const base = months.reduce((a, b) => a + b, 0);
  if (!(Math.abs(base) > 0.5)) return spreadEvenly(total);
  const raw = months.map((m) => (m * total) / base);
  const out = raw.map((v) => Math.round(v));
  let drift = Math.round(total) - out.reduce((a, b) => a + b, 0);
  // Put any rounding penny on the largest months, so the sum is exact.
  const order = raw.map((v, i) => i).sort((a, b) => Math.abs(raw[b]) - Math.abs(raw[a]));
  for (let k = 0; drift !== 0 && k < 24; k++) { const i = order[k % 12]; const step = drift > 0 ? 1 : -1; out[i] += step; drift -= step; }
  return out;
}

/**
 * Type one month (0–11), every month from an annual (`month: "all"` with a
 * number), or clear the line (`month: "all"`, `value: null`). A line with
 * nothing typed left is removed, so the document only holds what someone typed.
 */
export function applyEdit(
  doc: LineOverrides, key: string, month: number | "all", value: number | null | number[], by?: string, at = new Date().toISOString(),
): LineOverrides {
  const next: LineOverrides = { ...doc };
  const cur = next[key]?.months?.slice() ?? new Array(12).fill(null);
  let months: (number | null)[];
  if (Array.isArray(value)) {
    // All twelve months at once (the history's suggestion, shape kept).
    if (value.length !== 12 || !value.every((v) => Number.isFinite(v))) throw new Error("months must be 12 numbers");
    months = value.map((v) => r0(v));
  } else if (month === "all") months = value == null ? new Array(12).fill(null) : spreadEvenly(value);
  else {
    if (!(month >= 0 && month < 12)) throw new Error("month must be 0–11");
    months = cur;
    months[month] = value == null || !Number.isFinite(value) ? null : r0(value);
  }
  if (months.every((m) => m == null)) delete next[key];
  else next[key] = { months, by, at };
  return next;
}

// The y axis for an inline-SVG bar chart: clean gridlines, tight to the data.

/**
 * A TIGHT axis: the scale that wastes the least room above the data.
 *
 * Bars always start at zero (a bar measured from anything else lies about the
 * ratio between months), so tightness is about the TOP. Snapping to one fixed
 * tick count overshoots badly — a $4,200 peak on a $2,000 step reads against a
 * $6,000 axis and a third of the chart is empty. So it tries every clean step
 * (1/2/2.5/5 × 10ⁿ) that gives 3–6 gridlines and keeps the one whose top sits
 * closest above the data.
 *
 * A CREDIT does not get a whole gridline step of its own. One $120 credit in a
 * year of $2,000 months used to buy a −$1,000 band — a quarter of the chart
 * spent on nothing. The clean scale is fitted to the larger side, and the
 * smaller side gets only the room its data needs (plus a little air); its
 * gridlines are drawn only where they fall inside that.
 */
export function tightScale(lo: number, hi: number): { min: number; max: number; step: number } {
  if (lo < 0 && hi > 0) {
    if (hi >= -lo) {
      const up = tightScale(0, hi);
      return { ...up, min: Math.max(-up.max, lo - (up.max - lo) * 0.06) };
    }
    const dn = tightScale(lo, 0);
    return { ...dn, max: Math.min(-dn.min, hi + (hi - dn.min) * 0.06) };
  }
  const span = Math.max(hi - lo, 1);
  let best: { min: number; max: number; step: number } | null = null;
  for (let ticks = 3; ticks <= 6; ticks++) {
    const raw = span / ticks;
    const pow = 10 ** Math.floor(Math.log10(raw));
    for (const f of [1, 2, 2.5, 5, 10]) {
      const step = f * pow;
      if (step < raw) continue;
      // An all-credit line tops out at zero; an empty one still needs a step of height.
      const max = hi > 0 ? Math.ceil(hi / step) * step : lo < 0 ? 0 : step;
      const min = Math.floor(lo / step) * step;
      const n = Math.round((max - min) / step);
      if (n < 2 || n > 6) continue;
      if (!best || (max - min) < (best.max - best.min) - 1e-9) best = { min, max, step };
      break;
    }
  }
  return best ?? { min: Math.min(0, lo), max: hi || 1, step: span / 4 };
}

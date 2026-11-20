// Which transactions actually DRIVE a line, for the ▲ in the GL drill-down.
//
// The point of the mark is "this is the charge to look at". That only means
// something when one charge stands out from the others.
//
// The first version tested SHARE alone — a third of the line on its own, or a
// fifth once there were three or more transactions. But N roughly-equal charges
// are each 1/N of the line by construction, so any set of five or fewer cleared
// the bar and every row got marked. A landscaping line with four monthly
// Hampton Property Maintenance invoices — 1,155.36 / 1,147.06 / 1,158.66 /
// 1,143.71, within 1% of each other — lit up entirely. That is a contract
// posting on schedule: there is no driver, and four marks carry exactly as much
// information as none.
//
// So a driver has to be BOTH a meaningful slice of the line AND materially
// bigger than the typical charge on it. Each amount is compared against the
// median of the OTHERS, so a set of near-equal amounts has no outlier and
// nothing is marked.

/** How much bigger than its peers a charge must be to count as standing out. */
const STANDOUT = 1.8;

export function driverIndexes(amounts: number[]): Set<number> {
  const out = new Set<number>();
  const n = amounts.length;
  // A lone transaction is trivially 100% of its line — marking it says nothing.
  if (n < 2) return out;

  const abs = amounts.map((a) => Math.abs(a));
  const totalAbs = abs.reduce((s, v) => s + v, 0);
  if (totalAbs <= 0) return out;

  // Sorted positions, so "the median of the others" is index arithmetic rather
  // than rebuilding the array once per row.
  const order = abs.map((a, i) => ({ a, i })).sort((x, y) => x.a - y.a);
  const sorted = order.map((o) => o.a);
  const posOf = new Array<number>(n);
  order.forEach((o, p) => { posOf[o.i] = p; });

  // Median of the n-1 values with element at sorted position `p` removed.
  const mid = Math.floor((n - 1) / 2);
  const typicalWithout = (p: number) => (p <= mid ? sorted[mid + 1] : sorted[mid]);

  for (let i = 0; i < n; i++) {
    const a = abs[i];
    const bigShare = a >= totalAbs / 3 || (n >= 3 && a >= 0.2 * totalAbs);
    if (!bigShare) continue;
    const typical = typicalWithout(posOf[i]);
    // With no peer to compare against, share is all there is.
    if (typical > 0 && a < typical * STANDOUT) continue;
    out.add(i);
  }
  return out;
}

// A tenant whose monthly recovery estimates jump from what they are billed
// today to what the budget bills them next year. The budget is where that is
// decided, so it is where it has to be SEEN — a tenant opening a January
// letter with CAM up 40% is a phone call nobody on the budget saw coming.
//
// Judged on the COMBINED monthly recoveries (CAM + INS + RET), because that is
// the one number on the tenant's bill; each category is reported beside it so
// the hover says which pool moved. Dollars AND percent must both clear their
// floor, the same shape as every other flag here: +40% of a $60 escrow is $24
// and not worth a call; +$150 on a $9,000 bill is 1.7% and not either.

export type RecoveryPart = "cam" | "ins" | "ret";
const PARTS: RecoveryPart[] = ["cam", "ins", "ret"];

/** Combined monthly recoveries must rise by at least this percent… */
export const ESTIMATE_JUMP_PCT = 15;
/** …and by at least this many dollars a month. */
export const ESTIMATE_JUMP_MIN_DOLLARS = 100;

export type EstimateJump = {
  /** Today's combined monthly billing (rent roll). */
  now: number;
  /** The budget's combined monthly estimate. */
  next: number;
  changeDollars: number;
  changePct: number;
  parts: { part: RecoveryPart; now: number; next: number }[];
};

/** The budget's monthly figure for one part: the average over the months it
 *  is actually billed, so a lease ending in June is not averaged over twelve. */
export function monthlyEstimate(months: number[]): number {
  const active = months.filter((v) => Math.abs(v) > 0.5);
  return active.length ? active.reduce((a, b) => a + b, 0) / active.length : 0;
}

/**
 * The jump, or null when there is none worth flagging. A tenant billed
 * nothing today (a new lease, a lease-up, a gross lease) has no "today" to
 * compare against and is never flagged.
 */
export function estimateJump(
  row: { cam: number[]; ins: number[]; ret: number[]; billing?: { cam: number; ins: number; ret: number } | null },
): EstimateJump | null {
  const b = row.billing;
  if (!b) return null;
  const parts = PARTS.map((part) => ({ part, now: b[part] || 0, next: Math.round(monthlyEstimate(row[part])) }));
  const now = parts.reduce((a, p) => a + p.now, 0);
  const next = parts.reduce((a, p) => a + p.next, 0);
  if (now <= 0.5 || next <= 0.5) return null;
  const changeDollars = next - now;
  const changePct = (changeDollars / now) * 100;
  if (changeDollars < ESTIMATE_JUMP_MIN_DOLLARS || changePct < ESTIMATE_JUMP_PCT) return null;
  return { now, next, changeDollars, changePct, parts: parts.filter((p) => p.now > 0.5 || p.next > 0.5) };
}

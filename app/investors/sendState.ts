/**
 * What a link's pill says: sent, created-but-never-emailed, or unknown.
 *
 * Pulled out of the component so it can be tested. "Did this investor's K-1
 * actually go out" is the question the roster exists to answer, and the three
 * states are genuinely different: a link that WENT, a link that was only ever
 * created, and a link too old to carry the record either way. The old pill
 * read "SHARED" for all three.
 */

export type SendState = "opened" | "sent" | "link-only" | "unknown";

export type SendStateInput = {
  viewCount?: number;
  sentAt?: string | null;
  /** Null/undefined = the link predates send tracking. 0 = known never sent. */
  sendCount?: number | null;
};

export function sendState(link: SendStateInput): SendState {
  // Opened outranks sent: it is the stronger fact and it implies the send —
  // including for an old link whose send was never recorded.
  if (link.viewCount) return "opened";
  if (link.sentAt) return "sent";
  // Never claim "never emailed" for a link that simply predates the record.
  return link.sendCount === null || link.sendCount === undefined ? "unknown" : "link-only";
}

/** Green only where something is known to have gone out; grey for unknown. */
export function sendStateTone(state: SendState): "green" | "amber" | "neutral" {
  if (state === "opened" || state === "sent") return "green";
  if (state === "link-only") return "amber";
  return "neutral";
}

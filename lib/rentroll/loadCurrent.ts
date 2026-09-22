import "server-only";
import { getJSON, listJSON } from "@/lib/storage";
import { composeCurrentRoll } from "./current";

const HISTORY_PREFIX = "rentroll-history";
const POINTER_PREFIX = "rentroll";
const POINTER_ID = "current";

/**
 * The current rent roll, composed from the history snapshots — the same answer
 * `/api/rentroll` gives, from the same place.
 *
 * THERE WERE TWO SOURCES AND THEY DISAGREED. `/api/rentroll` composes this
 * fresh on every read, so the Rent Roll page is always right. Everything else
 * read a stored `rentroll/current` POINTER, written at import time, and that
 * pointer can be stale for at least two reasons: the import writes the snapshot
 * and immediately lists the snapshots back, which Vercel Blob does not promise
 * to be consistent; and the pointer's self-heal compares a signature that a
 * re-parse may not change.
 *
 * The visible cost was 1100's August. The Rent Roll page showed Ferry Good
 * Treats' corrected $2,000 while the operating statement — reading the pointer
 * — still had $0 and reported the correct charge as "UNEXPECTED $2,000". Two
 * attempts to make the pointer trustworthy did not fix it, because the problem
 * is not which value the pointer holds, it is that there are two answers to one
 * question.
 *
 * So: compose, exactly as the page does. The pointer stays as the FALLBACK for
 * the case it was always right about — no history snapshots at all.
 *
 * It is not free: composing reads every snapshot. Call it ONCE per sweep, which
 * is what `loadRentCheckShared` already does for the whole cross-property
 * review, rather than per property.
 */
export async function loadCurrentRentRoll<T = unknown>(): Promise<T | null> {
  try {
    const snapshots = (await listJSON(HISTORY_PREFIX)) as unknown[];
    const composed = composeCurrentRoll(snapshots as { properties?: unknown[] }[]);
    if (composed) return composed as T;
  } catch {
    // Fall through to the pointer — a listing that failed is not a reason to
    // report no rent roll at all.
  }
  return (await getJSON(POINTER_PREFIX, POINTER_ID)) as T | null;
}

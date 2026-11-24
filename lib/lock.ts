import "server-only";
import { randomUUID } from "node:crypto";
import { getJSON, storeJSON, deleteJSON } from "@/lib/storage";

// A short-lived lock in the store, for work that must never run twice at once
// (a send that a button press and the cron can both start). The same shape as
// the AvidXchange delivery lock: write a token, read it back, and only the
// writer whose token survives proceeds. A lock older than `staleMs` is taken
// over (the holder died). Fails CLOSED — a read-back that doesn't match means
// "someone else has it", never "go ahead".

const PREFIX = "work-locks";

export async function takeLock(name: string, staleMs = 10 * 60_000): Promise<string | null> {
  const id = name.replace(/[^a-zA-Z0-9\-_]/g, "_");
  const held = (await getJSON(PREFIX, id).catch(() => null)) as { token: string; at: string } | null;
  if (held && Date.now() - Date.parse(held.at) < staleMs) return null;
  const token = randomUUID();
  await storeJSON(PREFIX, id, { token, at: new Date().toISOString() });
  const back = (await getJSON(PREFIX, id).catch(() => null)) as { token: string } | null;
  return back?.token === token ? token : null;
}

export async function releaseLock(name: string, token: string): Promise<void> {
  const id = name.replace(/[^a-zA-Z0-9\-_]/g, "_");
  const held = (await getJSON(PREFIX, id).catch(() => null)) as { token: string } | null;
  if (held?.token === token) await deleteJSON(PREFIX, id).catch(() => {});
}

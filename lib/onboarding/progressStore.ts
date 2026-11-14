// Orientation progress, one document per learner (`onboarding-progress/<user>`):
// the modules finished and the 90-day checklist items
// ticked, each stamped with who and when. Drew opens the same page to follow
// along, so the record is on the server, never in a browser.
import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";

export type ModuleRecord = { doneAt: string };
export type CheckRecord = { doneAt: string; by: string };
export type Progress = { modules: Record<string, ModuleRecord>; checklist: Record<string, CheckRecord>; startedAt?: string };

const PREFIX = "onboarding-progress";
const empty = (): Progress => ({ modules: {}, checklist: {} });

export async function getProgress(user: string): Promise<Progress> {
  const doc = await getJSON(PREFIX, user, { retryOnMiss: true }).catch(() => null);
  return doc ? { ...empty(), ...doc } : empty();
}

export async function updateProgress(user: string, fn: (p: Progress) => void): Promise<Progress> {
  // A failed read throws rather than becoming an empty record written back.
  const doc = await getJSON(PREFIX, user, { retryOnMiss: true });
  const p: Progress = doc ? { ...empty(), ...doc } : empty();
  if (!p.startedAt) p.startedAt = new Date().toISOString();
  fn(p);
  await storeJSON(PREFIX, user, p);
  return p;
}

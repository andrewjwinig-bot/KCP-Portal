import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";
import type { EmailWaiver, EmailWaiverDoc } from "./emailWaivers";

const PREFIX = "tenant-email-waivers";
const ID = "all";

export async function getEmailWaivers(): Promise<EmailWaiverDoc> {
  const d = await getJSON(PREFIX, ID).catch(() => null);
  return { waivers: Array.isArray(d?.waivers) ? d.waivers : [], cleared: Array.isArray(d?.cleared) ? d.cleared : [] };
}

/** Set a suite's tenant aside (no email needed). A read failure throws, so a
 *  bad read is never written over the saved list. */
export async function waiveEmail(w: Omit<EmailWaiver, "at">): Promise<void> {
  const d = await getJSON(PREFIX, ID, { retryOnMiss: true });
  const doc: EmailWaiverDoc = { waivers: d?.waivers ?? [], cleared: d?.cleared ?? [] };
  const ref = w.unitRef.toUpperCase();
  doc.waivers = [...doc.waivers.filter((x) => x.unitRef.toUpperCase() !== ref), { ...w, at: new Date().toISOString() }];
  doc.cleared = doc.cleared.filter((c) => c.toUpperCase() !== ref);
  await storeJSON(PREFIX, ID, doc);
}

/** Ask about the suite again — a seeded waiver stays undone. */
export async function unwaiveEmail(unitRef: string): Promise<void> {
  const d = await getJSON(PREFIX, ID, { retryOnMiss: true });
  const doc: EmailWaiverDoc = { waivers: d?.waivers ?? [], cleared: d?.cleared ?? [] };
  const ref = unitRef.toUpperCase();
  doc.waivers = doc.waivers.filter((x) => x.unitRef.toUpperCase() !== ref);
  if (!doc.cleared.some((c) => c.toUpperCase() === ref)) doc.cleared.push(unitRef);
  await storeJSON(PREFIX, ID, doc);
}

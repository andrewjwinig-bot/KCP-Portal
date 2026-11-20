import "server-only";
import { listJSON, storeJSON } from "@/lib/storage";
import type { Lead } from "./spaceInquiry";

// Every inquiry from a space page, kept (`website-leads`, one record each,
// never edited): which space, who, how they found us, and whether the emails
// went. The answer to "which listings and channels produce leads".

const PREFIX = "website-leads";

export async function saveLead(lead: Lead): Promise<void> {
  await storeJSON(PREFIX, lead.id, lead);
}

export async function listLeads(): Promise<Lead[]> {
  const all = (await listJSON(PREFIX, { fresh: true })) as Lead[];
  return all.filter((l) => l && l.id).sort((a, b) => b.at.localeCompare(a.at));
}

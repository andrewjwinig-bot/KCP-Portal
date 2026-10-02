// Per-invoice "already sent to Avid" ledger, so a retry after a partial failure
// only re-sends the invoices that didn't go out. Keyed by (source, period); each
// invoice is tracked by its filename, plus a flag for the one team summary email.

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";

const PREFIX = "avid-sent";
const idFor = (source: string, period: string) =>
  `${source}-${period}`.replace(/[^0-9A-Za-z]+/g, "-") || "unknown";

export type AvidSentRecord = {
  source: string;
  period: string;
  /** invoice filename → ISO timestamp it was accepted by Postmark. */
  invoices: Record<string, string>;
  /** ISO timestamp the team summary email went out (null until it does). */
  teamSummaryAt: string | null;
  updatedAt: string;
};

export async function getAvidSent(source: string, period: string): Promise<AvidSentRecord> {
  const rec = (await getJSON(PREFIX, idFor(source, period))) as AvidSentRecord | null;
  return {
    source, period,
    invoices: rec?.invoices ?? {},
    teamSummaryAt: rec?.teamSummaryAt ?? null,
    updatedAt: rec?.updatedAt ?? "",
  };
}

export async function saveAvidSent(rec: AvidSentRecord): Promise<void> {
  await storeJSON(PREFIX, idFor(rec.source, rec.period), { ...rec, updatedAt: new Date().toISOString() });
}

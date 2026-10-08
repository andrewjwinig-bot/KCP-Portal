// Tracks which invoicer runs have already had their GL import + summary report
// auto-emailed to the controller, so re-processing a period doesn't resend.
// Mirrors lib/payroll/allocReportSent.ts. One tiny blob per (source, period).

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";

const PREFIX = "invoicer-report-sent";
const idFor = (source: string, period: string) =>
  `${source}-${period}`.replace(/[^0-9A-Za-z]+/g, "-") || "unknown";

export async function reportAlreadySent(source: string, period: string): Promise<boolean> {
  return !!(await getJSON(PREFIX, idFor(source, period)));
}

export async function markReportSent(source: string, period: string, to: string): Promise<void> {
  await storeJSON(PREFIX, idFor(source, period), {
    source, period, to, sentAt: new Date().toISOString(),
  });
}

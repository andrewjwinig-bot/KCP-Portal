// Tracks which pay dates have already had their property-allocation report
// auto-emailed, so re-downloading the invoice batch doesn't spam the controller.
// One tiny blob per pay date.

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";

const PREFIX = "payroll-alloc-report-sent";
const idFor = (payDate: string) => (payDate || "unknown").replace(/[^0-9A-Za-z]+/g, "-");

export async function allocReportAlreadySent(payDate: string): Promise<boolean> {
  return !!(await getJSON(PREFIX, idFor(payDate)));
}

export async function markAllocReportSent(payDate: string, to: string): Promise<void> {
  await storeJSON(PREFIX, idFor(payDate), { payDate, to, sentAt: new Date().toISOString() });
}

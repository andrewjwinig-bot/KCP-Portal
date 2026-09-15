import { NextResponse } from "next/server";
import { getJSON } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PREFIX = "commissions";
const SENT_LOG_ID = "avidbill-sent";

/** Reflects the avidbill-sent log so the commissions page can stamp
 *  "Sent to AvidXchange on MM/DD/YY" on every row whose quarter has
 *  already been billed. Read-only; the log is written by
 *  sendQuarterToAvidBill on successful sends. */
export async function GET() {
  try {
    const raw = await getJSON(PREFIX, SENT_LOG_ID);
    const log = (raw && typeof raw === "object") ? raw : {};
    return NextResponse.json({ log });
  } catch {
    return NextResponse.json({ log: {} });
  }
}

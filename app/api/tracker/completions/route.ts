import { NextResponse } from "next/server";
import { getCompletions } from "@/lib/tracker/completionStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** GET → { completions: { "<year>-<month0>-<taskId>": { at, by?, source? } } }
 *  Server-recorded task completions (e.g. auto-completed when an invoicer run is
 *  processed) so the dashboard/tracker can show them checked across browsers. */
export async function GET() {
  try {
    return NextResponse.json({ completions: await getCompletions() });
  } catch {
    return NextResponse.json({ completions: {} });
  }
}

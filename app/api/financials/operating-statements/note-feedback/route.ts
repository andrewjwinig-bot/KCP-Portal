import { NextResponse } from "next/server";
import { listNoteEdits } from "@/lib/financials/operating-statements/statementStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET — the captured AI→human note corrections. Each time someone edits an
// AI-written note into something different, the (aiNote → userNote) pair is
// logged; this surfaces them so the auto-explain prompt can be tuned from real
// corrections over time.
export async function GET() {
  const edits = await listNoteEdits();
  return NextResponse.json({ count: edits.length, edits });
}

import { NextResponse } from "next/server";
import { getPendingGl, getPendingGlMeta } from "@/lib/allocated-invoicer/pendingGlStore";
import { listAllocationRuns } from "@/lib/allocated-invoicer/runStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * GET — the 2000 G&A GL handed off from the Operating Statements upload, so the
 * Allocated Expense Invoicer can offer to generate its invoices without a second
 * upload of the same file.
 *   (default) → metadata + statementMonth + alreadyProcessed (small payload)
 *   ?file=1   → { fileBase64 } to actually load + parse it
 */
export async function GET(req: Request) {
  const wantFile = new URL(req.url).searchParams.get("file") === "1";

  if (wantFile) {
    const g = await getPendingGl();
    if (!g) return NextResponse.json({ error: "No pending GL" }, { status: 404 });
    return NextResponse.json({ fileBase64: g.fileBase64, fileName: g.fileName });
  }

  const meta = await getPendingGlMeta();
  if (!meta) return NextResponse.json({ pending: null });

  const statementMonth = `${MONTHS[meta.month - 1] ?? ""} ${meta.year}`.trim();
  // "Already processed" if a run has been recorded for this same statement month.
  const runs = await listAllocationRuns();
  const alreadyProcessed = runs.some((r) => r.statementMonth === statementMonth);

  return NextResponse.json({ pending: { ...meta, statementMonth, alreadyProcessed } });
}

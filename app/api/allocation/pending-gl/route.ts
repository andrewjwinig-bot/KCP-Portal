import { NextResponse } from "next/server";
import { getPendingGl, getPendingGlMeta } from "@/lib/allocated-invoicer/pendingGlStore";
import { getAllocLedger } from "@/lib/allocated-invoicer/carryoverStore";
import { getPendingSend } from "@/lib/allocated-invoicer/pendingSendStore";

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
  // "Already processed" = this period has been reviewed & sent to Avid: the
  // carryover ledger was finalized for it, or its pending send is marked sent.
  // Keyed by the canonical YYYY-MM (the same key the send path uses).
  const ymKey = `${meta.year}-${String(meta.month).padStart(2, "0")}`;
  const [ledger, sent] = await Promise.all([getAllocLedger(), getPendingSend("allocated", ymKey)]);
  const alreadyProcessed = ledger.committedPeriods.includes(ymKey) || !!sent?.sentAt;

  return NextResponse.json({ pending: { ...meta, statementMonth, alreadyProcessed } });
}

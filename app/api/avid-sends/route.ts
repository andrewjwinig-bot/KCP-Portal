import { NextResponse } from "next/server";
import { listAvidSends } from "@/lib/invoicing/avidSendLog";
import { listAllocationRuns } from "@/lib/allocated-invoicer/runStore";
import { listJSON } from "@/lib/storage";
import { unsentBatches, type Processed, type Sent } from "@/lib/invoicing/unsent";
import { listPendingSends } from "@/lib/allocated-invoicer/pendingSendStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET [?limit=] — the AP outbox: recent batches released to AvidXchange across
// every flow (Allocated, Credit Card, Payroll, Commissions), newest first —
// plus `unsent`: each flow's newest PROCESSED batch with no send at or after
// it (`unsentBatches`). Generating or downloading a batch is not sending it.
export async function GET(req: Request) {
  const limit = Number(new URL(req.url).searchParams.get("limit")) || 40;
  const all = await listAvidSends(200);
  const processed: Processed[] = [];
  try {
    for (const r of await listAllocationRuns()) processed.push({ source: "allocated", label: "Allocated Expenses", period: r.statementMonth || r.periodText, at: r.ranAt, by: r.ranBy ?? null });
  } catch { /* best-effort */ }
  try {
    for (const d of (await listJSON("statements")) as { savedAt?: string; periodText?: string; statementMonth?: string; savedBy?: string | null }[]) {
      if (d?.savedAt) processed.push({ source: "credit-card", label: "Credit Card Expenses", period: d.periodText || d.statementMonth || "", at: d.savedAt, by: d.savedBy ?? null });
    }
  } catch { /* best-effort */ }
  try {
    for (const p of (await listJSON("periods")) as { savedAt?: string; name?: string; savedBy?: string | null }[]) {
      if (p?.savedAt) processed.push({ source: "payroll", label: "Payroll", period: p.name ?? "", at: p.savedAt, by: p.savedBy ?? null });
    }
  } catch { /* best-effort */ }
  // A send the invoicer itself recorded (its staged send marked sent) counts
  // too — August 2026's Allocated batch went out before the send log existed,
  // and must not read as "not sent".
  const sent: Sent[] = all.map((a) => ({ source: a.source, sentAt: a.sentAt, period: a.period }));
  try {
    for (const p of await listPendingSends()) if (p.sentAt) sent.push({ source: p.source, sentAt: p.sentAt, period: p.period });
  } catch { /* best-effort */ }
  return NextResponse.json({ sends: all.slice(0, limit), unsent: unsentBatches(processed, sent) });
}

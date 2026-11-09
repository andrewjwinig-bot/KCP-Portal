import { NextRequest, NextResponse } from "next/server";
import { history, runMonth } from "@/lib/bank-rec/month";
import { filesFor, reportFor, resolutions, runFor } from "@/lib/bank-rec/store";
import { budgetUser } from "@/lib/financials/budgets/currentUser";
import { USERS } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;

// GET ?period=YYYY-MM — the month's rec as last run, its files, and the
// history of every month on record.
export async function GET(req: NextRequest) {
  const period = req.nextUrl.searchParams.get("period") ?? "";
  try {
    const [hist, run, files, report, resolved] = await Promise.all([
      history(),
      /^\d{4}-\d{2}$/.test(period) ? runFor(period) : null,
      /^\d{4}-\d{2}$/.test(period) ? filesFor(period) : [],
      /^\d{4}-\d{2}$/.test(period) ? reportFor(period) : null,
      resolutions(),
    ]);
    return NextResponse.json({
      ok: true, history: hist, run,
      files: files.map((f) => ({ name: f.name, kind: f.kind, last4: f.last4, matchedBy: f.matchedBy, uploadedAt: f.uploadedAt, by: f.by, itemizeError: f.itemizeError ?? null, ending: f.statement?.ending ?? null })),
      report: report ? { name: report.name, asOf: report.asOfISO, uploadedAt: report.uploadedAt } : null,
      resolutions: resolved,
    });
  } catch (e) {
    console.error("[GET /api/bank-rec/month]", e);
    return NextResponse.json({ error: "Could not load the bank rec — refresh." }, { status: 503 });
  }
}

// POST { period, force? } — run (or re-run) the month from its files.
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const period = String(b?.period ?? "");
  if (!/^\d{4}-\d{2}$/.test(period)) return NextResponse.json({ error: "period is required" }, { status: 400 });
  try {
    const user = await budgetUser();
    const run = await runMonth(period, user ? USERS[user]?.label ?? user : null, { force: !!b?.force });
    return NextResponse.json({ ok: true, run });
  } catch (e) {
    console.error("[POST /api/bank-rec/month]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}

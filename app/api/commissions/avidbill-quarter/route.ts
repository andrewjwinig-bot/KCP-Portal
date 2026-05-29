import { NextResponse } from "next/server";
import { priorQuarterLabel, sendQuarterToAvidBill } from "@/lib/commissions/sendQuarterToAvidBill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Quarter-end send to kormancommercial@avidbill.com — one PDF per
 * logged commission, attached to a single email.
 *
 * GET form for Vercel cron (vercel.json crons array). Auth via
 *   `Authorization: Bearer <CRON_SECRET>` header which Vercel sets
 *   automatically when invoking cron jobs. The endpoint stays
 *   idempotent — re-runs for an already-sent quarter return the
 *   prior result instead of re-billing.
 *
 * POST form for manual / dev triggers. Body shape:
 *   { quarterLabel?: string, dryRun?: boolean, force?: boolean }
 *   Defaults: most-recently-completed quarter, dryRun = false, force = false.
 *
 * Same auth model — bearer header OR (in dev) any signed-in admin.
 */

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production"; // permissive in dev
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await sendQuarterToAvidBill({ quarterLabel: priorQuarterLabel() });
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { quarterLabel?: string; dryRun?: boolean; force?: boolean } = {};
  try { body = await req.json(); } catch { /* empty body ok */ }
  const result = await sendQuarterToAvidBill({
    quarterLabel: body.quarterLabel ?? priorQuarterLabel(),
    dryRun: !!body.dryRun,
    force: !!body.force,
  });
  return NextResponse.json(result);
}

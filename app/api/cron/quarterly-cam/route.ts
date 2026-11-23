import { NextResponse } from "next/server";
import { autoSendQuarterly, remindOverdueQuarters } from "@/lib/cam/retail/quarterlySend";
import { sendCapexJeReminders } from "@/lib/cam/retail/capexJeReminderSend";
import { cronAuthorized } from "@/lib/cronAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Daily safety net for the automatic quarterly CAM send (Wawa @ 9510): a
 * quarter whose last month's GL is imported but which did not go (mail down,
 * a timeout) is sent now; one that jumped is held and Drew is told once. The
 * GL import is the primary trigger. Idempotent — a no-op once sent.
 *
 * GET: Vercel cron (`Authorization: Bearer <CRON_SECRET>`) only (lib/cronAuth.ts).
 * Sits outside the site-auth middleware — see middleware.ts matcher.
 */
async function authorized(req: Request): Promise<boolean> {
  return cronAuthorized(req);
}

export async function GET(req: Request) {
  if (!(await authorized(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const results = await autoSendQuarterly(null, null);
  // Anything past its due date and still unsent: Drew is emailed, weekly,
  // until it goes (11/16/26 — Q3 2026 sat unsent with nothing saying so).
  const reminded = await remindOverdueQuarters().catch(() => []);
  // Each December 1st through the term: the capitalized CAM project's journal
  // entry (2300's 2021 paving, 2026–2031).
  const jeReminders = await sendCapexJeReminders().catch(() => []);
  return NextResponse.json({ results, reminded, jeReminders });
}

import { NextResponse } from "next/server";
import { runBackup } from "@/lib/backup/run";
import { alertBackupFailed } from "@/lib/backup/alert";
import { easternDate } from "@/lib/backup/plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * The nightly backup (lib/backup). Vercel cron calls it hourly from 1am to 6am
 * Eastern; each call works until its time budget and the next carries on, so a
 * big store still finishes the same night. The LAST window emails Drew if
 * tonight's snapshot did not finish.
 *
 * Vercel cron only (`Authorization: Bearer <CRON_SECRET>`) — the manual "Back
 * up now" goes through /api/backups, which is gated to the Backups page. Sits
 * outside the site-auth middleware (see middleware.ts matcher).
 */
const LAST_WINDOW_UTC = 10;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  const ok = secret ? header === `Bearer ${secret}` : process.env.NODE_ENV !== "production";
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const start = Date.now();
  const now = new Date();
  try {
    const r = await runBackup({ deadline: start + 250_000, now });
    if (r.status === "partial" && now.getUTCHours() >= LAST_WINDOW_UTC) {
      await alertBackupFailed(r.date, `Ran out of time after ${r.done} of ${r.total} items.`).catch(() => {});
    }
    if (r.status === "done") {
      return NextResponse.json({ status: r.status, date: r.date, documents: r.manifest.documents, files: r.manifest.files, errors: r.manifest.errors.length, pruned: r.pruned });
    }
    return NextResponse.json(r);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[backup] failed:", msg);
    if (now.getUTCHours() >= LAST_WINDOW_UTC) await alertBackupFailed(easternDate(now), msg).catch(() => {});
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

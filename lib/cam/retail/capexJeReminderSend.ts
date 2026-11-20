import "server-only";
import { createMapStore } from "@/lib/collectionStore";
import { sendMailDetailed, VERIFIED_FROM } from "@/lib/mail";
import { reminderEmail, remindersDue } from "./capexJeReminder";

// Sends the yearly capitalized-CAM journal-entry reminders that are due
// (capexJeReminder.ts), once each — recorded only after the mail goes, so a
// failed send is retried by the next day's cron. Run by the daily
// /api/cron/quarterly-cam.

const store = createMapStore<{ at: string; to: string[] }>({ prefix: "capex-je-reminders" });

export async function sendCapexJeReminders(now: Date = new Date()): Promise<string[]> {
  const done: string[] = [];
  for (const d of remindersDue(now, new Set())) {
    if (await store.get(d.key)) continue;
    const e = reminderEmail(d.capex, d.year);
    const to = d.capex.jeReminder!.to;
    const r = await sendMailDetailed({ from: VERIFIED_FROM, to: to.join(", "), subject: e.subject, htmlBody: e.html, textBody: e.text })
      .catch(() => ({ ok: false }));
    if (r.ok) {
      await store.set(d.key, { at: now.toISOString(), to });
      done.push(d.key);
    }
  }
  return done;
}

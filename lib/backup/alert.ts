import "server-only";
import { put, get } from "@vercel/blob";
import { sendMailDetailed } from "@/lib/mail";
import { portalEmail } from "@/lib/email/portalEmail";
import { BACKUP_ROOT } from "./plan";

// The backup is only worth anything if someone hears when it STOPS. The last
// cron window of the night emails Drew once if tonight's snapshot did not
// finish (`BACKUP_ALERT_TO` overrides).

const ALERT_TO = () => process.env.BACKUP_ALERT_TO || "dwinig@kormancommercial.com";
const FROM = "dwinig@kormancommercial.com"; // verified Postmark sender

export async function alertBackupFailed(date: string, reason: string): Promise<boolean> {
  const marker = `${BACKUP_ROOT}state/alerted-${date}.json`;
  const seen = await get(marker, { access: "private", useCache: false }).catch(() => null);
  if (seen && seen.statusCode === 200) return false;
  const e = portalEmail({
    subject: `Portal backup did not finish — ${date}`,
    eyebrow: "Backups",
    title: "Last night's backup did not finish",
    lead: "The nightly copy of the portal's data stopped before it was complete. Open Backups to see the last good snapshot and run one now.",
    rows: [
      { label: "Night of", value: date },
      { label: "What happened", value: reason },
    ],
    link: { label: "Open Backups", path: "/backups" },
  });
  const r = await sendMailDetailed({ to: ALERT_TO(), from: FROM, subject: e.subject, textBody: e.text, htmlBody: e.html });
  if (r.ok) {
    await put(marker, JSON.stringify({ at: new Date().toISOString(), reason }), {
      access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json",
    });
  }
  return r.ok;
}

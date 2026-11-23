// EVERY U&O EMAIL GOES THROUGH HERE, AND THEY ARE PAUSED (owner, 11/23/26:
// "pause the U&O email distributions since were not 100% ready to launch").
// While paused nothing is sent — the review to Greg / Harry, the reminder, the
// returns and overdue notice to Drew, the assessment alarm / changes, and the
// January UO charges to Tanya — and nothing is stamped as sent, so each goes
// out on the next cron run once they are switched on. The U&O page itself
// keeps working. To launch: set UO_EMAILS_LIVE=1 in Vercel (no deploy of code).
import "server-only";
import { sendMailDetailed as send, type MailMessage, type MailResult } from "@/lib/mail";

export const uoEmailsPaused = (): boolean => process.env.UO_EMAILS_LIVE !== "1";

export const UO_PAUSED_MESSAGE = "U&O emails are paused until the process launches — nothing was sent.";

export async function sendMailDetailed(msg: MailMessage): Promise<MailResult> {
  if (uoEmailsPaused()) return { ok: false, error: UO_PAUSED_MESSAGE };
  return send(msg);
}

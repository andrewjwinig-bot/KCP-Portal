import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sendMail, isMailConfigured } from "@/lib/mail";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { canSwitchUsers, ALL_USERS, type UserId } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEST_TO = "dwinig@kormancommercial.com, mjaster@kormancommercial.com";
const TEST_FROM = "dwinig@kormancommercial.com"; // verified Postmark sender

async function currentUser(): Promise<UserId | null> {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) return null;
  const id = await verifySiteToken((await cookies()).get(SITE_COOKIE)?.value, secret);
  return id && (ALL_USERS as readonly string[]).includes(id) ? (id as UserId) : null;
}

// GET — check config + recipients (no send).
// GET ?send=1 — actually send a one-off deliverability test to dwinig + mjaster.
// Admin/Drew only.
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user || !canSwitchUsers(user)) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const configured = isMailConfigured();
  const send = new URL(req.url).searchParams.get("send") === "1";
  if (!send) {
    return NextResponse.json({ configured, from: TEST_FROM, wouldSendTo: TEST_TO, hint: "Add ?send=1 to actually send the test." });
  }
  if (!configured) {
    return NextResponse.json({ ok: false, configured, error: "Postmark not configured (POSTMARK_SERVER_TOKEN / MAINTENANCE_REPLY_FROM)." }, { status: 503 });
  }
  const ok = await sendMail({
    to: TEST_TO,
    from: TEST_FROM,
    subject: "KCP Portal — email delivery test",
    textBody:
      "This is a test message from the KCP Portal to confirm outbound email is working.\n\n" +
      "If you received this, the property-allocation auto-send (and other notifications) will reach you. " +
      "No action needed.",
  });
  return NextResponse.json({ ok, configured, sentTo: TEST_TO, from: TEST_FROM, triggeredBy: user });
}

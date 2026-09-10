import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { ALL_USERS, isPathAllowed, USERS, type UserId } from "@/lib/users";
import { isMailConfigured, isMailTestMode, sendMailDetailed, postmarkServerIdentity, postmarkMessage } from "@/lib/mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Is outbound mail actually working?
 *
 * This existed nowhere, and the cost was two days of "the app says Sent and
 * nothing arrives" with no way to tell whether the problem was the token, the
 * sender, the recipient or the app. Every answer lived in an environment
 * variable nobody could see and an API response the code threw away.
 *
 * GET  reports the configuration WITHOUT revealing the token — whether it is
 *      set, whether it is the TEST token (which accepts everything and
 *      delivers nothing), and which address mail is sent from.
 * POST sends one real test message to the signed-in staff member's chosen
 *      address and reports exactly what Postmark said, message id included.
 *
 * Staff-only, on the same capability as the K-1 tooling.
 */
async function currentUser(): Promise<UserId | null> {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) return null;
  const id = await verifySiteToken((await cookies()).get(SITE_COOKIE)?.value, secret);
  if (!id || !(ALL_USERS as readonly string[]).includes(id)) return null;
  return isPathAllowed(id as UserId, "/investor-k1") ? (id as UserId) : null;
}

/** Never the token itself — only whether it is there and what shape it is. */
function tokenShape(): { set: boolean; testToken: boolean; length: number } {
  const t = (process.env.POSTMARK_SERVER_TOKEN ?? "").trim();
  return { set: !!t, testToken: isMailTestMode(), length: t.length };
}

export async function GET(req: Request) {
  if (!(await currentUser())) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  // ?message=<id> — what became of one specific send. Answers "the app gave me
  // a message id but Activity shows nothing", which is the shape of looking at
  // the wrong server.
  const messageId = new URL(req.url).searchParams.get("message");
  if (messageId) {
    return NextResponse.json({
      ok: true,
      server: await postmarkServerIdentity(),
      message: await postmarkMessage(messageId),
    });
  }

  const token = tokenShape();
  const from = (process.env.MAINTENANCE_REPLY_FROM ?? "").trim();
  const problems: string[] = [];
  if (!token.set) problems.push("POSTMARK_SERVER_TOKEN is not set — nothing can send.");
  if (token.testToken) problems.push("POSTMARK_SERVER_TOKEN is the TEST token. Postmark accepts every message and delivers NONE of them.");
  if (!from) problems.push("MAINTENANCE_REPLY_FROM is not set — there is no sender address.");
  return NextResponse.json({
    ok: true,
    configured: isMailConfigured(),
    token,
    from: from || null,
    k1CopyTo: (process.env.K1_SHARE_COPY_TO ?? "dwinig@kormancommercial.com").trim() || null,
    // WHICH Postmark server the token belongs to. Each has its own Activity
    // feed, so a message accepted by one is invisible in another's.
    server: await postmarkServerIdentity(),
    portalOrigin: process.env.PORTAL_ORIGIN ?? null,
    problems,
  });
}

/** POST { to } — send one real message and report Postmark's exact answer. */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const to = String(body?.to ?? "").trim();
  if (!to.includes("@")) return NextResponse.json({ error: "Give an address to send the test to." }, { status: 400 });

  const at = new Date().toISOString();
  const res = await sendMailDetailed({
    to,
    subject: `Portal mail test — ${at}`,
    textBody: [
      "This is a test from the Korman portal.",
      "",
      "If you are reading it, outbound mail works: the token is real, the sender is",
      "verified, and this address accepts our mail. Investor K-1 links travel the",
      "same path.",
      "",
      `Sent ${at} by ${USERS[user]?.label ?? user}.`,
    ].join("\n"),
  });

  return NextResponse.json({
    ok: res.ok,
    sentTo: res.ok ? to : null,
    messageId: res.messageId ?? null,
    testMode: !!res.testMode,
    error: res.error ?? null,
    token: tokenShape(),
    from: (process.env.MAINTENANCE_REPLY_FROM ?? "").trim() || null,
  });
}

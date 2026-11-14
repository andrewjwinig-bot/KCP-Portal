import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { ALL_USERS, USERS, canEditCashSheet, type UserId } from "@/lib/users";
import { loadEmailDoc, saveRecipients, sendCashPosition } from "@/lib/financials/bank-balances/ownershipEmail";
import { logAudit, auditIp } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function currentUser(): Promise<UserId | null> {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) return null;
  const token = (await cookies()).get(SITE_COOKIE)?.value;
  const id = await verifySiteToken(token, secret);
  return id && (ALL_USERS as readonly string[]).includes(id) ? (id as UserId) : null;
}

export async function GET() {
  return NextResponse.json(await loadEmailDoc());
}

/** POST { recipients } saves the list; POST { send: true } sends now. */
export async function POST(req: Request) {
  const user = await currentUser();
  if (user && !canEditCashSheet(user)) return NextResponse.json({ error: "View-only access." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (Array.isArray(body?.recipients)) {
    const doc = await saveRecipients(body.recipients);
    await logAudit({ event: "cash-position.recipients", user: user ?? "?", ip: auditIp(req), detail: doc.recipients.join(", ") }).catch(() => {});
    return NextResponse.json(doc);
  }
  if (body?.send) {
    const by = user ? USERS[user]?.label ?? user : null;
    const out = await sendCashPosition({ by, force: true });
    await logAudit({ event: "cash-position.send", user: user ?? "?", ip: auditIp(req), detail: out.sent ? `to ${out.to?.join(", ")}` : `not sent: ${out.reason}` }).catch(() => {});
    return NextResponse.json({ ...out, doc: await loadEmailDoc() }, { status: out.sent ? 200 : 400 });
  }
  return NextResponse.json({ error: "Nothing to do." }, { status: 400 });
}

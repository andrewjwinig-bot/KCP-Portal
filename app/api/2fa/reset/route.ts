import { NextRequest, NextResponse } from "next/server";
import { disableTotp } from "@/lib/totp-store";
import { ALL_USERS } from "@/lib/users";
import { logAudit, auditIp } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin-only (ADMIN_PATH_PREFIXES in middleware): clear someone's 2FA when
// they lost their phone. Turning off your OWN 2FA takes a current code
// (/api/2fa/disable) — this is the way back for someone who has none.
export async function POST(req: NextRequest) {
  let body: { userId?: string } = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const userId = String(body.userId ?? "");
  if (!(ALL_USERS as readonly string[]).includes(userId)) return NextResponse.json({ error: "Unknown user" }, { status: 400 });
  await disableTotp(userId);
  await logAudit({ event: "2fa.reset-by-admin", user: "admin", ip: auditIp(req), detail: userId });
  return NextResponse.json({ ok: true });
}

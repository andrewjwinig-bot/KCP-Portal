import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { ALL_USERS, canEditOwnership, type UserId } from "@/lib/users";
import { getTrusteeOverrides, saveTrusteeOverride, type TrusteeOverride } from "@/lib/investors/trusteeStore";
import { logAudit, auditIp } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function currentUser(): Promise<UserId | null> {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) return null;
  const token = (await cookies()).get(SITE_COOKIE)?.value;
  const id = await verifySiteToken(token, secret);
  return id && (ALL_USERS as readonly string[]).includes(id) ? (id as UserId) : null;
}

/** GET ?dir=<directoryKey> — the stored trustee overrides for one directory. */
export async function GET(req: Request) {
  const dir = new URL(req.url).searchParams.get("dir")?.trim();
  if (!dir) return NextResponse.json({ error: "dir required" }, { status: 400 });
  return NextResponse.json({ overrides: await getTrusteeOverrides(dir) });
}

export async function PUT(req: Request) {
  const user = await currentUser();
  if (user && !canEditOwnership(user)) {
    return NextResponse.json({ error: "You have view-only access to ownership info." }, { status: 403 });
  }
  let body: { dir?: string; key?: string; row?: TrusteeOverride | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const dir = (body.dir ?? "").toString().trim();
  const key = (body.key ?? "").toString().trim();
  if (!dir || !key) return NextResponse.json({ error: "dir and key required" }, { status: 400 });
  if (body.row && !(body.row.name ?? "").toString().trim()) {
    return NextResponse.json({ error: "Trustee name required" }, { status: 400 });
  }
  const overrides = await saveTrusteeOverride(dir, key, body.row ?? null);
  await logAudit({ event: body.row === null ? "ownership.trustee.clear" : "ownership.trustee.save", user, ip: auditIp(req), detail: `${dir}:${key}` });
  return NextResponse.json({ overrides });
}

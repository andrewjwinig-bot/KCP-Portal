import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { ALL_USERS, canEditOwnership, type UserId } from "@/lib/users";
import { getEntityOverrides, saveEntityOverride, type EntityOverride } from "@/lib/properties/entityOverrideStore";
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

export async function GET() {
  return NextResponse.json({ overrides: await getEntityOverrides() });
}

export async function PUT(req: Request) {
  const user = await currentUser();
  if (user && !canEditOwnership(user)) {
    return NextResponse.json({ error: "You have view-only access to ownership info." }, { status: 403 });
  }
  let body: { code?: string; override?: EntityOverride | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const code = (body.code ?? "").toString().trim();
  if (!code) return NextResponse.json({ error: "entity code required" }, { status: 400 });
  const overrides = await saveEntityOverride(code, body.override ?? null);
  await logAudit({ event: body.override === null ? "ownership.entity.clear" : "ownership.entity.save", user, ip: auditIp(req), detail: code });
  return NextResponse.json({ overrides });
}

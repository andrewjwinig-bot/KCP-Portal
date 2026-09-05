import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { ALL_USERS, canEditOwnership, type UserId } from "@/lib/users";
import { getContactOverrides, saveContactOverride, type OwnerContactOverride } from "@/lib/properties/ownerContactsStore";
import { logAudit, auditIp } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** The signed-in user from the site cookie (authoritative). */
async function currentUser(): Promise<UserId | null> {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) return null;
  const token = (await cookies()).get(SITE_COOKIE)?.value;
  const id = await verifySiteToken(token, secret);
  return id && (ALL_USERS as readonly string[]).includes(id) ? (id as UserId) : null;
}

export async function GET() {
  return NextResponse.json({ overrides: await getContactOverrides() });
}

export async function PUT(req: Request) {
  const user = await currentUser();
  if (user && !canEditOwnership(user)) {
    return NextResponse.json({ error: "You have view-only access to ownership info." }, { status: 403 });
  }
  let body: { key?: string; override?: OwnerContactOverride | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const key = (body.key ?? "").toString().trim();
  if (!key) return NextResponse.json({ error: "key (beneficiary name) required" }, { status: 400 });
  const overrides = await saveContactOverride(key, body.override ?? null);
  await logAudit({ event: body.override === null ? "ownership.contact.clear" : "ownership.contact.save", user, ip: auditIp(req), detail: key });
  return NextResponse.json({ overrides });
}

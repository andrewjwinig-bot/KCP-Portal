import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { ALL_USERS, isPathAllowed, USERS, type UserId } from "@/lib/users";
import { linkSecret, signTenantToken, type TenantLinkKind } from "@/lib/cam/tenantLink/token";
import { saveTenantLink, linksForUnit, revokeTenantLink, deleteTenantLink, type TenantLink } from "@/lib/cam/tenantLink/store";
import { getOrEmptySuiteContacts } from "@/lib/suites/contactsStorage";
import { camRecipientEmails } from "@/lib/suites/contacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function currentUser(): Promise<UserId | null> {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) return null;
  const id = await verifySiteToken((await cookies()).get(SITE_COOKIE)?.value, secret);
  return id && (ALL_USERS as readonly string[]).includes(id) && isPathAllowed(id as UserId, "/cam-recon") ? (id as UserId) : null;
}

function originOf(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("host") ?? req.nextUrl.host;
  return `${proto}://${host}`;
}
// Tenants land in the portal shell (tenant-facing sidebar: CAM/RET, Floorplan,
// Lease Terms, Statements, Service Requests, Reservations). The legacy
// /statement/[token] page redirects here, so older links resolve too.
const linkUrl = (origin: string, token: string) => `${origin}/portal/${token}`;

/** GET ?unitRef=&year= → existing links for a tenant (with their share URLs). */
export async function GET(req: NextRequest) {
  if (!(await currentUser())) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const unitRef = req.nextUrl.searchParams.get("unitRef") ?? "";
  const year = Number(req.nextUrl.searchParams.get("year"));
  const secret = linkSecret();
  if (!unitRef || !year) return NextResponse.json({ error: "unitRef and year are required" }, { status: 400 });
  const links = (await linksForUnit(unitRef, year)).filter((l) => !l.revoked);
  const withUrls = secret
    ? await Promise.all(links.map(async (l) => ({
        ...l,
        url: linkUrl(originOf(req), await signTenantToken(secret, { v: 1, id: l.id, p: l.property, u: l.unitRef, y: l.year, k: l.kind, ...(l.expiresAt ? { exp: Math.floor(new Date(l.expiresAt).getTime() / 1000) } : {}) })),
      })))
    : links.map((l) => ({ ...l, url: null }));
  // Who an "Email to tenant" would go to — the suite's statement recipients —
  // so the admin sees the addresses in the confirmation before sending.
  const contacts = await getOrEmptySuiteContacts(unitRef);
  const recipients = camRecipientEmails(contacts.contacts).split(";").map((s) => s.trim()).filter(Boolean);
  return NextResponse.json({ links: withUrls, recipients });
}

/** POST { property, unitRef, year, kind, tenantName, expiresInDays? } → mint a
 *  signed, revocable link and return its share URL. */
export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const secret = linkSecret();
  if (!secret) return NextResponse.json({ error: "Sharing is not configured (no link secret set)." }, { status: 500 });
  try {
    const body = await req.json();
    const property = String(body?.property ?? "");
    const unitRef = String(body?.unitRef ?? "");
    const year = Number(body?.year);
    const kind: TenantLinkKind = body?.kind === "office" ? "office" : "retail";
    const tenantName = String(body?.tenantName ?? "");
    if (!property || !unitRef || !year) return NextResponse.json({ error: "property, unitRef, year are required" }, { status: 400 });

    const days = Number(body?.expiresInDays);
    const expiresAt = Number.isFinite(days) && days > 0 ? new Date(Date.now() + days * 864e5).toISOString() : null;
    const id = "tl_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const rec: TenantLink = {
      id, property, unitRef, year, kind, tenantName,
      createdAt: new Date().toISOString(), createdBy: USERS[user]?.label ?? user,
      revoked: false, expiresAt, views: [], lastViewedAt: null, viewCount: 0,
    };
    await saveTenantLink(rec);
    const token = await signTenantToken(secret, { v: 1, id, p: property, u: unitRef, y: year, k: kind, ...(expiresAt ? { exp: Math.floor(new Date(expiresAt).getTime() / 1000) } : {}) });
    return NextResponse.json({ link: rec, url: linkUrl(originOf(req), token) }, { status: 201 });
  } catch (err: any) {
    console.error("[POST /api/cam-recon/tenant-link]", err?.message ?? err);
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}

/** DELETE ?id=&purge=1 → revoke (default) or hard-delete a link. */
export async function DELETE(req: NextRequest) {
  if (!(await currentUser())) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  if (req.nextUrl.searchParams.get("purge") === "1") await deleteTenantLink(id);
  else await revokeTenantLink(id);
  return NextResponse.json({ ok: true });
}

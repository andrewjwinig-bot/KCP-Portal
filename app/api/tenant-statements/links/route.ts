import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { ALL_USERS, isPathAllowed, type UserId } from "@/lib/users";
import { linkSecret, signTenantToken, type TenantLinkKind } from "@/lib/cam/tenantLink/token";
import { listTenantLinks } from "@/lib/cam/tenantLink/store";
import { statementYearsForUnit } from "@/lib/cam/statementYears";
import { getRun } from "@/lib/statements/store";
import { PROPERTY_DEFS } from "@/lib/properties/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function currentUser(): Promise<UserId | null> {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) return null;
  const id = await verifySiteToken((await cookies()).get(SITE_COOKIE)?.value, secret);
  if (!id || !(ALL_USERS as readonly string[]).includes(id)) return null;
  return isPathAllowed(id as UserId, "/tenant-statements") ? (id as UserId) : null;
}

function originOf(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${req.headers.get("host") ?? req.nextUrl.host}`;
}

/** Office buildings mint office links; everything else is retail. */
function kindFor(propertyCode: string): TenantLinkKind {
  const def = PROPERTY_DEFS.find((p) => p.id.toUpperCase() === propertyCode.toUpperCase());
  return def?.type === "Office" ? "office" : "retail";
}

/**
 * GET ?period=YYYY-MM — portal-link status for every tenant on that month, so
 * the roster can show who has a live link without a request per row.
 *
 * Also resolves WHICH (year, kind) a link for each tenant should use, because
 * links are keyed by unit+year: an existing link's own year wins (so the page
 * never shows a second, competing link), then the tenant's newest
 * reconciliation year, then the statement's year for a tenant who has never
 * been reconciled. That last case is the point — a tenant with a monthly
 * statement and no recon still needs a portal.
 */
export async function GET(req: NextRequest) {
  if (!(await currentUser())) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const period = req.nextUrl.searchParams.get("period") ?? "";
  const run = await getRun(period);
  if (!run) return NextResponse.json({ error: "No statements for that period." }, { status: 404 });

  const secret = linkSecret();
  const all = await listTenantLinks();
  const activeByUnit = new Map<string, (typeof all)[number]>();
  for (const l of all) {
    if (l.revoked) continue;
    const key = l.unitRef.toUpperCase();
    const cur = activeByUnit.get(key);
    if (!cur || (l.createdAt ?? "") > (cur.createdAt ?? "")) activeByUnit.set(key, l);
  }

  const statementYear = Number(period.slice(0, 4));
  const origin = originOf(req);

  const tenants = await Promise.all(run.statements.map(async (st) => {
    const existing = activeByUnit.get(st.unitRef.toUpperCase()) ?? null;
    const kind = existing?.kind ?? kindFor(st.propertyCode);
    const reconYears = statementYearsForUnit(kind, st.propertyCode, st.unitRef);
    const year = existing?.year ?? reconYears[0] ?? statementYear;
    const url = existing && secret
      ? `${origin}/portal/${await signTenantToken(secret, {
          v: 1, id: existing.id, p: existing.property, u: existing.unitRef, y: existing.year, k: existing.kind,
          ...(existing.expiresAt ? { exp: Math.floor(new Date(existing.expiresAt).getTime() / 1000) } : {}),
        })}`
      : null;
    return {
      unitRef: st.unitRef,
      year, kind,
      link: existing ? {
        id: existing.id, url, createdAt: existing.createdAt, createdBy: existing.createdBy ?? null,
        viewCount: existing.viewCount ?? 0, lastViewedAt: existing.lastViewedAt ?? null,
        hasPin: !!existing.pin, expiresAt: existing.expiresAt ?? null,
      } : null,
    };
  }));

  return NextResponse.json({
    ok: true,
    configured: !!secret,
    shared: tenants.filter((t) => t.link).length,
    viewed: tenants.filter((t) => (t.link?.viewCount ?? 0) > 0).length,
    tenants,
  });
}

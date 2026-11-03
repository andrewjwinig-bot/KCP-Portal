import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { ALL_USERS, isPathAllowed, type UserId } from "@/lib/users";
import { resolveStatementKey } from "@/lib/financials/operating-statements/mappingStore";
import { loadReprojection } from "@/lib/financials/reprojections/load";
import { performanceOf } from "@/lib/properties/performance";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function currentUser(): Promise<UserId | null> {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) return null;
  const id = await verifySiteToken((await cookies()).get(SITE_COOKIE)?.value, secret);
  return id && (ALL_USERS as readonly string[]).includes(id) ? (id as UserId) : null;
}

/** The property dashboard's actual-vs-budget panel. /api/properties is open to
 *  everyone signed in, so the financials gate is applied HERE: only someone who
 *  can open the operating statements sees a property's NOI. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!isPathAllowed(user, "/financials/operating-statements")) return NextResponse.json({ performance: null }, { status: 403 });
  try {
    const key = await resolveStatementKey(params.id);
    if (!key) return NextResponse.json({ performance: null });
    const year = Number(req.nextUrl.searchParams.get("year")) || new Date().getFullYear();
    const loaded = await loadReprojection(key, year);
    if (!loaded) return NextResponse.json({ performance: null });
    return NextResponse.json({ performance: performanceOf(key, loaded.reprojection) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to load performance" }, { status: 500 });
  }
}

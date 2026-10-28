import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { accessGroup, ALL_USERS, isPathAllowed, type UserId } from "@/lib/users";
import { buildStaffPlan } from "@/lib/centers/designed/staffPlan";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function currentUser(): Promise<UserId | null> {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) return null;
  const id = await verifySiteToken((await cookies()).get(SITE_COOKIE)?.value, secret);
  return id && (ALL_USERS as readonly string[]).includes(id) ? (id as UserId) : null;
}

/** The property page's internal site plan. /api/properties is open to every
 *  signed-in user, so what it carries is decided HERE, on the server: rents and
 *  recoveries never reach the service logins (the property page's rent roll
 *  hides them from maintenance too), and open A/R only reaches someone who can
 *  open Monthly Statements. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    const plan = await buildStaffPlan(params.id, {
      money: accessGroup(user) !== "service",
      ar: isPathAllowed(user, "/tenant-statements"),
    });
    return NextResponse.json({ plan });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to load the site plan" }, { status: 500 });
  }
}

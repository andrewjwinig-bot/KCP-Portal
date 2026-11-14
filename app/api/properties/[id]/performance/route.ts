import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { ALL_USERS, isPathAllowed, type UserId } from "@/lib/users";
import { resolveStatementKey } from "@/lib/financials/operating-statements/mappingStore";
import { loadReprojection } from "@/lib/financials/reprojections/load";
import { performanceOf } from "@/lib/properties/performance";
import { loadSnapshots } from "@/lib/financials/bank-balances/store";
import { balanceTrend } from "@/lib/financials/bank-balances/trend";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function currentUser(): Promise<UserId | null> {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) return null;
  const id = await verifySiteToken((await cookies()).get(SITE_COOKIE)?.value, secret);
  return id && (ALL_USERS as readonly string[]).includes(id) ? (id as UserId) : null;
}

/** The property dashboard's actual-vs-budget panel and bank-balance trend.
 *  /api/properties is open to everyone signed in, so the gates are applied
 *  HERE: NOI only to someone who can open the operating statements, the bank
 *  balance only to someone who can open Bank Balances. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const seeStatements = isPathAllowed(user, "/financials/operating-statements");
  const seeBank = isPathAllowed(user, "/financials/cash-analysis");
  if (!seeStatements && !seeBank) return NextResponse.json({ performance: null, bank: null }, { status: 403 });
  try {
    const year = Number(req.nextUrl.searchParams.get("year")) || new Date().getFullYear();
    const [performance, bank] = await Promise.all([
      seeStatements ? (async () => {
        const key = await resolveStatementKey(params.id);
        const loaded = key ? await loadReprojection(key, year) : null;
        return loaded && key ? performanceOf(key, loaded.reprojection) : null;
      })() : null,
      // The bank balance over time — its own gate (Harry reads Bank Balances, not statements).
      seeBank ? loadSnapshots().then((s) => balanceTrend(params.id, s)).catch(() => null) : null,
    ]);
    return NextResponse.json({ performance, bank });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to load performance" }, { status: 500 });
  }
}

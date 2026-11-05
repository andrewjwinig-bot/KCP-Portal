import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { ALL_USERS, canEditOwnership, type UserId } from "@/lib/users";
import { getOwnersForProperty } from "@/lib/properties/ownership";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import { computeWithholding, hasWithholding, sanitizeDoc } from "@/lib/investors/paNrWithholding";
import { getWithholdingDoc, setWithholdingDoc } from "@/lib/investors/paNrWithholdingStore";
import { buildWithholdingXlsx } from "@/lib/investors/paNrWithholdingExport";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function currentUser(): Promise<UserId | null> {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) return null;
  const id = await verifySiteToken((await cookies()).get(SITE_COOKIE)?.value, secret);
  return id && (ALL_USERS as readonly string[]).includes(id) ? (id as UserId) : null;
}

const yearOf = (req: NextRequest) => {
  const y = Number(req.nextUrl.searchParams.get("year"));
  return Number.isInteger(y) && y > 2000 && y < 2100 ? y : new Date().getFullYear();
};

/** The PA nonresident withholding calculator for a partnership's distribution.
 *  /api/properties is open to everyone signed in, so the gate is HERE: the
 *  people who maintain Investor Info (`canEditOwnership`). */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!canEditOwnership(user)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const code = params.id.toUpperCase();
  if (!hasWithholding(code)) return NextResponse.json({ error: "No calculator for this property" }, { status: 404 });
  try {
    const year = yearOf(req);
    const owners = getOwnersForProperty(code);
    const { doc, saved } = await getWithholdingDoc(code, year);
    const result = computeWithholding(owners, doc);
    if (req.nextUrl.searchParams.get("format") === "xlsx") {
      const entity = PROPERTY_DEFS.find((p) => p.id === code)?.name ?? code;
      const buf = await buildWithholdingXlsx({ entity, year, result });
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${year} Distribution PA NR WH - ${entity.replace(/[^\w &.-]/g, "")}.xlsx"`,
        },
      });
    }
    return NextResponse.json({ year, saved, doc, result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to load" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!canEditOwnership(user)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const code = params.id.toUpperCase();
  if (!hasWithholding(code)) return NextResponse.json({ error: "No calculator for this property" }, { status: 404 });
  try {
    const year = yearOf(req);
    const owners = getOwnersForProperty(code);
    const doc = { ...sanitizeDoc(await req.json(), owners), updatedBy: user, updatedAt: new Date().toISOString() };
    await setWithholdingDoc(code, year, doc);
    return NextResponse.json({ year, saved: true, doc, result: computeWithholding(owners, doc) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to save" }, { status: 500 });
  }
}

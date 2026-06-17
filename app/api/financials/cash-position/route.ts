import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getWeekSeeded, listWeeks, applyEdit } from "@/lib/financials/cash-position/store";
import { CASH_POSITION_GROUPS, CASH_POSITION_BUCKETS, weekEndingFriday, type CashPositionBucket } from "@/lib/financials/cash-position/model";
import { logAudit, auditIp } from "@/lib/audit";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { ALL_USERS, canEditCashSheet, type UserId } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const BUCKET_KEYS = new Set(CASH_POSITION_BUCKETS.map((b) => b.key));

async function currentUser(): Promise<UserId | null> {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) return null;
  const token = (await cookies()).get(SITE_COOKIE)?.value;
  const id = await verifySiteToken(token, secret);
  return id && (ALL_USERS as readonly string[]).includes(id) ? (id as UserId) : null;
}

// GET ?week=YYYY-MM-DD (defaults to the current week-ending Friday). Returns the
// entity layout, the week's saved/seeded entries, the list of saved weeks, and
// whether this user may edit.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const week = url.searchParams.get("week") || weekEndingFriday();
  const [doc, weeks, user] = await Promise.all([getWeekSeeded(week), listWeeks(), currentUser()]);
  return NextResponse.json({
    week,
    groups: CASH_POSITION_GROUPS,
    buckets: CASH_POSITION_BUCKETS,
    entries: doc.entries,
    updatedAt: doc.updatedAt || null,
    updatedBy: doc.updatedBy ?? null,
    weeks,
    canEdit: user ? canEditCashSheet(user) : true,
  });
}

// POST — single-cell edit. Body { week, code, bucket?, value?, note? }.
// View-only users (e.g. Alison) are rejected server-side.
export async function POST(req: Request) {
  try {
    const user = await currentUser();
    if (user && !canEditCashSheet(user)) {
      return NextResponse.json({ error: "You have view-only access to the Cash Position." }, { status: 403 });
    }
    const body = await req.json();
    const week = String(body?.week ?? "");
    const code = String(body?.code ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(week) || !code) {
      return NextResponse.json({ error: "week (YYYY-MM-DD) and code are required" }, { status: 400 });
    }
    const bucket = body?.bucket as CashPositionBucket | undefined;
    if (bucket && !BUCKET_KEYS.has(bucket)) {
      return NextResponse.json({ error: "Unknown bucket" }, { status: 400 });
    }
    const value = body?.value === null || body?.value === undefined ? null : Number(body.value);
    if (bucket && value != null && !Number.isFinite(value)) {
      return NextResponse.json({ error: "value must be a number" }, { status: 400 });
    }
    const note = typeof body?.note === "string" ? body.note : undefined;
    const doc = await applyEdit({ weekEnding: week, code, bucket, value, note, updatedBy: user ?? undefined });
    await logAudit({ event: "cash-position.edit", user: user ?? "unknown", ip: auditIp(req), detail: `${week} · ${code}${bucket ? ` · ${bucket}` : " · note"}` });
    return NextResponse.json({ ok: true, entries: doc.entries, updatedAt: doc.updatedAt });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to save" }, { status: 500 });
  }
}

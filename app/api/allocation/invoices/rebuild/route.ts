import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { reconstructMonth } from "@/lib/allocated-invoicer/autoProcess";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { ALL_USERS, USERS, type UserId } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function currentUserLabel(): Promise<string | undefined> {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) return undefined;
  const token = (await cookies()).get(SITE_COOKIE)?.value;
  const id = await verifySiteToken(token, secret);
  return id && (ALL_USERS as readonly string[]).includes(id) ? USERS[id as UserId].label : undefined;
}

// POST { months: ["2026-07", …] } — rebuild the invoice PDFs of months sent
// before the archive existed, from the imported full-year 2000 GL
// (`reconstructMonth`). Stamped and flagged as reconstructed; never replaces a
// month whose original PDFs are on file. Sequential — each replays the year.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const months: string[] = (Array.isArray(body?.months) ? body.months : [body?.month])
    .map((m: unknown) => String(m ?? "").trim()).filter((m: string) => /^\d{4}-\d{2}$/.test(m)).slice(0, 12);
  if (!months.length) return NextResponse.json({ error: "One or more months (YYYY-MM) are required." }, { status: 400 });
  const by = await currentUserLabel();
  const results = [];
  for (const m of months) results.push(await reconstructMonth(m, by ?? null).catch((e) => ({ ok: false as const, error: e instanceof Error ? e.message : "Rebuild failed" })));
  return NextResponse.json({ results });
}

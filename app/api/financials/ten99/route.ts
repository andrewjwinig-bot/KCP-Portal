import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { USERS } from "@/lib/users";
import { assembledGl, assembledTransactions, listGls } from "@/lib/financials/operating-statements/statementStore";
import { buildRegister, DEFAULT_THRESHOLD, type GlInput } from "@/lib/financials/ten99/register";
import { allExclusions, clearExclusion, setExclusion } from "@/lib/financials/ten99/exclusionStore";
import { isReason } from "@/lib/financials/ten99/exclusions";
import { logAudit, auditIp } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Middleware already gates /api/financials to the /financials page prefix;
 *  this is only for stamping who marked an exclusion. */
async function currentLabel(): Promise<string | null> {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) return null;
  const id = await verifySiteToken((await cookies()).get(SITE_COOKIE)?.value, secret);
  return id ? (USERS[id as keyof typeof USERS]?.label ?? id) : null;
}

/** GET ?year=&threshold= — the register for one calendar year. */
export async function GET(req: NextRequest) {
  const metas = await listGls();
  const years = [...new Set(metas.map((g) => g.year))].sort((a, b) => b - a);

  const asked = Number(req.nextUrl.searchParams.get("year"));
  const year = Number.isFinite(asked) && asked > 0 ? asked : (years[0] ?? new Date().getFullYear() - 1);
  // An absent param must fall back to $600 — Number(null) is 0, which would
  // silently turn the register into "every vendor we paid a cent".
  const raw = req.nextUrl.searchParams.get("threshold");
  const t = raw == null ? NaN : Number(raw);
  const threshold = Number.isFinite(t) && t >= 0 ? t : DEFAULT_THRESHOLD;

  // One GL key per property/fund that has an upload for the year. Transactions
  // come from the canonical accessor so revisions and interim posting deltas are
  // merged exactly as every other page sees them.
  const keys = [...new Set(metas.filter((g) => g.year === year).map((g) => g.key))];
  const gls: GlInput[] = [];
  for (const key of keys) {
    const [transactions, gl] = await Promise.all([
      assembledTransactions(key, year),
      assembledGl(key, year),
    ]);
    gls.push({ key, transactions, names: gl?.names ?? {} });
  }

  const exclusions = await allExclusions();
  const entities = buildRegister(gls, { threshold, excluded: new Set(Object.keys(exclusions)) });

  return NextResponse.json({ ok: true, year, years, threshold, entities, exclusions });
}

/** POST { vendorId, name, reason } — mark a vendor as not reportable.
 *  DELETE ?vendorId= — put it back on the list. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const vendorId = String(body?.vendorId ?? "").trim();
  const name = String(body?.name ?? "").trim();
  const reason = body?.reason;
  if (!vendorId || !name) return NextResponse.json({ error: "vendorId and name are required." }, { status: 400 });
  if (!isReason(reason)) return NextResponse.json({ error: "Pick a reason." }, { status: 400 });

  const by = await currentLabel();
  await setExclusion(vendorId, { name, reason, by, at: new Date().toISOString() });
  await logAudit({ event: "1099.exclude", user: by ?? "unknown", ip: auditIp(req), detail: `${name} — ${reason}` });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const vendorId = (req.nextUrl.searchParams.get("vendorId") ?? "").trim();
  if (!vendorId) return NextResponse.json({ error: "vendorId is required." }, { status: 400 });
  const by = await currentLabel();
  await clearExclusion(vendorId);
  await logAudit({ event: "1099.include", user: by ?? "unknown", ip: auditIp(req), detail: vendorId });
  return NextResponse.json({ ok: true });
}

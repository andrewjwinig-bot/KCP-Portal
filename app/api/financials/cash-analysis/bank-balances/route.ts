import { NextResponse } from "next/server";
import { getBankBalances, setBankBalance } from "@/lib/financials/cash-analysis/bankBalanceStore";
import { parseMonthKey } from "@/lib/financials/cash-sheet/util";
import { logAudit, auditIp } from "@/lib/audit";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { ALL_USERS, canEditCashSheet, type UserId } from "@/lib/users";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function currentUser(): Promise<UserId | null> {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) return null;
  const token = (await cookies()).get(SITE_COOKIE)?.value;
  const id = await verifySiteToken(token, secret);
  return id && (ALL_USERS as readonly string[]).includes(id) ? (id as UserId) : null;
}

// GET ?ym=YYYY-MM → { ym, balances: { <last4>: { amount, updatedAt } } }
export async function GET(req: Request) {
  const ym = new URL(req.url).searchParams.get("ym") ?? "";
  if (!parseMonthKey(ym)) return NextResponse.json({ error: "Valid ym (YYYY-MM) required" }, { status: 400 });
  const doc = await getBankBalances(ym);
  return NextResponse.json({ ym, balances: doc?.balances ?? {} });
}

// POST { ym, last4, amount } — set one account's actual bank balance (null clears).
// View-only users (e.g. Alison) are rejected.
export async function POST(req: Request) {
  try {
    const user = await currentUser();
    if (user && !canEditCashSheet(user)) {
      return NextResponse.json({ error: "You have view-only access to the Cash Sheet." }, { status: 403 });
    }
    const { ym, last4, amount } = (await req.json()) ?? {};
    if (!parseMonthKey(typeof ym === "string" ? ym : "")) return NextResponse.json({ error: "Valid ym required" }, { status: 400 });
    if (typeof last4 !== "string" || !last4) return NextResponse.json({ error: "last4 required" }, { status: 400 });
    const num = Number(amount);
    const value: number | null = amount == null || amount === "" ? null : (Number.isFinite(num) ? num : null);
    const doc = await setBankBalance({ ym, last4, amount: value, updatedBy: user ?? undefined });
    await logAudit({ event: "bank-balance.edit", user: user ?? last4, ip: auditIp(req), detail: `${ym} · ${last4} = ${value}` });
    return NextResponse.json({ ok: true, balances: doc.balances });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to save" }, { status: 500 });
  }
}

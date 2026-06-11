import { NextResponse } from "next/server";
import { getMonth, listMonths, carriedReserves, applyEdit } from "@/lib/financials/cash-sheet/store";
import { startingCashFor } from "@/lib/financials/cash-sheet/startingCash";
import { anticipatedRevenueFor } from "@/lib/financials/cash-sheet/revenue";
import { cashSheetGroups, cashSheetCodes, cashSheetFundCodes, wednesdaysInMonth, parseMonthKey, monthKey } from "@/lib/financials/cash-sheet/util";
import { logAudit, auditIp } from "@/lib/audit";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { ALL_USERS, canEditCashSheet, type UserId } from "@/lib/users";
import { cookies } from "next/headers";

const EDIT_KINDS = ["reserves", "bill", "startingOverride", "endingOverride"] as const;
type EditKind = (typeof EDIT_KINDS)[number];

/** The signed-in user from the site cookie (authoritative — not client-supplied). */
async function currentUser(): Promise<UserId | null> {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) return null;
  const token = (await cookies()).get(SITE_COOKIE)?.value;
  const id = await verifySiteToken(token, secret);
  return id && (ALL_USERS as readonly string[]).includes(id) ? (id as UserId) : null;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET ?ym=YYYY-MM (defaults to the current month). Returns everything the page
// needs: the fund groups, the month's Wednesdays, the starting cash pulled from
// Operating Statements, the saved manual rows, and the reserves carried in from
// the prior month (for prefill before the month is first edited).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const now = new Date();
  const ymParam = url.searchParams.get("ym");
  const parsed = ymParam ? parseMonthKey(ymParam) : null;
  const year = parsed?.year ?? now.getFullYear();
  const month = parsed?.month ?? now.getMonth() + 1;
  const ym = monthKey(year, month);

  // Property codes for per-property funds + the fund-level GL codes (PJV3, …)
  // whose cash is pooled into one bank account.
  const codes = [...cashSheetCodes(), ...cashSheetFundCodes()];
  const [doc, carried, starting, revenueData, months] = await Promise.all([
    getMonth(ym),
    carriedReserves(year, month),
    startingCashFor(codes, year, month),
    anticipatedRevenueFor(year, month),
    listMonths(),
  ]);

  return NextResponse.json({
    ym,
    year,
    month,
    groups: cashSheetGroups(),
    wednesdays: wednesdaysInMonth(year, month),
    starting,
    revenue: revenueData.byCode,
    mgmtFee: revenueData.mgmtFee,
    rows: doc?.rows ?? {},
    carriedReserves: carried,
    months,
    updatedAt: doc?.updatedAt ?? null,
  });
}

// POST — single-cell edit. Body:
//   { ym, code, kind: "reserves"|"bill"|"startingOverride"|"endingOverride",
//     wednesday?, value (null clears an override) }
// View-only users (e.g. Alison) are rejected server-side.
export async function POST(req: Request) {
  try {
    const user = await currentUser();
    if (user && !canEditCashSheet(user)) {
      return NextResponse.json({ error: "You have view-only access to the Cash Sheet." }, { status: 403 });
    }
    const body = await req.json();
    const { ym, code, kind, wednesday, value } = body ?? {};
    const parsed = typeof ym === "string" ? parseMonthKey(ym) : null;
    if (!parsed) return NextResponse.json({ error: "Valid ym (YYYY-MM) required" }, { status: 400 });
    if (typeof code !== "string" || !code) return NextResponse.json({ error: "code required" }, { status: 400 });
    if (!EDIT_KINDS.includes(kind)) return NextResponse.json({ error: `kind must be one of ${EDIT_KINDS.join(", ")}` }, { status: 400 });
    if (kind === "bill" && (typeof wednesday !== "string" || !wednesday)) {
      return NextResponse.json({ error: "wednesday required for bill edits" }, { status: 400 });
    }
    // Overrides accept null (clear); other kinds coerce to a number.
    const num = Number(value);
    const isOverride = kind === "startingOverride" || kind === "endingOverride";
    const amount: number | null = value == null && isOverride ? null : (Number.isFinite(num) ? num : 0);

    const doc = await applyEdit({
      year: parsed.year,
      month: parsed.month,
      code,
      kind: kind as EditKind,
      wednesday: kind === "bill" ? wednesday : undefined,
      value: amount,
      updatedBy: user ?? undefined,
    });
    await logAudit({
      event: "cash-sheet.edit",
      user: user ?? code,
      ip: auditIp(req),
      detail: `${ym} · ${code} · ${kind === "bill" ? `bills ${wednesday}` : kind} = ${amount}`,
    });
    return NextResponse.json({ ok: true, rows: doc.rows, updatedAt: doc.updatedAt });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to save" }, { status: 500 });
  }
}

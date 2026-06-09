import { NextResponse } from "next/server";
import { getMonth, listMonths, carriedReserves, applyEdit } from "@/lib/financials/cash-sheet/store";
import { startingCashFor } from "@/lib/financials/cash-sheet/startingCash";
import { cashSheetGroups, cashSheetCodes, wednesdaysInMonth, parseMonthKey, monthKey } from "@/lib/financials/cash-sheet/util";
import { logAudit, auditIp } from "@/lib/audit";

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

  const codes = cashSheetCodes();
  const [doc, carried, starting, months] = await Promise.all([
    getMonth(ym),
    carriedReserves(year, month),
    startingCashFor(codes, year, month),
    listMonths(),
  ]);

  return NextResponse.json({
    ym,
    year,
    month,
    groups: cashSheetGroups(),
    wednesdays: wednesdaysInMonth(year, month),
    starting,
    rows: doc?.rows ?? {},
    carriedReserves: carried,
    months,
    updatedAt: doc?.updatedAt ?? null,
  });
}

// POST — single-cell edit. Body:
//   { ym, code, kind: "reserves" | "bill", wednesday?, value, editedBy? }
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { ym, code, kind, wednesday, value, editedBy } = body ?? {};
    const parsed = typeof ym === "string" ? parseMonthKey(ym) : null;
    if (!parsed) return NextResponse.json({ error: "Valid ym (YYYY-MM) required" }, { status: 400 });
    if (typeof code !== "string" || !code) return NextResponse.json({ error: "code required" }, { status: 400 });
    if (kind !== "reserves" && kind !== "bill") return NextResponse.json({ error: "kind must be 'reserves' or 'bill'" }, { status: 400 });
    if (kind === "bill" && (typeof wednesday !== "string" || !wednesday)) {
      return NextResponse.json({ error: "wednesday required for bill edits" }, { status: 400 });
    }
    const num = Number(value);
    const amount = Number.isFinite(num) ? num : 0;

    const doc = await applyEdit({
      year: parsed.year,
      month: parsed.month,
      code,
      kind,
      wednesday: kind === "bill" ? wednesday : undefined,
      value: amount,
      updatedBy: typeof editedBy === "string" ? editedBy : undefined,
    });
    await logAudit({
      event: "cash-sheet.edit",
      user: typeof editedBy === "string" ? editedBy : code,
      ip: auditIp(req),
      detail: `${ym} · ${code} · ${kind === "bill" ? `bills ${wednesday}` : "reserves"} = ${amount}`,
    });
    return NextResponse.json({ ok: true, rows: doc.rows, updatedAt: doc.updatedAt });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to save" }, { status: 500 });
  }
}

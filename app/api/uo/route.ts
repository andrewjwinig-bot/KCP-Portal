// Philadelphia U&O — the month's returns (behind /uo-tax by the middleware).
//
//   GET  ?month=YYYY-MM              the returns, delinquents, billed check, stage
//   GET  ?status=1                   where this month stands (the dashboard)
//   GET  ?month=&export=je           the payment JE (Skyline's Standard JE Import)
//   GET  ?month=&export=charges      U&O by tenant (the "No Exemptions" sheet)
//   POST { action: "delinquents", month, units }   save the list (Greg / Harry / Nancy)
//   POST { action: "confirm", month, units }       confirm it — Drew gets the returns
//   POST { action: "filed" | "unfile", month, code }        Drew marks a return filed
//   POST { action: "discount", month, code, take }          the 1% taken or not
//   POST { action: "exempt", unitRef, exempt, reason? }     a tenant the City does not tax
//   POST { action: "assessed", parcel, year, value | null } the value on the City's form

import { NextResponse } from "next/server";
import { budgetUser } from "@/lib/financials/budgets/currentUser";
import { USERS, type UserId } from "@/lib/users";
import { etToday } from "@/lib/statements/reminderSchedule";
import { loadUoMonth } from "@/lib/uo/load";
import { emptyMonth, getUoMonth, getUoSettings, saveUoMonth, saveUoSettings } from "@/lib/uo/store";
import { chargesWorkbook } from "@/lib/uo/chargesExport";
import { confirmDelinquents, dueOn, fileByOn, jeFileName, jeFor, jeWorkbook, markFiled, monthName, reviewOpensOn, stageOf, unmarkFiled } from "@/lib/uo/cycle";
import { uoProperty } from "@/lib/uo/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Who confirms the delinquents (owner: "let harry, nancy, and greg mark as delinquent"). */
const REVIEWERS: UserId[] = ["greg", "harry", "nancy", "drew", "alison", "admin"] as UserId[];
/** Who files the returns and sets exemptions / assessed values. */
const FILERS: UserId[] = ["drew", "alison", "admin"] as UserId[];

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const nameOf = (u: UserId) => {
  const l = USERS[u]?.label ?? u;
  return l.charAt(0).toUpperCase() + l.slice(1).toLowerCase();
};

export async function GET(req: Request) {
  const user = await budgetUser();
  const url = new URL(req.url);
  const today = etToday();
  const month = MONTH_RE.test(url.searchParams.get("month") ?? "") ? url.searchParams.get("month")! : today.slice(0, 7);
  // The dashboard's action item: just where the month stands.
  if (url.searchParams.get("status")) {
    const rec = (await getUoMonth(month)) ?? emptyMonth(month);
    return NextResponse.json({ ok: true, month, stage: stageOf(rec, today), confirmedAt: rec.confirmedAt ?? null, fileBy: fileByOn(month), due: dueOn(month), canReview: !!user && REVIEWERS.includes(user) });
  }
  const view = await loadUoMonth(month);
  const exp = url.searchParams.get("export");
  if (exp === "je") {
    return new NextResponse(new Uint8Array(jeWorkbook(jeFor(view))), {
      headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${jeFileName(month)}"` },
    });
  }
  if (exp === "charges") {
    return new NextResponse(new Uint8Array(await chargesWorkbook(view, monthName(month))), {
      headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${month} U&O by Tenant.xlsx"` },
    });
  }
  return NextResponse.json({
    ok: true, ...view, je: jeFor(view),
    stage: stageOf(view.record, today),
    dates: { reviewOpens: reviewOpensOn(month), fileBy: fileByOn(month), due: dueOn(month) },
    canReview: !!user && REVIEWERS.includes(user),
    canFile: !!user && FILERS.includes(user),
  });
}

export async function POST(req: Request) {
  const user = await budgetUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const by = nameOf(user);
  const month: string = MONTH_RE.test(body.month ?? "") ? body.month : etToday().slice(0, 7);
  const units: string[] = Array.isArray(body.units) ? body.units.map(String) : [];
  const action = String(body.action ?? "");

  if (action === "delinquents" || action === "confirm") {
    if (!REVIEWERS.includes(user)) return NextResponse.json({ error: "Only Greg, Harry, Nancy or Drew can mark delinquents." }, { status: 403 });
    // A filed return keeps the list it was filed with (frozen on `filed`).
    if (action === "confirm") return NextResponse.json({ ok: true, record: await confirmDelinquents(month, units, by) });
    const rec = await getUoMonth(month) ?? emptyMonth(month);
    rec.delinquents = [...new Set(units.map((u) => u.toUpperCase()))];
    rec.updatedAt = new Date().toISOString(); rec.updatedBy = by;
    await saveUoMonth(rec);
    return NextResponse.json({ ok: true, record: rec });
  }

  if (!FILERS.includes(user)) return NextResponse.json({ error: "Only Drew files the U&O returns." }, { status: 403 });

  if (action === "filed" || action === "unfile") {
    const code = String(body.code ?? "").toUpperCase();
    if (!uoProperty(code)) return NextResponse.json({ error: `${code} does not file U&O.` }, { status: 400 });
    const record = action === "filed" ? await markFiled(month, code, by) : await unmarkFiled(month, code);
    return NextResponse.json({ ok: true, record });
  }
  if (action === "discount") {
    const code = String(body.code ?? "").toUpperCase();
    const rec = await getUoMonth(month) ?? emptyMonth(month);
    const skip = new Set(rec.skipDiscount ?? []);
    if (body.take) skip.delete(code); else skip.add(code);
    rec.skipDiscount = [...skip];
    await saveUoMonth(rec);
    return NextResponse.json({ ok: true, record: rec });
  }
  if (action === "exempt") {
    const ref = String(body.unitRef ?? "").toUpperCase();
    if (!ref) return NextResponse.json({ error: "Which suite?" }, { status: 400 });
    const s = await getUoSettings();
    if (body.exempt) {
      s.exempt[ref] = String(body.reason ?? "").trim() || "Exempt";
      s.notExempt = s.notExempt.filter((x) => x !== ref);
    } else {
      delete s.exempt[ref];
      if (!s.notExempt.includes(ref)) s.notExempt.push(ref);
    }
    s.updatedAt = new Date().toISOString(); s.updatedBy = by;
    await saveUoSettings(s);
    return NextResponse.json({ ok: true });
  }
  if (action === "assessed") {
    const parcel = String(body.parcel ?? ""), year = Number(body.year);
    if (!/^\d{9}$/.test(parcel) || !year) return NextResponse.json({ error: "Which parcel and year?" }, { status: 400 });
    const s = await getUoSettings();
    const key = `${parcel}:${year}`;
    const v = Number(body.value);
    if (v > 0) s.assessed[key] = Math.round(v); else delete s.assessed[key];
    s.updatedAt = new Date().toISOString(); s.updatedBy = by;
    await saveUoSettings(s);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}

import { NextResponse } from "next/server";
import { editLineOverride } from "@/lib/financials/budgets/lineOverrideStore";
import { lineKey } from "@/lib/financials/budgets/lineOverrides";
import { budgetUser } from "@/lib/financials/budgets/currentUser";
import { lineEditScope, scopeAllowsLine } from "@/lib/financials/budgets/contributors";
import { USERS } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// POST { year, propertyCode, section, label, account?, month: 0–11 | "all", value: number | null }
//   account → types one SUB-LINE (a GL account under the line); the line is then their sum
//   one month      → types that month (null hands it back to the computed figure)
//   "all" + number → an annual figure spread evenly across the twelve
//   "all" + null   → clears every typed month on the line
export async function POST(req: Request) {
  try {
    const user = await budgetUser();
    if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    const scope = lineEditScope(user);
    if (!scope) return NextResponse.json({ error: "Only Drew can type figures into the budget." }, { status: 403 });

    const b = await req.json();
    const year = Number(b?.year);
    const propertyCode = String(b?.propertyCode ?? "").trim();
    const section = String(b?.section ?? "");
    const label = String(b?.label ?? "");
    if (!year || !propertyCode || !section || !label) {
      return NextResponse.json({ error: "year, propertyCode, section and label are required" }, { status: 400 });
    }
    if (!scopeAllowsLine(scope, section, label)) {
      return NextResponse.json({ error: "That line is Drew's to set." }, { status: 403 });
    }
    const month = b?.month === "all" ? "all" : Number(b?.month);
    if (month !== "all" && !(Number.isInteger(month) && month >= 0 && month < 12)) {
      return NextResponse.json({ error: "month must be 0–11 or \"all\"" }, { status: 400 });
    }
    // `months` sets all twelve at once (a suggestion applied with its shape kept).
    const monthsIn = Array.isArray(b?.months) ? (b.months as unknown[]).map(Number) : null;
    if (monthsIn && (monthsIn.length !== 12 || !monthsIn.every((v) => Number.isFinite(v)))) {
      return NextResponse.json({ error: "months must be 12 numbers" }, { status: 400 });
    }
    const raw = b?.value;
    const value = monthsIn ?? (raw === null || raw === "" || raw === undefined ? null : Number(raw));
    if (typeof value === "number" && !Number.isFinite(value)) return NextResponse.json({ error: "value must be a number" }, { status: 400 });

    const account = String(b?.account ?? "").trim();
    const key = account ? `${lineKey(section, label)}#${account}` : lineKey(section, label);
    await editLineOverride(year, propertyCode, key, month, value, USERS[user]?.label ?? user);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}

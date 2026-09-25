import { NextResponse } from "next/server";
import { setLineNote } from "@/lib/financials/budgets/lineNoteStore";
import { lineKey } from "@/lib/financials/budgets/lineOverrides";
import { budgetUser } from "@/lib/financials/budgets/currentUser";
import { USERS } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// POST { year, propertyCode, section, label, text } — text "" removes the note.
// Anyone who can open the budget can leave a note; it is stamped with who.
export async function POST(req: Request) {
  try {
    const user = await budgetUser();
    if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    const b = await req.json();
    const year = Number(b?.year);
    const propertyCode = String(b?.propertyCode ?? "").trim();
    const section = String(b?.section ?? "");
    const label = String(b?.label ?? "");
    if (!year || !propertyCode || !section || !label) {
      return NextResponse.json({ error: "year, propertyCode, section and label are required" }, { status: 400 });
    }
    const notes = await setLineNote(year, propertyCode, lineKey(section, label), String(b?.text ?? ""), USERS[user]?.label ?? user);
    return NextResponse.json({ ok: true, notes });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}

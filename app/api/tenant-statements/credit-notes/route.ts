import { NextResponse } from "next/server";
import { setCreditNote } from "@/lib/statements/creditNoteStore";
import { budgetUser } from "@/lib/financials/budgets/currentUser";
import { USERS } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// POST { unitRef, text } — the follow-up note on a tenant's open credit; "" clears it.
// Behind /tenant-statements by the middleware; stamped with who wrote it.
export async function POST(req: Request) {
  try {
    const user = await budgetUser();
    const b = await req.json().catch(() => ({}));
    const unitRef = String(b?.unitRef ?? "").trim();
    if (!unitRef) return NextResponse.json({ error: "unitRef is required" }, { status: 400 });
    const note = await setCreditNote(unitRef, String(b?.text ?? ""), user ? USERS[user]?.label ?? user : null);
    return NextResponse.json({ ok: true, note });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
